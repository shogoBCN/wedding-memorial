import { cp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { MEDIA_MANIFEST_PATH } from "./lib/media-config.mjs";
import { mergeGalleryManifest } from "./lib/merge-gallery.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "web");
const dist = join(root, "dist");

const HTML_PAGES = ["index.html"];

function makeBuildId() {
  if (process.env.BUILD_ID) return String(process.env.BUILD_ID).slice(0, 32);
  for (const key of ["GITHUB_SHA", "COMMIT_REF", "CF_PAGES_COMMIT_SHA", "VERCEL_GIT_COMMIT_SHA"]) {
    const v = process.env[key];
    if (v && v.length >= 7) return v.slice(0, 12);
  }
  return createHash("sha256").update(String(Date.now())).digest("hex").slice(0, 12);
}

function applyAssetCacheBust(html, buildId) {
  return html
    .replace(
      /\b(href|src)="(\/assets\/[^"?#]+)"/g,
      (_m, attr, assetPath) => `${attr}="${assetPath}?v=${buildId}"`
    )
    .replace(
      /\b(href|src)="((?:\.\.\/)*assets\/[^"?#]+)"/g,
      (_m, attr, assetPath) => `${attr}="${assetPath}?v=${buildId}"`
    );
}

let media;
try {
  media = JSON.parse(await readFile(join(root, MEDIA_MANIFEST_PATH), "utf8"));
} catch {
  throw new Error(
    "build-site: missing web/assets/data/media.json — run `npm run optimize:assets` first (after adding originals to assets/)."
  );
}

const galleryConfig = JSON.parse(await readFile(join(src, "assets/data/gallery.json"), "utf8"));
const merged = mergeGalleryManifest(galleryConfig, media);

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const buildId = makeBuildId();

for (const page of HTML_PAGES) {
  let html = await readFile(join(src, page), "utf8");
  html = applyAssetCacheBust(html, buildId);
  await writeFile(join(dist, page), html, "utf8");
}

await cp(join(src, "robots.txt"), join(dist, "robots.txt"));
await cp(join(src, "assets"), join(dist, "assets"), { recursive: true });

const runtimeManifest = {
  buildId,
  hero: merged.hero,
  heroSrcset: merged.heroSrcset,
  chapters: merged.chapters,
  video: merged.video,
};

await writeFile(join(dist, "assets/data/gallery.json"), JSON.stringify(runtimeManifest, null, 2));

const photoCount = merged.chapters.reduce((n, c) => n + (c.items?.length ?? 0), 0);
console.info(`build-site: ${photoCount} photos, wrote dist/ (cache-bust v=${buildId})`);
