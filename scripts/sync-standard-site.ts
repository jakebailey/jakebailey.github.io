#!/usr/bin/env node

import { type GenericUri, isGenericUri } from "@atcute/lexicons/syntax";
import * as v from "@badrap/valita";
import { parse as parseCsv } from "csv-parse/sync";
import matter from "gray-matter";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { parse as parseYaml } from "yaml";
import {
    type DocumentRecord,
    type DocumentSyncEntry,
    DryRunStandardSiteRepo,
    type PublicationRecord,
    type StandardSitePublication,
    type StandardSiteRecords,
    StandardSiteRepo,
    type StandardSiteRepository,
} from "./standard-site-repo.ts";

const repoRoot = path.resolve(import.meta.dirname, "..");

const urlSchema = v.string()
    .assert((value) => URL.canParse(value), "expected URL")
    .map((value) => new URL(value).href);

function toGenericUri(value: string): GenericUri {
    if (!isGenericUri(value)) {
        throw new Error(`Expected URI, got ${value}`);
    }

    return value;
}

const HugoDraft = v.string()
    .assert((draft) => draft === "true" || draft === "false", "expected boolean string")
    .map((draft) => draft === "true");

const HugoPage = v.object({
    path: v.string(),
    title: v.string(),
    date: v.string(),
    publishDate: v.string(),
    draft: HugoDraft,
    permalink: v.string(),
    kind: v.string(),
    section: v.string(),
});

function parseHugoListRecords(value: unknown) {
    return v.array(HugoPage).parse(value, { mode: "strip" });
}

const Frontmatter = v.object({
    description: v.string().optional(),
    summary: v.string().optional(),
    tags: v.array(v.string()).optional(),
});

function parseFrontmatter(value: unknown) {
    return Frontmatter.parse(value, { mode: "strip" });
}

const SiteConfig = v.object({
    baseURL: urlSchema,
    title: v.string(),
    params: v.object({
        description: v.string().optional(),
    }).optional(),
});

function parseSiteConfig(value: unknown) {
    return SiteConfig.parse(value, { mode: "strip" });
}

type HugoPage = v.Infer<typeof HugoPage>;

function readHugoPages(): HugoPage[] {
    const output = execFileSync("hugo", ["list", "published", "--logLevel", "error"], {
        cwd: repoRoot,
        encoding: "utf8",
    });
    return parseHugoListRecords(
        parseCsv(output, {
            columns: true,
            skip_empty_lines: true,
        }),
    );
}

function readFrontmatter(contentPath: string) {
    const absolutePath = path.join(repoRoot, contentPath);
    return parseFrontmatter(matter(readFileSync(absolutePath, "utf8")).data);
}

function toPublishedAt(page: HugoPage): string {
    const value = page.publishDate && !page.publishDate.startsWith("0001-")
        ? page.publishDate
        : page.date;
    if (!value || value.startsWith("0001-")) {
        throw new Error(`Missing publish date for ${page.path}`);
    }
    return new Date(value).toISOString();
}

function readSiteConfig(): { baseURL: string; title: string; description?: string; } {
    const config = parseSiteConfig(
        parseYaml(readFileSync(path.join(repoRoot, "config.yml"), "utf8")),
    );
    const baseURL = config.baseURL;
    const title = config.title;
    const description = config.params?.description?.trim();

    if (!baseURL || !title) {
        throw new Error("Could not read baseURL and title from config.yml");
    }

    return {
        baseURL,
        title,
        description,
    };
}

function buildPublication(): StandardSitePublication {
    const siteConfig = readSiteConfig();
    const publicationUrl = siteConfig.baseURL.replace(/\/+$/, "");
    const publicationRecord: PublicationRecord = {
        $type: "site.standard.publication",
        url: toGenericUri(publicationUrl),
        name: siteConfig.title,
        preferences: {
            showInDiscover: true,
        },
    };

    if (siteConfig.description) {
        publicationRecord.description = siteConfig.description;
    }

    return {
        url: publicationUrl,
        record: publicationRecord,
    };
}

function buildDocuments(publicationUri: string): DocumentSyncEntry[] {
    return readHugoPages()
        .filter((page) => page.section === "posts" && page.kind === "page" && !page.draft)
        .map((page) => {
            const frontmatter = readFrontmatter(page.path);
            const documentPath = new URL(page.permalink).pathname;
            const description = frontmatter.description || frontmatter.summary;
            const record: DocumentRecord = {
                $type: "site.standard.document",
                site: toGenericUri(publicationUri),
                path: documentPath,
                title: page.title,
                publishedAt: toPublishedAt(page),
                description,
                tags: frontmatter.tags,
            };

            return {
                path: documentPath,
                record,
            };
        });
}

function buildRecordsForPublication(publication: ReturnType<typeof buildPublication>, publicationUri: string) {
    return {
        publication: {
            uri: publicationUri,
            record: publication.record,
            url: publication.url,
        },
        documents: buildDocuments(publicationUri),
    };
}

function writeGeneratedFiles(records: StandardSiteRecords): void {
    const wellKnownDir = path.join(repoRoot, "static", ".well-known");
    mkdirSync(wellKnownDir, { recursive: true });
    writeFileSync(
        path.join(wellKnownDir, "site.standard.publication"),
        `${records.publication.uri}\n`,
    );

    const dataDir = path.join(repoRoot, "data");
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(
        path.join(dataDir, "standard_site.json"),
        `${
            JSON.stringify(
                {
                    publicationUri: records.publication.uri,
                    documents: Object.fromEntries(
                        records.documents.map((document) => {
                            if (!document.uri) {
                                throw new Error(`Missing Standard.site document URI for ${document.path}`);
                            }

                            return [document.path, document.uri];
                        }),
                    ),
                },
                null,
                4,
            )
        }\n`,
    );
}

async function syncStandardSite(repo: StandardSiteRepository, action: "Prepared" | "Synced"): Promise<void> {
    const publication = buildPublication();
    const publicationResult = await repo.upsertPublication(publication);
    const records = buildRecordsForPublication(publication, publicationResult.uri);
    const documentResult = await repo.syncDocumentRecords(records);
    writeGeneratedFiles(records);

    console.log(`${action} ${records.documents.length} Standard.site document records.`);
    if (action === "Synced") {
        console.log(`Publication ${publicationResult.status}.`);
        console.log(
            `Documents: ${documentResult.createdCount} created, ${documentResult.updatedCount} updated, ${documentResult.skippedCount} unchanged, ${documentResult.deletedCount} deleted.`,
        );
    }
    console.log(`Publication: ${records.publication.uri}`);
}

async function main(): Promise<void> {
    const { values: args } = parseArgs({
        options: {
            dry: {
                type: "boolean",
                default: false,
            },
        },
    });

    if (args.dry) {
        await syncStandardSite(new DryRunStandardSiteRepo(), "Prepared");
    } else {
        await syncStandardSite(await StandardSiteRepo.login(), "Synced");
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
