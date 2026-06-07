/**
 * Angélica & Thorsten — wedding memory site (mobile-first, static).
 */

const NAV_SECTION_IDS = ["inicio", "historia", "galeria", "gracias"];
const COLLAPSED_NAV_MQ = "(max-width: 767px)";

/** Pick best variant for viewport width (mobile-first). */
function pickVariant(variants, viewportWidth) {
  const widths = Object.keys(variants)
    .map(Number)
    .sort((a, b) => a - b);
  const chosen = widths.find((w) => w >= viewportWidth) ?? widths[widths.length - 1];
  return variants[String(chosen)];
}

function buildSrcset(variants) {
  return Object.entries(variants)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([w, path]) => `${path} ${w}w`)
    .join(", ");
}

function setHeroImage(heroMediaEl, heroSrcset) {
  if (!heroMediaEl || !heroSrcset) return;

  const img = document.createElement("img");
  const src = pickVariant(heroSrcset, window.innerWidth);
  img.src = src;
  img.srcset = buildSrcset(heroSrcset);
  img.sizes = "100vw";
  img.alt = "Angélica y Thorsten — primer baile";
  img.decoding = "async";
  img.fetchPriority = "high";

  heroMediaEl.replaceChildren(img);
}

function renderGallery(manifest) {
  const filtersEl = document.querySelector("[data-gallery-filters]");
  const gridEl = document.querySelector("[data-gallery-grid]");
  if (!filtersEl || !gridEl) return { flatItems: [] };

  const chapters = manifest.chapters ?? [];
  const flatItems = [];

  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = "gallery-filters__btn is-active";
  allBtn.dataset.chapter = "all";
  allBtn.setAttribute("role", "tab");
  allBtn.setAttribute("aria-selected", "true");
  allBtn.textContent = "Todas / All";
  filtersEl.append(allBtn);

  for (const chapter of chapters) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gallery-filters__btn";
    btn.dataset.chapter = chapter.id;
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", "false");
    btn.textContent = `${chapter.titleEs}`;
    filtersEl.append(btn);

    for (const item of chapter.items ?? []) {
      flatItems.push({ ...item, chapterId: chapter.id, caption: chapter.titleEn });
    }
  }

  function renderGrid(chapterId, animate = false) {
    gridEl.replaceChildren();
    const items =
      chapterId === "all" ? flatItems : flatItems.filter((i) => i.chapterId === chapterId);

    items.forEach((item, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = animate ? "gallery-item is-entering" : "gallery-item";
      btn.dataset.imageId = item.id;
      btn.setAttribute("role", "listitem");
      if (animate) {
        btn.style.animationDelay = `${Math.min(index * 0.055, 0.65)}s`;
      }

      if (item.width > item.height) {
        btn.classList.add("gallery-item--landscape");
      }

      const img = document.createElement("img");
      const thumb = pickVariant(item.variants, 480);
      img.src = thumb;
      img.srcset = buildSrcset(item.variants);
      img.sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw";
      img.alt = item.alt ?? "";
      img.loading = "lazy";
      img.decoding = "async";
      img.width = item.width;
      img.height = item.height;

      btn.append(img);
      gridEl.append(btn);
    });
  }

  filtersEl.addEventListener("click", (event) => {
    const btn = event.target.closest(".gallery-filters__btn");
    if (!btn) return;

    filtersEl.querySelectorAll(".gallery-filters__btn").forEach((b) => {
      const active = b === btn;
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-selected", active ? "true" : "false");
    });

    renderGrid(btn.dataset.chapter, true);
  });

  renderGrid("all", false);
  return { flatItems };
}

function initLightbox(flatItems) {
  const dialog = document.querySelector("[data-lightbox]");
  const imgEl = document.querySelector("[data-lightbox-img]");
  const captionEl = document.querySelector("[data-lightbox-caption]");
  const closeBtn = document.querySelector("[data-lightbox-close]");
  const prevBarBtn = document.querySelector("[data-lightbox-prev-bar]");
  const nextBarBtn = document.querySelector("[data-lightbox-next-bar]");
  const counterEl = document.querySelector("[data-lightbox-counter]");
  const swipeEl = document.querySelector("[data-lightbox-swipe]");
  const gridEl = document.querySelector("[data-gallery-grid]");

  if (!dialog || !imgEl || !gridEl) return;

  let currentIndex = -1;
  let visibleIds = [];

  function updateVisibleIds() {
    visibleIds = [...gridEl.querySelectorAll(".gallery-item")].map((el) => el.dataset.imageId);
  }

  function loadLightboxImage(item) {
    const src = pickVariant(item.variants, Math.min(window.innerWidth * 1.5, 1600));

    const reveal = () => {
      requestAnimationFrame(() => imgEl.classList.remove("is-changing"));
    };

    const apply = () => {
      if (captionEl) captionEl.textContent = item.caption ?? "";
      imgEl.alt = item.alt ?? "";
      imgEl.sizes = "100vw";
      imgEl.srcset = buildSrcset(item.variants);

      if (imgEl.src === new URL(src, window.location.href).href) {
        reveal();
        return;
      }

      imgEl.onload = () => {
        imgEl.onload = null;
        reveal();
      };
      imgEl.src = src;
      if (imgEl.complete) {
        imgEl.onload = null;
        reveal();
      }
    };

    if (!dialog.open) {
      apply();
      dialog.showModal();
      return;
    }

    if (imgEl.classList.contains("is-changing")) {
      apply();
      return;
    }

    const onFadedOut = (event) => {
      if (event.propertyName !== "opacity") return;
      imgEl.removeEventListener("transitionend", onFadedOut);
      apply();
    };

    imgEl.addEventListener("transitionend", onFadedOut);
    imgEl.classList.add("is-changing");
  }

  function updateCounter() {
    if (!counterEl || visibleIds.length === 0) return;
    counterEl.textContent = `${currentIndex + 1} / ${visibleIds.length}`;
  }

  function goPrev() {
    updateVisibleIds();
    showIndex(currentIndex <= 0 ? visibleIds.length - 1 : currentIndex - 1);
  }

  function goNext() {
    updateVisibleIds();
    showIndex(currentIndex >= visibleIds.length - 1 ? 0 : currentIndex + 1);
  }

  function showIndex(index) {
    if (index < 0 || index >= visibleIds.length) return;
    currentIndex = index;
    const id = visibleIds[index];
    const item = flatItems.find((i) => i.id === id);
    if (!item) return;
    loadLightboxImage(item);
    updateCounter();
  }

  gridEl.addEventListener("click", (event) => {
    const item = event.target.closest(".gallery-item");
    if (!item) return;
    updateVisibleIds();
    const index = visibleIds.indexOf(item.dataset.imageId);
    if (index >= 0) showIndex(index);
  });

  closeBtn?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  prevBarBtn?.addEventListener("click", goPrev);
  nextBarBtn?.addEventListener("click", goNext);

  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goPrev();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      goNext();
    } else if (event.key === "Escape") {
      dialog.close();
    }
  });

  let touchStartX = 0;
  let touchStartY = 0;
  const swipeTarget = swipeEl ?? dialog;

  swipeTarget.addEventListener(
    "touchstart",
    (event) => {
      touchStartX = event.touches[0]?.clientX ?? 0;
      touchStartY = event.touches[0]?.clientY ?? 0;
    },
    { passive: true }
  );
  swipeTarget.addEventListener("touchend", (event) => {
    const endX = event.changedTouches[0]?.clientX ?? 0;
    const endY = event.changedTouches[0]?.clientY ?? 0;
    const deltaX = endX - touchStartX;
    const deltaY = endY - touchStartY;
    if (Math.abs(deltaX) < 50 || Math.abs(deltaX) < Math.abs(deltaY)) return;
    if (deltaX > 0) goPrev();
    else goNext();
  });
}

function initNavigation() {
  const toggle = document.querySelector("[data-nav-toggle]");
  const nav = document.querySelector("[data-nav]");
  const links = document.querySelectorAll("[data-nav-link]");

  toggle?.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", open ? "false" : "true");
    nav?.classList.toggle("is-open", !open);
  });

  links.forEach((link) => {
    link.addEventListener("click", () => {
      if (window.matchMedia(COLLAPSED_NAV_MQ).matches) {
        toggle?.setAttribute("aria-expanded", "false");
        nav?.classList.remove("is-open");
      }
    });
  });

  const progress = document.querySelector(".scroll-progress");
  window.addEventListener(
    "scroll",
    () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      const pct = max > 0 ? (window.scrollY / max) * 100 : 0;
      if (progress) progress.style.width = `${pct}%`;
    },
    { passive: true }
  );

  const sectionEls = NAV_SECTION_IDS.map((id) => document.getElementById(id)).filter(Boolean);
  if (sectionEls.length && links.length) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = entry.target.id;
          links.forEach((link) => {
            link.classList.toggle("is-active", link.getAttribute("href") === `#${id}`);
          });
        }
      },
      { rootMargin: "-40% 0px -45% 0px", threshold: 0 }
    );
    sectionEls.forEach((el) => observer.observe(el));
  }
}

function initReveal() {
  const els = document.querySelectorAll("[data-reveal]");
  if (!els.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
  );

  els.forEach((el) => observer.observe(el));
}

function mergeGalleryConfig(galleryConfig, media) {
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

/** Dist has a pre-merged gallery.json; web/ merges gallery.json + media.json locally. */
async function loadGalleryManifest() {
  const galleryRes = await fetch("assets/data/gallery.json");
  if (!galleryRes.ok) throw new Error("missing assets/data/gallery.json");

  const gallery = await galleryRes.json();
  if (gallery.chapters?.[0]?.items?.length) {
    return gallery;
  }

  const mediaRes = await fetch("assets/data/media.json");
  if (!mediaRes.ok) {
    throw new Error("missing assets/data/media.json — run npm run optimize:assets first");
  }

  return mergeGalleryConfig(gallery, await mediaRes.json());
}

async function init() {
  initNavigation();
  initReveal();

  let manifest;
  try {
    manifest = await loadGalleryManifest();
  } catch (err) {
    console.error("Could not load gallery:", err.message);
    return;
  }

  setHeroImage(document.querySelector("[data-hero-media]"), manifest.heroSrcset);

  const videoEl = document.querySelector("[data-story-video]");
  if (manifest.video?.poster && videoEl) {
    videoEl.poster = manifest.video.poster;
  }
  if (manifest.video?.src && videoEl) {
    const source = videoEl.querySelector("source");
    if (source) source.src = manifest.video.src;
    videoEl.load();
  }

  const { flatItems } = renderGallery(manifest);
  initLightbox(flatItems);

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      setHeroImage(document.querySelector("[data-hero-media]"), manifest.heroSrcset);
    }, 200);
  });
}

init();
