import * as ComAtprotoRepoCreateRecord from "@atcute/atproto/types/repo/createRecord";
import * as ComAtprotoRepoDeleteRecord from "@atcute/atproto/types/repo/deleteRecord";
import * as ComAtprotoRepoListRecords from "@atcute/atproto/types/repo/listRecords";
import * as ComAtprotoRepoPutRecord from "@atcute/atproto/types/repo/putRecord";
import { Client, ok } from "@atcute/client";
import { type Did, isTid, parseCanonicalResourceUri } from "@atcute/lexicons/syntax";
import { safeParse } from "@atcute/lexicons/validations";
import { PasswordSession } from "@atcute/password-session";
import * as SiteStandardDocument from "@atcute/standard-site/types/document";
import * as SiteStandardPublication from "@atcute/standard-site/types/publication";

const ATPROTO_DID: Did<"plc"> = "did:plc:4eukmtg5kmyjmp6qw3xkpite";
const ATPROTO_SERVICE = "https://bsky.social";

export type PublicationRecord = SiteStandardPublication.Main;
export type DocumentRecord = SiteStandardDocument.Main;
export type StandardSitePublication = {
    url: string;
    record: PublicationRecord;
};
export type DocumentSyncEntry = {
    path: string;
    uri?: string;
    record: DocumentRecord;
};
export type StandardSiteRecords = {
    publication: {
        uri: string;
        record: PublicationRecord;
        url: string;
    };
    documents: DocumentSyncEntry[];
};
export type StandardSiteRepository = {
    upsertPublication(publication: StandardSitePublication): Promise<string>;
    syncDocumentRecords(records: StandardSiteRecords): Promise<{ deletedCount: number; }>;
};

function parseTid(value: string) {
    if (!isTid(value)) {
        throw new Error(`Expected a TID, got ${value}`);
    }

    return value;
}

function tryParseListedPublication(value: unknown) {
    const result = safeParse(SiteStandardPublication.mainSchema, value);
    return result.ok ? result.value : undefined;
}

function tryParseListedDocument(value: unknown) {
    const result = safeParse(SiteStandardDocument.mainSchema, value);
    return result.ok ? result.value : undefined;
}

function withoutTrailingSlashes(value: string | undefined): string | undefined {
    return value?.replace(/\/+$/, "");
}

function rkeyFromUri(uri: string): string {
    return parseCanonicalResourceUri(uri).rkey;
}

export class DryRunStandardSiteRepo implements StandardSiteRepository {
    async upsertPublication(): Promise<string> {
        return `at://${ATPROTO_DID}/site.standard.publication/${this.#tid(0)}`;
    }

    async syncDocumentRecords(records: StandardSiteRecords): Promise<{ deletedCount: number; }> {
        for (const [index, document] of records.documents.entries()) {
            document.uri = `at://${ATPROTO_DID}/site.standard.document/${this.#tid(index + 1)}`;
        }

        return { deletedCount: 0 };
    }

    #tid(index: number): string {
        const base32Sortable = "234567abcdefghijklmnopqrstuvwxyz";
        if (!Number.isSafeInteger(index) || index < 0) {
            throw new Error(`Expected a non-negative safe integer, got ${index}`);
        }

        let tid = BigInt(index);
        let encoded = "";
        for (let i = 0; i < 13; i++) {
            encoded = base32Sortable[Number(tid & 31n)] + encoded;
            tid >>= 5n;
        }

        return parseTid(encoded);
    }
}

export class StandardSiteRepo implements StandardSiteRepository {
    #rpc: Client;

    private constructor(rpc: Client) {
        this.#rpc = rpc;
    }

    static async login(): Promise<StandardSiteRepo> {
        const password = process.env.ATPROTO_APP_PASSWORD;
        if (!password) {
            throw new Error("ATPROTO_APP_PASSWORD is required unless --dry is used");
        }

        const session = await PasswordSession.login({
            service: ATPROTO_SERVICE,
            identifier: ATPROTO_DID,
            password,
        });
        if (session.did !== ATPROTO_DID) {
            throw new Error(`Authenticated as ${session.did}, expected ${ATPROTO_DID}`);
        }

        return new StandardSiteRepo(new Client({ handler: session }));
    }

    async upsertPublication(publication: StandardSitePublication): Promise<string> {
        const existingPublication = (await this.#listRecords("site.standard.publication"))
            .flatMap((record) => {
                const value = tryParseListedPublication(record.value);
                if (!value) {
                    console.warn(`Skipping invalid Standard.site publication record ${record.uri}`);
                    return [];
                }

                return [{ ...record, value }];
            })
            .find((record) => withoutTrailingSlashes(record.value.url) === publication.url);

        const result = existingPublication
            ? await this.#putRecord(
                "site.standard.publication",
                rkeyFromUri(existingPublication.uri),
                publication.record,
            )
            : await this.#createRecord("site.standard.publication", publication.record);

        return result.uri;
    }

    async syncDocumentRecords(records: StandardSiteRecords): Promise<{ deletedCount: number; }> {
        if (records.documents.length === 0) {
            throw new Error("Refusing to sync Standard.site documents because no local posts were found.");
        }

        const existingDocuments = (await this.#listRecords("site.standard.document")).flatMap((record) => {
            const value = tryParseListedDocument(record.value);
            if (!value) {
                console.warn(`Skipping invalid Standard.site document record ${record.uri}`);
                return [];
            }

            return [{ ...record, value }];
        });
        const localPaths = new Set(records.documents.map((document) => document.path));
        const matchingExistingDocuments = existingDocuments.filter(
            (record) =>
                record.value.site === records.publication.uri
                || withoutTrailingSlashes(record.value.site) === records.publication.url,
        );
        const managedExistingDocuments = matchingExistingDocuments.filter((record) =>
            record.value.path?.startsWith("/posts/")
        );
        const existingDocumentsByPath = new Map<string, (typeof managedExistingDocuments)[number]>();
        const duplicateDocuments: typeof managedExistingDocuments = [];

        for (const document of managedExistingDocuments) {
            if (!document.value.path) {
                continue;
            }

            if (existingDocumentsByPath.has(document.value.path)) {
                duplicateDocuments.push(document);
            } else {
                existingDocumentsByPath.set(document.value.path, document);
            }
        }

        for (const document of records.documents) {
            const existingDocument = existingDocumentsByPath.get(document.path);
            const result = existingDocument
                ? await this.#putRecord(
                    "site.standard.document",
                    rkeyFromUri(existingDocument.uri),
                    document.record,
                )
                : await this.#createRecord("site.standard.document", document.record);

            document.uri = result.uri;
        }

        const orphanedDocuments = managedExistingDocuments.filter(
            (record) => record.value.path && !localPaths.has(record.value.path),
        );
        const documentsToDelete = new Map(
            [...orphanedDocuments, ...duplicateDocuments].map((document) => [document.uri, document]),
        );

        for (const document of documentsToDelete.values()) {
            await this.#deleteRecord("site.standard.document", rkeyFromUri(document.uri));
        }

        return { deletedCount: documentsToDelete.size };
    }

    async #createRecord(
        collection: "site.standard.publication" | "site.standard.document",
        record: PublicationRecord | DocumentRecord,
    ): Promise<{ uri: string; }> {
        return ok(
            this.#rpc.call(ComAtprotoRepoCreateRecord, {
                input: {
                    repo: ATPROTO_DID,
                    collection,
                    record,
                    validate: false,
                },
            }),
        );
    }

    async #putRecord(
        collection: "site.standard.publication" | "site.standard.document",
        rkey: string,
        record: PublicationRecord | DocumentRecord,
    ): Promise<{ uri: string; }> {
        return ok(
            this.#rpc.call(ComAtprotoRepoPutRecord, {
                input: {
                    repo: ATPROTO_DID,
                    collection,
                    rkey,
                    record,
                    validate: false,
                },
            }),
        );
    }

    async #deleteRecord(collection: "site.standard.document", rkey: string): Promise<void> {
        await ok(
            this.#rpc.call(ComAtprotoRepoDeleteRecord, {
                input: {
                    repo: ATPROTO_DID,
                    collection,
                    rkey,
                },
            }),
        );
    }

    async #listRecords(
        collection: "site.standard.publication" | "site.standard.document",
    ): Promise<{ uri: string; value: unknown; }[]> {
        const records: { uri: string; value: unknown; }[] = [];
        let cursor: string | undefined;

        do {
            const response = await ok(
                this.#rpc.call(ComAtprotoRepoListRecords, {
                    params: {
                        repo: ATPROTO_DID,
                        collection,
                        limit: 100,
                        cursor,
                    },
                }),
            );

            records.push(...response.records.map((record) => ({
                uri: record.uri,
                value: record.value,
            })));
            cursor = response.cursor;
        } while (cursor);

        return records;
    }
}
