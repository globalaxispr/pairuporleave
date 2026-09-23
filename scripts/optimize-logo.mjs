/**
 * Logo optimization script — runs once at build preparation time.
 * Usage: node scripts/optimize-logo.mjs
 *
 * Produces:
 *   public/logo.webp    — WebP version for modern browsers (small, lossy)
 *   public/logo@2x.png  — Compressed PNG at display size ×2 (for Safari / fallback)
 *
 * The source file (public/logo.png) is NEVER modified.
 */
import sharp from "sharp";
import { existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const src = join(root, "public", "logo.png");
const outWebP = join(root, "public", "logo.webp");
const outPng2x = join(root, "public", "logo@2x.png");

// The logo is rendered at:
//  - Navbar desktop/mobile: h=38px  →  @2x = 76px tall
//  - Footer: h=44px                 →  @2x = 88px tall
//  - Admin login/sidebar: h=52px    →  @2x = 104px tall
//
// Source is 1536×1024. Scale to width=400, preserving aspect ratio.
// This yields h≈267px — well above the largest @2x display size of 104px.
const TARGET_WIDTH = 400;

async function run() {
  const meta = await sharp(src).metadata();
  console.log(`Source: ${meta.width}×${meta.height} (${(1206082 / 1024).toFixed(0)} KB)`);

  // 1. WebP — lossy, excellent quality
  await sharp(src)
    .resize({ width: TARGET_WIDTH, withoutEnlargement: true })
    .webp({ quality: 92, effort: 6 })
    .toFile(outWebP);
  const webpStat = (await import("fs")).statSync(outWebP);
  console.log(`logo.webp:   ${meta.width > TARGET_WIDTH ? TARGET_WIDTH : meta.width}px wide, ${(webpStat.size / 1024).toFixed(1)} KB`);

  // 2. PNG — compressed fallback for older Safari / Apple touch icon
  await sharp(src)
    .resize({ width: TARGET_WIDTH, withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: false })
    .toFile(outPng2x);
  const pngStat = (await import("fs")).statSync(outPng2x);
  console.log(`logo@2x.png: ${meta.width > TARGET_WIDTH ? TARGET_WIDTH : meta.width}px wide, ${(pngStat.size / 1024).toFixed(1)} KB`);

  console.log("\n✅ Done. Update Navbar, Footer, AdminSidebar, AdminLoginPage to use:");
  console.log("  <picture>");
  console.log("    <source srcSet=\"/logo.webp\" type=\"image/webp\" />");
  console.log("    <img src=\"/logo@2x.png\" alt=\"Pair Up or Leave\" ... />");
  console.log("  </picture>");
}

run().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
