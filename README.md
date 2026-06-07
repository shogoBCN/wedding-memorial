# Angélica & Thorsten — wedding memory site

Static **frontend** (bilingual ES/EN) deployed to **Firebase Hosting**, mirroring the stack used for [dra-angelica-website](../dra-angelica-website).

No Firestore or Cloud Functions are required — this site is fully static.

## Repository layout

| Path | Purpose |
| --- | --- |
| `assets/` | **Source originals** (heavy JPG + MP4). Local only — gitignored. |
| `web/assets/images/` | Optimized WebP variants (committed after `optimize:assets`) |
| `web/assets/video/` | Optimized MP4 + poster (committed after `optimize:assets`) |
| `web/assets/data/gallery.json` | Chapter layout (hand-edited) |
| `web/assets/data/media.json` | Generated image/video paths (from `optimize:assets`) |
| `web/` | HTML, CSS, JS |
| `dist/` | **Build output** (generated). Deploy this folder. |
| `scripts/` | `optimize-assets.mjs` (heavy, run once) + `build-site.mjs` (fast) |

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

## Mobile-first

- 2-column gallery on phones → 3 → 4 on larger screens
- Collapsible nav below 768px
- Video `preload="metadata"`; lazy-loaded gallery thumbnails (480w WebP)
