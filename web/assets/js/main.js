/**
 * main.js
 *
 * Client-side application for the Angélica & Thorsten wedding memory site.
 * Static ES module — no bundler. Responsibilities:
 *   - Load and merge gallery/media manifests
 *   - Hero image, story video, filterable masonry gallery, photo lightbox
 *   - Sticky navigation, scroll progress, section highlighting, reveal animations
 *
 * Run via `npm run serve` (never open index.html as file://).
 */

import { mergeGalleryManifest } from "./merge-gallery-manifest.js";

/** Section IDs matching `#inicio`, `#historia`, etc. — used for nav highlighting. */
const NAVIGATION_SECTION_IDS = ["inicio", "historia", "galeria", "gracias"];

/** Below this width the nav collapses into a hamburger menu. */
const MOBILE_NAVIGATION_MEDIA_QUERY = "(max-width: 767px)";

/** Width used for gallery thumbnails — balances sharpness vs. bytes on mobile grids. */
const GALLERY_THUMBNAIL_TARGET_WIDTH = 480;

/** Cap for lightbox resolution — matches largest WebP variant from optimize-assets. */
const LIGHTBOX_MAX_VARIANT_WIDTH = 2400;

/** Minimum horizontal swipe distance (px) before we treat it as prev/next. */
const LIGHTBOX_SWIPE_THRESHOLD_PIXELS = 50;

/**
 * Pick the smallest WebP variant whose width is >= requested width.
 * Falls back to the largest available variant when the viewport is very wide.
 *
 * @param {Record<string, string>} variantPathsByWidth - e.g. { "480": "assets/…", "960": "…" }
 * @param {number} requestedWidthPixels
 * @returns {string} Relative path to the chosen WebP file.
 */
function selectResponsiveImageVariant(variantPathsByWidth, requestedWidthPixels) {
  const availableWidths = Object.keys(variantPathsByWidth)
    .map(Number)
    .sort((left, right) => left - right);

  const chosenWidth =
    availableWidths.find((width) => width >= requestedWidthPixels) ??
    availableWidths[availableWidths.length - 1];

  return variantPathsByWidth[String(chosenWidth)];
}

/**
 * Build an HTML `srcset` attribute from variant paths.
 *
 * @param {Record<string, string>} variantPathsByWidth
 * @returns {string} e.g. "assets/foo-480.webp 480w, assets/foo-960.webp 960w"
 */
function buildResponsiveImageSrcset(variantPathsByWidth) {
  return Object.entries(variantPathsByWidth)
    .sort(([widthA], [widthB]) => Number(widthA) - Number(widthB))
    .map(([width, path]) => `${path} ${width}w`)
    .join(", ");
}

/**
 * Inject the hero background `<img>` with responsive src/srcset.
 * Called on load and on debounced resize so the hero tracks viewport width.
 *
 * @param {HTMLElement|null} heroMediaContainer
 * @param {Record<string, string>|undefined} heroVariantPaths
 */
function renderHeroBackgroundImage(heroMediaContainer, heroVariantPaths) {
  if (!heroMediaContainer || !heroVariantPaths) return;

  const heroImage = document.createElement("img");
  const heroSource = selectResponsiveImageVariant(heroVariantPaths, window.innerWidth);

  heroImage.src = heroSource;
  heroImage.srcset = buildResponsiveImageSrcset(heroVariantPaths);
  heroImage.sizes = "100vw";
  heroImage.alt = "Angélica y Thorsten — primer baile";
  heroImage.decoding = "async";
  heroImage.fetchPriority = "high";

  heroMediaContainer.replaceChildren(heroImage);
}

/**
 * Build filter tabs and photo grid from the merged gallery manifest.
 *
 * @param {object} galleryManifest
 * @returns {{ allGalleryItems: object[] }}
 */
function initializeGallerySection(galleryManifest) {
  const galleryFiltersElement = document.querySelector("[data-gallery-filters]");
  const galleryGridElement = document.querySelector("[data-gallery-grid]");

  if (!galleryFiltersElement || !galleryGridElement) {
    return { allGalleryItems: [] };
  }

  const chapters = galleryManifest.chapters ?? [];
  const allGalleryItems = [];

  // "All" tab — shows every chapter at once.
  const showAllChaptersButton = document.createElement("button");
  showAllChaptersButton.type = "button";
  showAllChaptersButton.className = "gallery-filters__btn is-active";
  showAllChaptersButton.dataset.chapter = "all";
  showAllChaptersButton.setAttribute("role", "tab");
  showAllChaptersButton.setAttribute("aria-selected", "true");
  showAllChaptersButton.textContent = "Todas";
  galleryFiltersElement.append(showAllChaptersButton);

  for (const chapter of chapters) {
    const chapterFilterButton = document.createElement("button");
    chapterFilterButton.type = "button";
    chapterFilterButton.className = "gallery-filters__btn";
    chapterFilterButton.dataset.chapter = chapter.id;
    chapterFilterButton.setAttribute("role", "tab");
    chapterFilterButton.setAttribute("aria-selected", "false");
    chapterFilterButton.textContent = `${chapter.titleEs}`;
    galleryFiltersElement.append(chapterFilterButton);

    for (const galleryItem of chapter.items ?? []) {
      allGalleryItems.push({
        ...galleryItem,
        chapterId: chapter.id,
        caption: chapter.titleEn,
      });
    }
  }

  /**
   * Render grid cells for one chapter (or all). Staggered entrance only when filtering,
   * not on first paint — avoids a flash on initial load.
   *
   * @param {string} chapterIdentifier - Chapter `id` or `"all"`.
   * @param {boolean} animateEntrance
   */
  function renderGalleryGrid(chapterIdentifier, animateEntrance = false) {
    galleryGridElement.replaceChildren();

    const itemsToShow =
      chapterIdentifier === "all"
        ? allGalleryItems
        : allGalleryItems.filter((item) => item.chapterId === chapterIdentifier);

    itemsToShow.forEach((galleryItem, itemIndex) => {
      const galleryCellButton = document.createElement("button");
      galleryCellButton.type = "button";
      galleryCellButton.className = animateEntrance
        ? "gallery-item is-entering"
        : "gallery-item";
      galleryCellButton.dataset.imageId = galleryItem.id;
      galleryCellButton.setAttribute("role", "listitem");

      if (animateEntrance) {
        galleryCellButton.style.animationDelay = `${Math.min(itemIndex * 0.055, 0.65)}s`;
      }

      if (galleryItem.width > galleryItem.height) {
        galleryCellButton.classList.add("gallery-item--landscape");
      }

      const thumbnailImage = document.createElement("img");
      const thumbnailSource = selectResponsiveImageVariant(
        galleryItem.variants,
        GALLERY_THUMBNAIL_TARGET_WIDTH
      );

      thumbnailImage.src = thumbnailSource;
      thumbnailImage.srcset = buildResponsiveImageSrcset(galleryItem.variants);
      thumbnailImage.sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw";
      thumbnailImage.alt = galleryItem.alt ?? "";
      thumbnailImage.loading = "lazy";
      thumbnailImage.decoding = "async";
      thumbnailImage.width = galleryItem.width;
      thumbnailImage.height = galleryItem.height;

      galleryCellButton.append(thumbnailImage);
      galleryGridElement.append(galleryCellButton);
    });
  }

  galleryFiltersElement.addEventListener("click", (clickEvent) => {
    const filterButton = clickEvent.target.closest(".gallery-filters__btn");
    if (!filterButton) return;

    galleryFiltersElement.querySelectorAll(".gallery-filters__btn").forEach((button) => {
      const isActive = button === filterButton;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
    });

    renderGalleryGrid(filterButton.dataset.chapter, true);
  });

  renderGalleryGrid("all", false);
  return { allGalleryItems };
}

/**
 * Full-screen `<dialog>` lightbox with crossfade, keyboard, swipe, and chapter-aware order.
 *
 * @param {object[]} allGalleryItems - Flat list from `initializeGallerySection`.
 */
function initializePhotoLightbox(allGalleryItems) {
  const lightboxDialog = document.querySelector("[data-lightbox]");
  const lightboxImageElement = document.querySelector("[data-lightbox-img]");
  const lightboxCaptionElement = document.querySelector("[data-lightbox-caption]");
  const lightboxCloseButton = document.querySelector("[data-lightbox-close]");
  const lightboxPreviousButton = document.querySelector("[data-lightbox-prev-bar]");
  const lightboxNextButton = document.querySelector("[data-lightbox-next-bar]");
  const lightboxCounterElement = document.querySelector("[data-lightbox-counter]");
  const lightboxSwipeTargetElement = document.querySelector("[data-lightbox-swipe]");
  const galleryGridElement = document.querySelector("[data-gallery-grid]");

  if (!lightboxDialog || !lightboxImageElement || !galleryGridElement) return;

  let currentPhotoIndex = -1;
  let visibleImageIdentifiers = [];

  /** Re-read DOM order after a filter change — lightbox only navigates visible photos. */
  function refreshVisibleImageIdentifiers() {
    visibleImageIdentifiers = [...galleryGridElement.querySelectorAll(".gallery-item")].map(
      (cell) => cell.dataset.imageId
    );
  }

  /**
   * Load a photo into the lightbox with optional crossfade when already open.
   *
   * @param {object} galleryItem
   */
  function loadPhotoIntoLightbox(galleryItem) {
    const targetWidth = Math.min(window.innerWidth * 2, LIGHTBOX_MAX_VARIANT_WIDTH);
    const imageSource = selectResponsiveImageVariant(galleryItem.variants, targetWidth);

    const revealImageAfterLoad = () => {
      requestAnimationFrame(() => lightboxImageElement.classList.remove("is-changing"));
    };

    const applyImageToLightbox = () => {
      if (lightboxCaptionElement) {
        lightboxCaptionElement.textContent = galleryItem.caption ?? "";
      }

      lightboxImageElement.alt = galleryItem.alt ?? "";
      lightboxImageElement.sizes = "100vw";
      lightboxImageElement.srcset = buildResponsiveImageSrcset(galleryItem.variants);

      // Same URL — skip reload; just ensure visible (e.g. after failed transition).
      if (lightboxImageElement.src === new URL(imageSource, window.location.href).href) {
        revealImageAfterLoad();
        return;
      }

      lightboxImageElement.onload = () => {
        lightboxImageElement.onload = null;
        revealImageAfterLoad();
      };
      lightboxImageElement.src = imageSource;

      if (lightboxImageElement.complete) {
        lightboxImageElement.onload = null;
        revealImageAfterLoad();
      }
    };

    if (!lightboxDialog.open) {
      applyImageToLightbox();
      lightboxDialog.showModal();
      return;
    }

    if (lightboxImageElement.classList.contains("is-changing")) {
      applyImageToLightbox();
      return;
    }

    const onOpacityTransitionFinished = (transitionEvent) => {
      if (transitionEvent.propertyName !== "opacity") return;
      lightboxImageElement.removeEventListener("transitionend", onOpacityTransitionFinished);
      applyImageToLightbox();
    };

    lightboxImageElement.addEventListener("transitionend", onOpacityTransitionFinished);
    lightboxImageElement.classList.add("is-changing");
  }

  function updateLightboxPhotoCounter() {
    if (!lightboxCounterElement || visibleImageIdentifiers.length === 0) return;
    lightboxCounterElement.textContent = `${currentPhotoIndex + 1} / ${visibleImageIdentifiers.length}`;
  }

  function showPreviousPhoto() {
    refreshVisibleImageIdentifiers();
    const previousIndex =
      currentPhotoIndex <= 0 ? visibleImageIdentifiers.length - 1 : currentPhotoIndex - 1;
    showPhotoAtIndex(previousIndex);
  }

  function showNextPhoto() {
    refreshVisibleImageIdentifiers();
    const nextIndex =
      currentPhotoIndex >= visibleImageIdentifiers.length - 1 ? 0 : currentPhotoIndex + 1;
    showPhotoAtIndex(nextIndex);
  }

  function showPhotoAtIndex(photoIndex) {
    if (photoIndex < 0 || photoIndex >= visibleImageIdentifiers.length) return;

    currentPhotoIndex = photoIndex;
    const imageIdentifier = visibleImageIdentifiers[photoIndex];
    const galleryItem = allGalleryItems.find((item) => item.id === imageIdentifier);

    if (!galleryItem) return;

    loadPhotoIntoLightbox(galleryItem);
    updateLightboxPhotoCounter();
  }

  galleryGridElement.addEventListener("click", (clickEvent) => {
    const galleryCell = clickEvent.target.closest(".gallery-item");
    if (!galleryCell) return;

    refreshVisibleImageIdentifiers();
    const clickedIndex = visibleImageIdentifiers.indexOf(galleryCell.dataset.imageId);
    if (clickedIndex >= 0) showPhotoAtIndex(clickedIndex);
  });

  lightboxCloseButton?.addEventListener("click", () => lightboxDialog.close());

  // Click backdrop (dialog element itself, not children) to close.
  lightboxDialog.addEventListener("click", (clickEvent) => {
    if (clickEvent.target === lightboxDialog) lightboxDialog.close();
  });

  lightboxPreviousButton?.addEventListener("click", showPreviousPhoto);
  lightboxNextButton?.addEventListener("click", showNextPhoto);

  lightboxDialog.addEventListener("keydown", (keyboardEvent) => {
    if (keyboardEvent.key === "ArrowLeft") {
      keyboardEvent.preventDefault();
      showPreviousPhoto();
    } else if (keyboardEvent.key === "ArrowRight") {
      keyboardEvent.preventDefault();
      showNextPhoto();
    } else if (keyboardEvent.key === "Escape") {
      lightboxDialog.close();
    }
  });

  let touchStartX = 0;
  let touchStartY = 0;
  const swipeListenerTarget = lightboxSwipeTargetElement ?? lightboxDialog;

  swipeListenerTarget.addEventListener(
    "touchstart",
    (touchEvent) => {
      touchStartX = touchEvent.touches[0]?.clientX ?? 0;
      touchStartY = touchEvent.touches[0]?.clientY ?? 0;
    },
    { passive: true }
  );

  swipeListenerTarget.addEventListener("touchend", (touchEvent) => {
    const touchEndX = touchEvent.changedTouches[0]?.clientX ?? 0;
    const touchEndY = touchEvent.changedTouches[0]?.clientY ?? 0;
    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;

    if (
      Math.abs(deltaX) < LIGHTBOX_SWIPE_THRESHOLD_PIXELS ||
      Math.abs(deltaX) < Math.abs(deltaY)
    ) {
      return;
    }

    if (deltaX > 0) showPreviousPhoto();
    else showNextPhoto();
  });
}

/** GA4 measurement ID — must match the gtag snippet in index.html. */
const GOOGLE_ANALYTICS_MEASUREMENT_ID = "G-QJ8JVNXVEH";

/**
 * Report hash section changes as virtual page views (single HTML page, many #sections).
 * Initial load is tracked automatically by gtag('config', …).
 */
function initializeGoogleAnalyticsSectionViews() {
  if (typeof window.gtag !== "function") return;

  window.addEventListener("hashchange", () => {
    const sectionIdentifier = window.location.hash.replace(/^#/, "") || "inicio";
    window.gtag("event", "page_view", {
      page_title: sectionIdentifier,
      page_location: `${window.location.origin}${window.location.pathname}#${sectionIdentifier}`,
      page_path: `${window.location.pathname}#${sectionIdentifier}`,
      send_to: GOOGLE_ANALYTICS_MEASUREMENT_ID,
    });
  });
}

/** Sticky header: mobile menu, scroll progress bar, active section in nav. */
function initializeSiteNavigation() {
  const navigationToggleButton = document.querySelector("[data-nav-toggle]");
  const navigationElement = document.querySelector("[data-nav]");
  const navigationLinks = document.querySelectorAll("[data-nav-link]");

  navigationToggleButton?.addEventListener("click", () => {
    const isMenuOpen = navigationToggleButton.getAttribute("aria-expanded") === "true";
    navigationToggleButton.setAttribute("aria-expanded", isMenuOpen ? "false" : "true");
    navigationElement?.classList.toggle("is-open", !isMenuOpen);
  });

  navigationLinks.forEach((link) => {
    link.addEventListener("click", () => {
      if (window.matchMedia(MOBILE_NAVIGATION_MEDIA_QUERY).matches) {
        navigationToggleButton?.setAttribute("aria-expanded", "false");
        navigationElement?.classList.remove("is-open");
      }
    });
  });

  const scrollProgressElement = document.querySelector(".scroll-progress");
  window.addEventListener(
    "scroll",
    () => {
      const documentElement = document.documentElement;
      const maximumScroll = documentElement.scrollHeight - documentElement.clientHeight;
      const scrollPercentage = maximumScroll > 0 ? (window.scrollY / maximumScroll) * 100 : 0;

      if (scrollProgressElement) {
        scrollProgressElement.style.width = `${scrollPercentage}%`;
      }
    },
    { passive: true }
  );

  const sectionElements = NAVIGATION_SECTION_IDS.map((sectionId) =>
    document.getElementById(sectionId)
  ).filter(Boolean);

  if (sectionElements.length && navigationLinks.length) {
    const sectionVisibilityObserver = new IntersectionObserver(
      (observerEntries) => {
        for (const entry of observerEntries) {
          if (!entry.isIntersecting) continue;

          const activeSectionId = entry.target.id;
          navigationLinks.forEach((link) => {
            link.classList.toggle(
              "is-active",
              link.getAttribute("href") === `#${activeSectionId}`
            );
          });
        }
      },
      { rootMargin: "-40% 0px -45% 0px", threshold: 0 }
    );

    sectionElements.forEach((section) => sectionVisibilityObserver.observe(section));
  }
}

/** Fade/slide sections in once when they enter the viewport (respects reduced-motion in CSS). */
function initializeScrollRevealAnimations() {
  const revealElements = document.querySelectorAll("[data-reveal]");
  if (!revealElements.length) return;

  const revealObserver = new IntersectionObserver(
    (observerEntries) => {
      for (const entry of observerEntries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
  );

  revealElements.forEach((element) => revealObserver.observe(element));
}

/**
 * Load gallery data for the current environment.
 *
 * - **Production (`dist/`)**: `gallery.json` is pre-merged at build time.
 * - **Local dev (`web/`)**: `gallery.json` lists image IDs only; merge with `media.json` here.
 *
 * @returns {Promise<object>}
 */
async function loadGalleryManifest() {
  const galleryResponse = await fetch("assets/data/gallery.json");
  if (!galleryResponse.ok) {
    throw new Error("missing assets/data/gallery.json");
  }

  const galleryConfiguration = await galleryResponse.json();

  if (galleryConfiguration.chapters?.[0]?.items?.length) {
    return galleryConfiguration;
  }

  const mediaResponse = await fetch("assets/data/media.json");
  if (!mediaResponse.ok) {
    throw new Error("missing assets/data/media.json — run npm run optimize:assets first");
  }

  return mergeGalleryManifest(galleryConfiguration, await mediaResponse.json());
}

/** Application entry — runs after DOM is ready (module defer). */
async function initializeApplication() {
  initializeSiteNavigation();
  initializeScrollRevealAnimations();
  initializeGoogleAnalyticsSectionViews();

  let galleryManifest;
  try {
    galleryManifest = await loadGalleryManifest();
  } catch (loadError) {
    console.error("Could not load gallery:", loadError.message);
    return;
  }

  renderHeroBackgroundImage(
    document.querySelector("[data-hero-media]"),
    galleryManifest.heroSrcset
  );

  const storyVideoElement = document.querySelector("[data-story-video]");
  if (galleryManifest.video?.poster && storyVideoElement) {
    storyVideoElement.poster = galleryManifest.video.poster;
  }
  if (galleryManifest.video?.src && storyVideoElement) {
    const videoSourceElement = storyVideoElement.querySelector("source");
    if (videoSourceElement) videoSourceElement.src = galleryManifest.video.src;
    storyVideoElement.load();
  }

  const { allGalleryItems } = initializeGallerySection(galleryManifest);
  initializePhotoLightbox(allGalleryItems);

  let resizeDebounceTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeDebounceTimer);
    resizeDebounceTimer = setTimeout(() => {
      renderHeroBackgroundImage(
        document.querySelector("[data-hero-media]"),
        galleryManifest.heroSrcset
      );
    }, 200);
  });
}

initializeApplication();
