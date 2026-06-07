/**
 * media-config.mjs
 *
 * Shared paths and image width constants for optimize-assets and build-site.
 * Single source of truth so output directories and variant sizes stay in sync.
 */

/** Responsive WebP widths generated for every photograph (mobile-first). */
export const RESPONSIVE_IMAGE_WIDTHS = [480, 960, 1600];

/** Extra variant for hero / lightbox when the original exceeds this width. */
export const EXTRA_LARGE_IMAGE_WIDTH = 2400;

/** Gitignored photographer originals (heavy JPEGs). */
export const SOURCE_IMAGES_DIRECTORY = "assets/images";

/** Gitignored source wedding film. */
export const SOURCE_VIDEO_FILE_PATH = "assets/video/Angelica_Thorsten.mp4";

/** Committed optimized WebP output (served and deployed). */
export const WEB_IMAGES_DIRECTORY = "web/assets/images";

/** Committed optimized MP4 + poster (served and deployed). */
export const WEB_VIDEO_DIRECTORY = "web/assets/video";

/** Generated manifest listing every image variant path and video URLs. */
export const MEDIA_MANIFEST_PATH = "web/assets/data/media.json";
