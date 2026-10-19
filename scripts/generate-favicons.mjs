import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const src = path.join(root, "public", "logo.png");

async function generateFavicons() {
  const trimmed = await sharp(src).trim().toBuffer();

  // 1. Apple Touch Icon: 180x180 with clean padding
  await sharp(trimmed)
    .resize(160, 160, { fit: "inside" })
    .extend({
      top: 10,
      bottom: 10,
      left: 10,
      right: 10,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(path.join(root, "public", "apple-touch-icon.png"));
  console.log("✓ Created public/apple-touch-icon.png (180x180)");

  // 2. Favicon 32x32 PNG
  await sharp(trimmed)
    .resize(32, 32, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(root, "public", "favicon-32x32.png"));
  console.log("✓ Created public/favicon-32x32.png");

  // 3. Favicon 16x16 PNG
  await sharp(trimmed)
    .resize(16, 16, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(root, "public", "favicon-16x16.png"));
  console.log("✓ Created public/favicon-16x16.png");

  // 4. Favicon 48x48 PNG (general fallback)
  const p48Buf = await sharp(trimmed)
    .resize(48, 48, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(root, "public", "favicon.png"), p48Buf);
  console.log("✓ Created public/favicon.png (48x48)");

  // 5. Multi-resolution ICO (16x16, 32x32, 48x48)
  const b16 = await sharp(trimmed).resize(16, 16, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const b32 = await sharp(trimmed).resize(32, 32, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const b48 = p48Buf;

  const numImages = 3;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // ICO format
  header.writeUInt16LE(numImages, 4); // Count

  let offset = 6 + (16 * numImages);
  const entries = [];
  const images = [
    { buf: b16, width: 16, height: 16 },
    { buf: b32, width: 32, height: 32 },
    { buf: b48, width: 48, height: 48 },
  ];

  for (const img of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(img.width, 0);
    entry.writeUInt8(img.height, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(img.buf.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += img.buf.length;
  }

  const icoBuf = Buffer.concat([header, ...entries, ...images.map((i) => i.buf)]);
  fs.writeFileSync(path.join(root, "public", "favicon.ico"), icoBuf);
  console.log(`✓ Created public/favicon.ico (${icoBuf.length} bytes)`);

  // 6. SVG Favicon embedding official branding
  const base64Png = p48Buf.toString("base64");
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
  <image href="data:image/png;base64,${base64Png}" width="48" height="48" />
</svg>
`;
  fs.writeFileSync(path.join(root, "public", "favicon.svg"), svgContent);
  console.log("✓ Replaced public/favicon.svg with official branding");
}

generateFavicons().catch(console.error);
