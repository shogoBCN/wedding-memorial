# Angélica & Thorsten — wedding memory site

Static **frontend** (bilingual ES/EN) deployed to **Firebase Hosting**, mirroring the stack used for [dra-angelica-website](../dra-angelica-website).

No Firestore or Cloud Functions are required — this site is fully static.

## Repository layout

| Path | Purpose |
| --- | --- |
| `assets/` | **Source originals** (heavy JPG + MP4). Local only — gitignored. |
| `web/assets/images/` | Optimized WebP variants (committed after `optimize:assets`) |
| `web/assets/video/` | Optimized MP4 + poster (committed after `optimize:assets`) |
| `web/assets/data/gallery.json` | Chapter layout — image IDs grouped by wedding moment (hand-edited) |
| `web/assets/data/media.json` | Generated paths and dimensions (from `optimize:assets`) |
| `web/assets/js/main.js` | Client application (gallery, lightbox, navigation) |
| `web/assets/js/merge-gallery-manifest.js` | Shared merge logic (browser + build) |
| `web/` | HTML, CSS, JS source |
| `dist/` | **Build output** (generated). Deploy this folder. |
| `scripts/` | Asset optimization + production build |

## Code overview

| File | Role |
| --- | --- |
| `web/index.html` | Page structure: hero, video, gallery shell, thank-you, lightbox `<dialog>` |
| `web/assets/js/main.js` | Loads manifests, renders gallery/lightbox, nav, scroll effects |
| `web/assets/js/merge-gallery-manifest.js` | Joins `gallery.json` image IDs with `media.json` paths |
| `web/assets/css/main.css` | Mobile-first styles and design tokens |
| `scripts/optimize-assets.mjs` | One-time heavy processing (sharp + ffmpeg) |
| `scripts/build-site.mjs` | Fast copy to `dist/`, merge manifests, cache-bust HTML |
| `scripts/lib/media-config.mjs` | Shared paths and responsive image width constants |
| `scripts/lib/merge-gallery.mjs` | Re-exports browser merge module for Node build |

**Local dev** merges manifests in the browser. **Production** (`dist/`) ships a pre-merged `gallery.json` so visitors need one JSON fetch.

## Two-step workflow

### 1. Optimize assets (once, or when photos/video change)

Heavy work — reads `assets/`, writes into `web/assets/`:

```bash
conda env create -f environment.yml   # once
conda activate wedding
cd wedding-memorial
npm install          # once
npm run optimize:assets
```

| Source | Output | Strategy |
| --- | --- | --- |
| `assets/images/*.JPG` (~3 MB each) | `web/assets/images/*-{480,960,1600}.webp` | **sharp** — responsive WebP |
| `assets/video/Angelica_Thorsten.mp4` (~870 MB) | `web/assets/video/story-720.mp4` | **ffmpeg** — 720p H.264 |
| (video) | `web/assets/video/story-poster.webp` | Poster frame at 8s |

Skips files already newer than their source. Requires **ffmpeg** on PATH.

Commit the optimized files under `web/assets/` after running this.

### 2. Build (fast — every deploy)

Copies `web/` → `dist/`, merges gallery + media manifest, cache-busts HTML:

```bash
npm run build
```

## Run locally

From the **repository root**, with **`wedding`** conda env active:

### Develop against source (`web/`)

Same pattern as [dra-angelica-website](../dra-angelica-website) — serve the source tree while editing HTML, CSS, or JS:

```bash
conda activate wedding
npm run serve
```

(`npm run serve` runs `npx --yes serve web`.) Open the URL in the terminal (often **http://localhost:3000**). Stop with `Ctrl+C`.

Requires optimized media under `web/assets/` and `web/assets/data/media.json` — run `npm run optimize:assets` once first.

Do **not** open `web/index.html` via `file://`; use the local server.

### Preview the production bundle (`dist/`)

Matches what Firebase deploys:

```bash
npm run build
npm run serve:dist
```

Or in one step: `npm run preview`.

## Deploy (Firebase Hosting)

Project: **`maryi-thor-matrimonio`**

```bash
conda activate wedding
npm run firebase -- login
npm run firebase -- use maryi-thor-matrimonio
npm run deploy:hosting
```

Live URL: `https://maryi-thor-matrimonio.web.app`

### Custom domain

Firebase Hosting → Add custom domain → set DNS as shown in the console.

`robots.txt` disallows indexing (`noindex` on HTML too) — adjust if you want the site public.

## Analytics (Google Analytics 4)

| GA admin field | Value | In code? |
| --- | --- | --- |
| Stream name | maryi thor wedding | — (admin only) |
| Measurement ID | `G-QJ8JVNXVEH` | Yes — `index.html` gtag + `main.js` |
| Stream ID | `15020149553` | No — not used by gtag (admin only) |
| Stream URL | your live site URL | Set in GA admin when deployed |

The gtag snippet loads from `googletagmanager.com`. CSP allows Google Analytics scripts and beacons. Hash navigation (`#historia`, `#galeria`, …) sends virtual page views via `main.js`.

After deploy, verify in GA **Reports → Realtime** or [Tag Assistant](https://tagassistant.google.com/).

`noindex` / `robots.txt` block search engines only — they do not affect Analytics.

## Mobile-first behaviour

- 2-column gallery on phones → 3 → 4 on larger screens
- Collapsible nav below 768px
- Video `preload="metadata"`; lazy-loaded gallery thumbnails (480w WebP)
- Lightbox: fixed full-screen dialog, swipe + keyboard navigation, chapter-aware order
