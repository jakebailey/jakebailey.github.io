#!/usr/bin/env node

import { type Cid, type GenericUri, isCid, isGenericUri } from "@atcute/lexicons/syntax";
import * as v from "@badrap/valita";
import { parse as parseCsv } from "csv-parse/sync";
import matter from "gray-matter";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { parse as parseYaml } from "yaml";
import {
    type DocumentRecord,
    type DocumentSyncEntry,
    DryRunStandardSiteRepo,
    type PublicationIcon,
    type PublicationRecord,
    type StandardSitePublication,
    type StandardSiteRecords,
    StandardSiteRepo,
    type StandardSiteRepository,
} from "./standard-site-repo.ts";

const repoRoot = path.resolve(import.meta.dirname, "..");
const base32Alphabet = "abcdefghijklmnopqrstuvwxyz234567";

const urlSchema = v.string()
    .assert((value) => URL.canParse(value), "expected URL")
    .map((value) => new URL(value).href);

function toGenericUri(value: string): GenericUri {
    if (!isGenericUri(value)) {
        throw new Error(`Expected URI, got ${value}`);
    }

    return value;
}

function toBase32(bytes: Uint8Array): string {
    let output = "";
    let value = 0;
    let bits = 0;

    for (const byte of bytes) {
        value = (value << 8) | byte;
        bits += 8;

        while (bits >= 5) {
            output += base32Alphabet[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }

    if (bits > 0) {
        output += base32Alphabet[(value << (5 - bits)) & 31];
    }

    return output;
}

function toBlobCid(data: Uint8Array): Cid {
    const hash = createHash("sha256").update(data).digest();
    const cidBytes = new Uint8Array(4 + hash.byteLength);
    cidBytes.set([0x01, 0x55, 0x12, 0x20]);
    cidBytes.set(hash, 4);

    const cid = `b${toBase32(cidBytes)}`;
    if (!isCid(cid)) {
        throw new Error(`Generated invalid blob CID: ${cid}`);
    }

    return cid;
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
    cover: v.object({
        image: v.string().optional(),
        relative: v.boolean().optional(),
    }).optional(),
    description: v.string().optional(),
    lastmod: v.string().optional(),
    modified: v.string().optional(),
    summary: v.string().optional(),
    tags: v.array(v.string()).optional(),
    updated: v.string().optional(),
    updatedAt: v.string().optional(),
});

function parseFrontmatter(value: unknown) {
    return Frontmatter.parse(value, { mode: "strip" });
}

const SiteConfig = v.object({
    baseURL: urlSchema,
    title: v.string(),
    params: v.object({
        description: v.string().optional(),
        homeInfoParams: v.object({
            imageUrl: v.string().optional(),
        }).optional(),
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

function readSiteConfig(): { baseURL: string; title: string; description?: string; iconPath?: string; } {
    const config = parseSiteConfig(
        parseYaml(readFileSync(path.join(repoRoot, "config.yml"), "utf8")),
    );
    const baseURL = config.baseURL;
    const title = config.title;
    const description = config.params?.description?.trim();
    const iconPath = config.params?.homeInfoParams?.imageUrl?.trim();

    if (!baseURL || !title) {
        throw new Error("Could not read baseURL and title from config.yml");
    }

    return {
        baseURL,
        title,
        description,
        iconPath,
    };
}

const imageMimeTypes = new Map([
    [".gif", "image/gif"],
    [".jpg", "image/jpeg"],
    [".jpeg", "image/jpeg"],
    [".png", "image/png"],
    [".webp", "image/webp"],
]);

function readImageBlob(
    repoRelativePath: string,
    description: string,
): { data: Uint8Array; mimeType: string; record: PublicationIcon; } {
    const mimeType = imageMimeTypes.get(path.extname(repoRelativePath).toLowerCase());
    if (!mimeType) {
        throw new Error(`Unsupported Standard.site ${description} type: ${repoRelativePath}`);
    }

    const absolutePath = path.resolve(repoRoot, repoRelativePath);
    if (!absolutePath.startsWith(`${repoRoot}${path.sep}`)) {
        throw new Error(`Standard.site ${description} path must stay inside the repository: ${repoRelativePath}`);
    }

    const stats = statSync(absolutePath);
    if (stats.size > 1_000_000) {
        throw new Error(`Standard.site ${description} must be at most 1 MB: ${repoRelativePath}`);
    }

    const data = readFileSync(absolutePath);
    return {
        data,
        mimeType,
        record: {
            $type: "blob",
            ref: { $link: toBlobCid(data) },
            mimeType,
            size: data.byteLength,
        },
    };
}

function readPublicationIcon(
    iconPath: string | undefined,
): { data: Uint8Array; mimeType: string; record: PublicationIcon; } | undefined {
    if (!iconPath) {
        return undefined;
    }

    return readImageBlob(path.join("assets", iconPath), "publication icon");
}

function resolveCoverImagePath(page: HugoPage, frontmatter: ReturnType<typeof readFrontmatter>): string | undefined {
    const image = frontmatter.cover?.image?.trim();
    if (!image || URL.canParse(image)) {
        return undefined;
    }

    if (frontmatter.cover?.relative) {
        return path.join(path.dirname(page.path), image);
    }

    return path.join("static", image.replace(/^\/+/, ""));
}

function toUpdatedAt(frontmatter: ReturnType<typeof readFrontmatter>, contentPath: string): string | undefined {
    const value = frontmatter.updatedAt || frontmatter.lastmod || frontmatter.updated || frontmatter.modified;
    if (!value) {
        return undefined;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new Error(`Invalid update date for ${contentPath}: ${value}`);
    }

    return date.toISOString();
}

function buildPublication(siteConfig = readSiteConfig()): StandardSitePublication {
    const publicationUrl = siteConfig.baseURL.replace(/\/+$/, "");
    const publicationRecord: PublicationRecord = {
        $type: "site.standard.publication",
        basicTheme: {
            $type: "site.standard.theme.basic",
            accent: { $type: "site.standard.theme.color#rgb", r: 17, g: 119, b: 204 },
            accentForeground: { $type: "site.standard.theme.color#rgb", r: 255, g: 255, b: 255 },
            background: { $type: "site.standard.theme.color#rgb", r: 255, g: 255, b: 255 },
            foreground: { $type: "site.standard.theme.color#rgb", r: 30, g: 30, b: 30 },
        },
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
            const coverImagePath = resolveCoverImagePath(page, frontmatter);
            const coverImage = coverImagePath
                ? readImageBlob(coverImagePath, `cover image for ${page.path}`)
                : undefined;
            const record: DocumentRecord = {
                $type: "site.standard.document",
                site: toGenericUri(publicationUri),
                path: documentPath,
                title: page.title,
                publishedAt: toPublishedAt(page),
                updatedAt: toUpdatedAt(frontmatter, page.path),
                coverImage: coverImage?.record,
                description,
                tags: frontmatter.tags,
            };

            return {
                path: documentPath,
                record,
                coverImageUpload: coverImage
                    ? {
                        data: coverImage.data,
                        mimeType: coverImage.mimeType,
                    }
                    : undefined,
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
    const siteConfig = readSiteConfig();
    const publication = buildPublication(siteConfig);
    const icon = readPublicationIcon(siteConfig.iconPath);
    if (icon) {
        publication.record.icon = icon.record;
        publication.iconUpload = {
            data: icon.data,
            mimeType: icon.mimeType,
        };
    }
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
