/**
 * merge-gallery-manifest.js
 *
 * Combines the hand-edited gallery layout (`gallery.json`) with machine-generated
 * media paths (`media.json` from `npm run optimize:assets`).
 *
 * Used in the browser during local dev (`npm run serve`) and re-exported by the
 * Node build script so production and development share one merge implementation.
 */

/**
 * Merge chapter image IDs with optimized WebP variant paths and dimensions.
 *
 * @param {object} galleryConfiguration - Parsed `gallery.json` (chapters list image IDs only).
 * @param {object} mediaManifest - Parsed `media.json` (paths, widths, video).
 * @returns {object} Gallery ready for rendering: chapters with `items[]`, hero srcset, video.
 */
export function mergeGalleryManifest(galleryConfiguration, mediaManifest) {
  const galleryWithItems = structuredClone(galleryConfiguration);

  // Hero photograph is referenced by filename stem (e.g. "IMG_5637").
  if (galleryWithItems.hero && mediaManifest.images[galleryWithItems.hero]) {
    galleryWithItems.heroSrcset = mediaManifest.images[galleryWithItems.hero].variants;
  }

  for (const chapter of galleryWithItems.chapters) {
    chapter.items = chapter.images
      .filter((imageIdentifier) => mediaManifest.images[imageIdentifier])
      .map((imageIdentifier) => {
        const imageRecord = mediaManifest.images[imageIdentifier];
        return {
          id: imageIdentifier,
          alt: chapter.titleEn,
          variants: imageRecord.variants,
          width: imageRecord.width,
          height: imageRecord.height,
        };
      });
  }

  return { ...galleryWithItems, video: mediaManifest.video ?? null };
}
