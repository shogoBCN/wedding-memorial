/**
 * build-site.mjs
 *
 * Fast production build: copies `web/` → `dist/`, merges gallery + media manifests,
 * and appends a cache-bust query string to CSS/JS URLs in HTML.
 *
 * Run before deploy: `npm run build`
 */

import { cp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { MEDIA_MANIFEST_PATH } from "./lib/media-config.mjs";
import { mergeGalleryManifest } from "./lib/merge-gallery.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const webSourceDirectory = join(repositoryRoot, "web");
const distributionDirectory = join(repositoryRoot, "dist");

/** HTML pages copied individually so we can inject cache-bust parameters. */
const HTML_PAGE_FILES = ["index.html"];

/**
 * Derive a short build id for `?v=` cache busting on static assets.
 * Prefers CI environment variables when present.
 *
 * @returns {string}
 */
function createCacheBustBuildIdentifier() {
  if (process.env.BUILD_ID) {
    return String(process.env.BUILD_ID).slice(0, 32);
  }

  for (const environmentVariableName of [
    "GITHUB_SHA",
    "COMMIT_REF",
    "CF_PAGES_COMMIT_SHA",
    "VERCEL_GIT_COMMIT_SHA",
  ]) {
    const commitHash = process.env[environmentVariableName];
    if (commitHash && commitHash.length >= 7) {
      return commitHash.slice(0, 12);
    }
  }

  return createHash("sha256").update(String(Date.now())).digest("hex").slice(0, 12);
}

/**
 * Append `?v={buildId}` to relative asset URLs in HTML so browsers fetch fresh CSS/JS after deploy.
 *
 * @param {string} htmlContent
 * @param {string} buildIdentifier
 * @returns {string}
 */
function appendCacheBustQueryToAssetUrls(htmlContent, buildIdentifier) {
  return htmlContent
    .replace(
      /\b(href|src)="(\/assets\/[^"?#]+)"/g,
      (_match, attributeName, assetPath) =>
        `${attributeName}="${assetPath}?v=${buildIdentifier}"`
    )
    .replace(
      /\b(href|src)="((?:\.\.\/)*assets\/[^"?#]+)"/g,
      (_match, attributeName, assetPath) =>
        `${attributeName}="${assetPath}?v=${buildIdentifier}"`
    );
}

let mediaManifest;
try {
  mediaManifest = JSON.parse(await readFile(join(repositoryRoot, MEDIA_MANIFEST_PATH), "utf8"));
} catch {
  throw new Error(
    "build-site: missing web/assets/data/media.json — run `npm run optimize:assets` first (after adding originals to assets/)."
  );
}

const galleryConfiguration = JSON.parse(
  await readFile(join(webSourceDirectory, "assets/data/gallery.json"), "utf8")
);
const mergedGalleryManifest = mergeGalleryManifest(galleryConfiguration, mediaManifest);

await rm(distributionDirectory, { recursive: true, force: true });
await mkdir(distributionDirectory, { recursive: true });

const buildIdentifier = createCacheBustBuildIdentifier();

for (const htmlPageFile of HTML_PAGE_FILES) {
  let htmlContent = await readFile(join(webSourceDirectory, htmlPageFile), "utf8");
  htmlContent = appendCacheBustQueryToAssetUrls(htmlContent, buildIdentifier);
  await writeFile(join(distributionDirectory, htmlPageFile), htmlContent, "utf8");
}

await cp(join(webSourceDirectory, "robots.txt"), join(distributionDirectory, "robots.txt"));
await cp(join(webSourceDirectory, "assets"), join(distributionDirectory, "assets"), {
  recursive: true,
});

/** Single merged manifest for production — browser skips runtime merge. */
const deploymentGalleryManifest = {
  buildId: buildIdentifier,
  hero: mergedGalleryManifest.hero,
  heroSrcset: mergedGalleryManifest.heroSrcset,
  chapters: mergedGalleryManifest.chapters,
  video: mergedGalleryManifest.video,
};

await writeFile(
  join(distributionDirectory, "assets/data/gallery.json"),
  JSON.stringify(deploymentGalleryManifest, null, 2)
);

const totalPhotoCount = mergedGalleryManifest.chapters.reduce(
  (count, chapter) => count + (chapter.items?.length ?? 0),
  0
);

console.info(
  `build-site: ${totalPhotoCount} photos, wrote dist/ (cache-bust v=${buildIdentifier})`
);
