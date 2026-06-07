/**
 * One-time / on-demand asset optimization.
 * Reads heavy originals from assets/, writes web-ready files into web/assets/.
 * Re-run only when you add or replace photos or video.
 */
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, dirname, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import sharp from "sharp";
import {
  IMAGE_WIDTHS,
  IMAGE_WIDTH_XL,
  SOURCE_IMAGES_DIR,
  SOURCE_VIDEO_PATH,
  WEB_IMAGES_DIR,
  WEB_VIDEO_DIR,
  MEDIA_MANIFEST_PATH,
} from "./lib/media-config.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceImages = join(root, SOURCE_IMAGES_DIR);
const sourceVideo = join(root, SOURCE_VIDEO_PATH);
const outImages = join(root, WEB_IMAGES_DIR);
const outVideo = join(root, WEB_VIDEO_DIR);
const mediaManifestPath = join(root, MEDIA_MANIFEST_PATH);

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function fileSize(path) {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

async function isFresh(outputPath, inputPath) {
  try {
    const [outStat, inStat] = await Promise.all([stat(outputPath), stat(inputPath)]);
    return outStat.mtimeMs >= inStat.mtimeMs;
  } catch {
    return false;
  }
}

function runCommand(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

async function optimizeImage(inputPath, stem, outDir) {
  const meta = await sharp(inputPath).metadata();
  const widths = [...IMAGE_WIDTHS];
  if ((meta.width ?? 0) > IMAGE_WIDTH_XL) widths.push(IMAGE_WIDTH_XL);
  else if ((meta.width ?? 0) > 1600 && !widths.includes(meta.width)) widths.push(meta.width);

  const variants = {};
  let totalOut = 0;

  for (const w of widths) {
    const outName = `${stem}-${w}.webp`;
    const outPath = join(outDir, outName);
    const targetW = Math.min(w, meta.width ?? w);

    if (!(await isFresh(outPath, inputPath))) {
      await sharp(inputPath)
        .rotate()
        .resize({ width: targetW, withoutEnlargement: true })
        .webp({ quality: 82, effort: 4 })
        .toFile(outPath);
      console.info(`  wrote ${outName}`);
    }

    totalOut += await fileSize(outPath);
    variants[String(targetW)] = `assets/images/${outName}`;
  }

  return { width: meta.width, height: meta.height, variants, bytes: totalOut };
}

async function optimizeVideo(inputPath, outDir) {
  const outVideoFile = join(outDir, "story-720.mp4");
  const outPoster = join(outDir, "story-poster.webp");

  if (!(await isFresh(outVideoFile, inputPath))) {
    console.info("  encoding story-720.mp4 (720p H.264)…");
    await runCommand("ffmpeg", [
      "-y",
      "-i",
      inputPath,
      "-c:v",
      "libx264",
      "-crf",
      "28",
      "-preset",
      "medium",
      "-vf",
      "scale=-2:720",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      outVideoFile,
    ]);
  }

  const posterJpg = join(outDir, "story-poster.jpg");
  if (!(await isFresh(outPoster, inputPath))) {
    console.info("  extracting story-poster.webp…");
    await runCommand("ffmpeg", [
      "-y",
      "-ss",
      "00:00:08",
      "-i",
      inputPath,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      "-update",
      "1",
      posterJpg,
    ]);
    await sharp(posterJpg).rotate().webp({ quality: 85 }).toFile(outPoster);
    await rm(posterJpg, { force: true });
  }

  return {
    src: "assets/video/story-720.mp4",
    poster: "assets/video/story-poster.webp",
    bytes: (await fileSize(outVideoFile)) + (await fileSize(outPoster)),
  };
}

console.info("optimize-assets: images…");
await mkdir(outImages, { recursive: true });

let entries;
try {
  entries = await readdir(sourceImages);
} catch {
  throw new Error("optimize-assets: missing assets/images/ — add photographer originals there.");
}

const jpgs = entries.filter((f) => /\.jpe?g$/i.test(f)).sort();
const images = {};
let imgSourceBytes = 0;
let imgOutputBytes = 0;

for (const file of jpgs) {
  const inputPath = join(sourceImages, file);
  const stem = basename(file, extname(file));
  imgSourceBytes += await fileSize(inputPath);
  console.info(`→ ${file}`);
  const result = await optimizeImage(inputPath, stem, outImages);
  imgOutputBytes += result.bytes;
  images[stem] = {
    width: result.width,
    height: result.height,
    variants: result.variants,
  };
}

console.info(
  `optimize-assets: images ${formatBytes(imgSourceBytes)} → ${formatBytes(imgOutputBytes)} (${jpgs.length} photos)`
);

let video = null;
console.info("optimize-assets: video…");
try {
  const videoInSize = await fileSize(sourceVideo);
  await mkdir(outVideo, { recursive: true });
  video = await optimizeVideo(sourceVideo, outVideo);
  console.info(`optimize-assets: video ${formatBytes(videoInSize)} → ${formatBytes(video.bytes)}`);
} catch (err) {
  console.warn("optimize-assets: video skipped —", err.message);
  console.warn("  Requires ffmpeg and", SOURCE_VIDEO_PATH);
}

const manifest = {
  generatedAt: new Date().toISOString(),
  images,
  video,
};

await mkdir(dirname(mediaManifestPath), { recursive: true });
await writeFile(mediaManifestPath, JSON.stringify(manifest, null, 2));
console.info(`optimize-assets: wrote ${MEDIA_MANIFEST_PATH}`);
