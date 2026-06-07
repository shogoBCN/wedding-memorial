/** Merge hand-edited chapter layout with optimize-assets media manifest. */
export function mergeGalleryManifest(galleryConfig, media) {
  const gallery = structuredClone(galleryConfig);

  if (gallery.hero && media.images[gallery.hero]) {
    gallery.heroSrcset = media.images[gallery.hero].variants;
  }

  for (const chapter of gallery.chapters) {
    chapter.items = chapter.images
      .filter((id) => media.images[id])
      .map((id) => {
        const img = media.images[id];
        return {
          id,
          alt: chapter.titleEn,
          variants: img.variants,
          width: img.width,
          height: img.height,
        };
      });
  }

  return { ...gallery, video: media.video ?? null };
}
