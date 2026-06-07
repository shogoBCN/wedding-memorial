/**
 * merge-gallery.mjs
 *
 * Node build entry point for gallery merge logic. Re-exports the browser module so
 * `build-site.mjs` and `main.js` never drift apart.
 */

export { mergeGalleryManifest } from "../../web/assets/js/merge-gallery-manifest.js";
