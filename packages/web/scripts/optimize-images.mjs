import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join, relative, basename, extname } from 'path';
import { readdirSync, statSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PUBLIC_DIR = join(__dirname, '../public');

// Files/patterns to skip (already optimized or special-purpose)
const SKIP_PREFIXES = ['og-', 'favicon'];
const SKIP_EXTENSIONS = ['.svg', '.ico', '.gif'];
const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

function findImages(dir) {
  const images = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) continue;

    const ext = extname(entry).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(ext)) continue;
    if (SKIP_PREFIXES.some(p => entry.startsWith(p))) continue;

    images.push({
      path: fullPath,
      relativePath: relative(PUBLIC_DIR, fullPath),
      name: basename(entry, ext),
      ext,
    });
  }
  return images;
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

async function showInfo() {
  const images = findImages(PUBLIC_DIR);
  if (images.length === 0) {
    console.log('No optimizable images found in public/');
    return;
  }

  console.log('Image Report\n');
  for (const image of images) {
    const meta = await sharp(image.path).metadata();
    const size = statSync(image.path).size;
    console.log(`  ${image.relativePath}  ${meta.width}x${meta.height}  ${formatSize(size)}`);
  }
}

async function optimize(targetFile) {
  const images = targetFile
    ? findImages(PUBLIC_DIR).filter(i => i.relativePath === targetFile)
    : findImages(PUBLIC_DIR);

  if (images.length === 0) {
    console.log(targetFile ? `Image not found: ${targetFile}` : 'No optimizable images found.');
    return;
  }

  for (const image of images) {
    const originalSize = statSync(image.path).size;
    const meta = await sharp(image.path).metadata();

    // Compress in-place: use a temp buffer then overwrite
    let buffer;
    if (image.ext === '.png') {
      buffer = await sharp(image.path)
        .png({ compressionLevel: 9, palette: true, quality: 80 })
        .toBuffer();
    } else if (image.ext === '.jpg' || image.ext === '.jpeg') {
      buffer = await sharp(image.path)
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer();
    } else if (image.ext === '.webp') {
      buffer = await sharp(image.path)
        .webp({ quality: 80 })
        .toBuffer();
    }

    // Only overwrite if we actually saved space
    if (buffer && buffer.length < originalSize) {
      await sharp(buffer).toFile(image.path);
      const newSize = statSync(image.path).size;
      const saved = ((originalSize - newSize) / originalSize * 100).toFixed(1);
      console.log(`  ${image.relativePath}  ${formatSize(originalSize)} -> ${formatSize(newSize)}  (-${saved}%)`);
    } else {
      console.log(`  ${image.relativePath}  ${formatSize(originalSize)}  (already optimal)`);
    }
  }
}

// CLI
const command = process.argv[2];
const arg = process.argv[3];

switch (command) {
  case 'info':
    await showInfo();
    break;
  case 'optimize':
    await optimize(arg);
    break;
  default:
    console.log('Usage:');
    console.log('  node scripts/optimize-images.mjs info                Show image sizes');
    console.log('  node scripts/optimize-images.mjs optimize            Optimize all images');
    console.log('  node scripts/optimize-images.mjs optimize <file>     Optimize a single file');
    process.exit(command ? 1 : 0);
}
