/**
 * optimize-assets.mjs
 *
 * Heavy, infrequent pipeline: reads photographer originals from `assets/`,
 * writes optimized WebP images and H.264 video into `web/assets/`, and generates
 * `web/assets/data/media.json`.
 *
 * Re-run when photos or video change: `npm run optimize:assets`
 * Requires: sharp (npm), ffmpeg (system PATH).
 */

import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join, dirname, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import sharp from "sharp";
import {
  RESPONSIVE_IMAGE_WIDTHS,
  EXTRA_LARGE_IMAGE_WIDTH,
  SOURCE_IMAGES_DIRECTORY,
  SOURCE_VIDEO_FILE_PATH,
  WEB_IMAGES_DIRECTORY,
  WEB_VIDEO_DIRECTORY,
  MEDIA_MANIFEST_PATH,
} from "./lib/media-config.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceImagesDirectory = join(repositoryRoot, SOURCE_IMAGES_DIRECTORY);
const sourceVideoFilePath = join(repositoryRoot, SOURCE_VIDEO_FILE_PATH);
const webImagesOutputDirectory = join(repositoryRoot, WEB_IMAGES_DIRECTORY);
const webVideoOutputDirectory = join(repositoryRoot, WEB_VIDEO_DIRECTORY);
const mediaManifestFilePath = join(repositoryRoot, MEDIA_MANIFEST_PATH);

/**
 * @param {number} byteCount
 * @returns {string}
 */
function formatByteCountAsHumanReadable(byteCount) {
  if (byteCount < 1024) return `${byteCount} B`;
  if (byteCount < 1024 * 1024) return `${(byteCount / 1024).toFixed(1)} KB`;
  return `${(byteCount / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * @param {string} filePath
 * @returns {Promise<number>}
 */
async function getFileSizeInBytes(filePath) {
  try {
    return (await stat(filePath)).size;
  } catch {
    return 0;
  }
}

/**
 * Skip re-encoding when the output file is newer than the source (incremental builds).
 *
 * @param {string} outputPath
 * @param {string} inputPath
 * @returns {Promise<boolean>}
 */
async function isOutputNewerThanSource(outputPath, inputPath) {
  try {
    const [outputStats, inputStats] = await Promise.all([stat(outputPath), stat(inputPath)]);
    return outputStats.mtimeMs >= inputStats.mtimeMs;
  } catch {
    return false;
  }
}

/**
 * @param {string} command
 * @param {string[]} argumentsList
 * @returns {Promise<void>}
 */
function runShellCommand(command, argumentsList) {
  return new Promise((resolve, reject) => {
    const childProcess = spawn(command, argumentsList, { stdio: "inherit" });
    childProcess.on("error", reject);
    childProcess.on("close", (exitCode) => {
      if (exitCode === 0) resolve();
      else reject(new Error(`${command} exited with code ${exitCode}`));
    });
  });
}

/**
 * Generate responsive WebP variants for one JPEG and return manifest metadata.
 *
 * @param {string} inputFilePath
 * @param {string} fileNameStem - e.g. "IMG_5637"
 * @param {string} outputDirectory
 */
async function optimizePhotographToWebpVariants(inputFilePath, fileNameStem, outputDirectory) {
  const imageMetadata = await sharp(inputFilePath).metadata();
  const targetWidths = [...RESPONSIVE_IMAGE_WIDTHS];

  if ((imageMetadata.width ?? 0) > EXTRA_LARGE_IMAGE_WIDTH) {
    targetWidths.push(EXTRA_LARGE_IMAGE_WIDTH);
  } else if (
    (imageMetadata.width ?? 0) > 1600 &&
    !targetWidths.includes(imageMetadata.width)
  ) {
    targetWidths.push(imageMetadata.width);
  }

  const variantPathsByWidth = {};
  let totalOutputBytes = 0;

  for (const targetWidth of targetWidths) {
    const outputFileName = `${fileNameStem}-${targetWidth}.webp`;
    const outputFilePath = join(outputDirectory, outputFileName);
    const actualWidth = Math.min(targetWidth, imageMetadata.width ?? targetWidth);

    if (!(await isOutputNewerThanSource(outputFilePath, inputFilePath))) {
      await sharp(inputFilePath)
        .rotate() // honour EXIF orientation from camera
        .resize({ width: actualWidth, withoutEnlargement: true })
        .webp({ quality: 82, effort: 4 })
        .toFile(outputFilePath);
      console.info(`  wrote ${outputFileName}`);
    }

    totalOutputBytes += await getFileSizeInBytes(outputFilePath);
    variantPathsByWidth[String(actualWidth)] = `assets/images/${outputFileName}`;
  }

  return {
    width: imageMetadata.width,
    height: imageMetadata.height,
    variants: variantPathsByWidth,
    bytes: totalOutputBytes,
  };
}

/**
 * Transcode story video to 720p H.264 and extract a WebP poster frame.
 *
 * @param {string} inputVideoPath
 * @param {string} outputDirectory
 */
async function optimizeStoryVideoForWeb(inputVideoPath, outputDirectory) {
  const optimizedVideoPath = join(outputDirectory, "story-720.mp4");
  const posterWebpPath = join(outputDirectory, "story-poster.webp");

  if (!(await isOutputNewerThanSource(optimizedVideoPath, inputVideoPath))) {
    console.info("  encoding story-720.mp4 (720p H.264)…");
    await runShellCommand("ffmpeg", [
      "-y",
      "-i",
      inputVideoPath,
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
      optimizedVideoPath,
    ]);
  }

  const temporaryPosterJpegPath = join(outputDirectory, "story-poster.jpg");
  if (!(await isOutputNewerThanSource(posterWebpPath, inputVideoPath))) {
    console.info("  extracting story-poster.webp…");
    await runShellCommand("ffmpeg", [
      "-y",
      "-ss",
      "00:00:08",
      "-i",
      inputVideoPath,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      "-update",
      "1",
      temporaryPosterJpegPath,
    ]);
    await sharp(temporaryPosterJpegPath).rotate().webp({ quality: 85 }).toFile(posterWebpPath);
    await rm(temporaryPosterJpegPath, { force: true });
  }

  return {
    src: "assets/video/story-720.mp4",
    poster: "assets/video/story-poster.webp",
    bytes:
      (await getFileSizeInBytes(optimizedVideoPath)) +
      (await getFileSizeInBytes(posterWebpPath)),
  };
}

console.info("optimize-assets: images…");
await mkdir(webImagesOutputDirectory, { recursive: true });

let sourceDirectoryEntries;
try {
  sourceDirectoryEntries = await readdir(sourceImagesDirectory);
} catch {
  throw new Error("optimize-assets: missing assets/images/ — add photographer originals there.");
}

const jpegSourceFileNames = sourceDirectoryEntries.filter((fileName) => /\.jpe?g$/i.test(fileName)).sort();
const imagesManifest = {};
let totalSourceImageBytes = 0;
let totalOutputImageBytes = 0;

for (const jpegFileName of jpegSourceFileNames) {
  const inputFilePath = join(sourceImagesDirectory, jpegFileName);
  const fileNameStem = basename(jpegFileName, extname(jpegFileName));

  totalSourceImageBytes += await getFileSizeInBytes(inputFilePath);
  console.info(`→ ${jpegFileName}`);

  const optimizationResult = await optimizePhotographToWebpVariants(
    inputFilePath,
    fileNameStem,
    webImagesOutputDirectory
  );

  totalOutputImageBytes += optimizationResult.bytes;
  imagesManifest[fileNameStem] = {
    width: optimizationResult.width,
    height: optimizationResult.height,
    variants: optimizationResult.variants,
  };
}

console.info(
  `optimize-assets: images ${formatByteCountAsHumanReadable(totalSourceImageBytes)} → ${formatByteCountAsHumanReadable(totalOutputImageBytes)} (${jpegSourceFileNames.length} photos)`
);

let videoManifest = null;
console.info("optimize-assets: video…");

try {
  const sourceVideoBytes = await getFileSizeInBytes(sourceVideoFilePath);
  await mkdir(webVideoOutputDirectory, { recursive: true });
  videoManifest = await optimizeStoryVideoForWeb(sourceVideoFilePath, webVideoOutputDirectory);
  console.info(
    `optimize-assets: video ${formatByteCountAsHumanReadable(sourceVideoBytes)} → ${formatByteCountAsHumanReadable(videoManifest.bytes)}`
  );
} catch (videoError) {
  console.warn("optimize-assets: video skipped —", videoError.message);
  console.warn("  Requires ffmpeg and", SOURCE_VIDEO_FILE_PATH);
}

const mediaManifest = {
  generatedAt: new Date().toISOString(),
  images: imagesManifest,
  video: videoManifest,
};

await mkdir(dirname(mediaManifestFilePath), { recursive: true });
await writeFile(mediaManifestFilePath, JSON.stringify(mediaManifest, null, 2));
console.info(`optimize-assets: wrote ${MEDIA_MANIFEST_PATH}`);
