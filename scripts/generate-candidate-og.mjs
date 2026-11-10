import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const CANDIDATES = [
  {
    id: "04cd3cd6-8b53-4d10-9f31-3d184cf4268e",
    name: "STANLEY & GINOU",
    displayName: "STANLEY & GINOU",
    personOneName: "STANLEY",
    personTwoName: "GINOU",
    type: "couple",
    price: "$2/vote",
    p1Url: "https://wbecjmayzdzlcpajwzey.supabase.co/storage/v1/object/public/candidates/candidates/04cd3cd6-8b53-4d10-9f31-3d184cf4268e_p1.JPG",
    p2Url: "https://wbecjmayzdzlcpajwzey.supabase.co/storage/v1/object/public/candidates/candidates/04cd3cd6-8b53-4d10-9f31-3d184cf4268e_p2.JPG",
  },
  {
    id: "2ba6e081-63f1-4911-ae0c-c5ad9a555e74",
    name: "BABAS & CYCY",
    displayName: "BABAS & CYCY",
    personOneName: "BABAS",
    personTwoName: "CYCY",
    type: "couple",
    price: "$2/vote",
    p1Url: "https://wbecjmayzdzlcpajwzey.supabase.co/storage/v1/object/public/candidates/candidates/2ba6e081-63f1-4911-ae0c-c5ad9a555e74_p1.jpeg",
    p2Url: "https://wbecjmayzdzlcpajwzey.supabase.co/storage/v1/object/public/candidates/candidates/2ba6e081-63f1-4911-ae0c-c5ad9a555e74_p2.jpeg",
  },
  {
    id: "4be7ca71-0220-4118-8574-96d69bead207",
    name: "PRINCE REMY & SANTANA",
    displayName: "PRINCE REMY & SANTANA",
    personOneName: "PRINCE REMY",
    personTwoName: "SANTANA",
    type: "couple",
    price: "$2/vote",
    p1Url: "https://wbecjmayzdzlcpajwzey.supabase.co/storage/v1/object/public/candidates/candidates/4be7ca71-0220-4118-8574-96d69bead207_p1.PNG",
    p2Url: "https://wbecjmayzdzlcpajwzey.supabase.co/storage/v1/object/public/candidates/candidates/4be7ca71-0220-4118-8574-96d69bead207_p2.PNG",
  },
  {
    id: "29300743-0005-4ccd-8678-12b910b68138",
    name: "DAA KIDD & CHLOÉ",
    displayName: "DAA KIDD & CHLOÉ",
    personOneName: "DAA KIDD",
    personTwoName: "CHLOÉ",
    type: "couple",
    price: "$2/vote",
    p1Url: "https://wbecjmayzdzlcpajwzey.supabase.co/storage/v1/object/public/candidates/candidates/29300743-0005-4ccd-8678-12b910b68138_p1.JPG",
    p2Url: "https://wbecjmayzdzlcpajwzey.supabase.co/storage/v1/object/public/candidates/candidates/29300743-0005-4ccd-8678-12b910b68138_p2.JPG",
  },
  {
    id: "6453902e-184f-4248-a648-13a49903561e",
    name: "NERVA & MILDRED",
    displayName: "NERVA & MILDRED",
    personOneName: "NERVA",
    personTwoName: "MILDRED",
    type: "couple",
    price: "$2/vote",
    p1Url: "https://wbecjmayzdzlcpajwzey.supabase.co/storage/v1/object/public/candidates/candidates/6453902e-184f-4248-a648-13a49903561e_p1.PNG",
    p2Url: "https://wbecjmayzdzlcpajwzey.supabase.co/storage/v1/object/public/candidates/candidates/6453902e-184f-4248-a648-13a49903561e_p2.jpeg",
  },
];

const OG_DIR = path.resolve("public/og");
if (!fs.existsSync(OG_DIR)) {
  fs.mkdirSync(OG_DIR, { recursive: true });
}

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function escapeXml(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function createRoundedRectMask(width, height, radius) {
  return Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="#ffffff" />
    </svg>
  `);
}

async function createFramedPhoto(buffer, width, height, radius = 24, nameLabel = "") {
  const resized = await sharp(buffer)
    .resize(width, height, { fit: "cover", position: "center" })
    .toBuffer();

  const mask = createRoundedRectMask(width, height, radius);

  const rounded = await sharp(resized)
    .composite([
      { input: mask, blend: "dest-in" },
      {
        input: Buffer.from(`
          <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
            <!-- Subtle gradient scrim at bottom for text readability -->
            <defs>
              <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
                <stop offset="60%" stop-color="#000000" stop-opacity="0" />
                <stop offset="100%" stop-color="#000000" stop-opacity="0.8" />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="url(#scrim)" />
            <!-- Border ring -->
            <rect x="1.5" y="1.5" width="${width - 3}" height="${height - 3}" rx="${radius}" ry="${radius}" fill="none" stroke="#FFE1E8" stroke-width="3" stroke-opacity="0.85" />
            ${nameLabel ? `
              <text x="${width / 2}" y="${height - 18}" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="16" font-weight="800" fill="#FFFFFF" text-anchor="middle" letter-spacing="0.08em">${escapeXml(nameLabel).toUpperCase()}</text>
            ` : ""}
          </svg>
        `),
        blend: "over",
      },
    ])
    .png()
    .toBuffer();

  return rounded;
}

async function generateCandidateOgImage(candidate) {
  const canvasWidth = 1200;
  const canvasHeight = 630;

  console.log(`Generating 1200x630 OG image for ${candidate.name}...`);

  const [p1Buf, p2Buf] = await Promise.all([
    fetchBuffer(candidate.p1Url),
    fetchBuffer(candidate.p2Url),
  ]);

  const photoWidth = 270;
  const photoHeight = 420;
  const photoY = 110;
  const photo1X = 610;
  const photo2X = 900;

  const framed1 = await createFramedPhoto(p1Buf, photoWidth, photoHeight, 22, candidate.personOneName);
  const framed2 = await createFramedPhoto(p2Buf, photoWidth, photoHeight, 22, candidate.personTwoName);

  // SVG background and typography overlay
  const svgOverlay = Buffer.from(`
    <svg width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#24050E" />
          <stop offset="45%" stop-color="#4A061C" />
          <stop offset="100%" stop-color="#7A0C2E" />
        </linearGradient>
        <linearGradient id="goldGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#F59E0B" />
          <stop offset="100%" stop-color="#FBBF24" />
        </linearGradient>
        <linearGradient id="ctaGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#E51B3E" />
          <stop offset="100%" stop-color="#C41230" />
        </linearGradient>
        <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="8" stdDeviation="16" flood-color="#000000" flood-opacity="0.45" />
        </filter>
      </defs>

      <!-- Background with rich deep luxury tones -->
      <rect width="${canvasWidth}" height="${canvasHeight}" fill="url(#bgGrad)" />

      <!-- Subtle ambient glowing orbs -->
      <circle cx="150" cy="120" r="280" fill="#E51B3E" opacity="0.18" />
      <circle cx="1080" cy="540" r="320" fill="#7A0C2E" opacity="0.3" />

      <!-- Left Column Content (Branding, Titles, Vote CTA) -->
      <g transform="translate(70, 90)">
        <!-- Official Brand Eyebrow Badge -->
        <rect x="0" y="0" width="220" height="34" rx="17" fill="#FFE1E8" fill-opacity="0.15" stroke="#FFE1E8" stroke-opacity="0.3" stroke-width="1.5" />
        <text x="110" y="22" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="800" fill="#FFCCD5" text-anchor="middle" letter-spacing="0.12em">
          PAIR UP OR LEAVE • S1
        </text>

        <!-- Subheading -->
        <text x="0" y="75" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="700" fill="#FBBF24" letter-spacing="0.06em">
          OFFICIAL COUPLE CONTESTANTS
        </text>

        <!-- Couple Name (Large display typography) -->
        <text x="0" y="140" font-family="system-ui, -apple-system, sans-serif" font-size="${candidate.displayName.length > 18 ? 38 : 46}" font-weight="900" fill="#FFFFFF" letter-spacing="-0.02em" filter="url(#shadow)">
          ${escapeXml(candidate.displayName)}
        </text>

        <!-- Description / Motivation -->
        <text x="0" y="195" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="500" fill="#F0DCE2" opacity="0.9">
          Cast your vote to send them to the Reality Show!
        </text>
        <text x="0" y="225" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="600" fill="#FFE1E8" opacity="0.8">
          Public Voting Closes Dec 1, 2026 • 11:59 PM EST
        </text>

        <!-- Vote Button CTA -->
        <g transform="translate(0, 270)">
          <rect x="0" y="0" width="280" height="58" rx="29" fill="url(#ctaGrad)" filter="url(#shadow)" />
          <text x="140" y="36" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="800" fill="#FFFFFF" text-anchor="middle" letter-spacing="0.04em">
            VOTE NOW (${candidate.price})
          </text>
        </g>

        <!-- Official Website Link -->
        <text x="0" y="380" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="700" fill="#FBBF24" letter-spacing="0.05em">
          www.pairuporleave.com
        </text>
      </g>
    </svg>
  `);

  const outputPath = path.join(OG_DIR, `${candidate.id}.jpg`);

  await sharp(svgOverlay)
    .composite([
      { input: framed1, left: photo1X, top: photoY },
      { input: framed2, left: photo2X, top: photoY },
    ])
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(outputPath);

  const stats = fs.statSync(outputPath);
  console.log(`✓ Saved ${outputPath} (${(stats.size / 1024).toFixed(1)} KB)`);

  // Also copy to dist/og if dist exists
  const distOgDir = path.resolve("dist/og");
  if (fs.existsSync(path.resolve("dist"))) {
    if (!fs.existsSync(distOgDir)) fs.mkdirSync(distOgDir, { recursive: true });
    fs.copyFileSync(outputPath, path.join(distOgDir, `${candidate.id}.jpg`));
  }

  // Generate static candidate HTML page using compiled dist/index.html when available
  const distIndexPath = path.resolve("dist/index.html");
  const baseHtmlPath = fs.existsSync(distIndexPath)
    ? distIndexPath
    : path.resolve("index.html");

  const baseHtml = fs.readFileSync(baseHtmlPath, "utf8");
  const candidateHtml = baseHtml
    .replace(
      /<title>.*?<\/title>/,
      `<title>Vote for ${escapeXml(candidate.displayName)} — PAIR UP OR LEAVE</title>`
    )
    .replace(
      /<meta name="description" content=".*?" \/>/,
      `<meta name="description" content="Vote for ${escapeXml(candidate.displayName)} on PAIR UP OR LEAVE! Official Reality Show voting competition. Cast your verified votes now." />`
    )
    .replace(
      /<link rel="canonical" href=".*?" \/>/,
      `<link rel="canonical" href="https://www.pairuporleave.com/candidate/${candidate.id}" />`
    )
    .replace(
      /<meta property="og:title" content=".*?" \/>/,
      `<meta property="og:title" content="Vote for ${escapeXml(candidate.displayName)} — PAIR UP OR LEAVE" />`
    )
    .replace(
      /<meta property="og:description" content=".*?" \/>/,
      `<meta property="og:description" content="Support ${escapeXml(candidate.displayName)} on Pair Up or Leave! Cast your verified votes in the official Reality Show competition." />`
    )
    .replace(
      /<meta property="og:image" content=".*?" \/>/,
      `<meta property="og:image" content="https://www.pairuporleave.com/og/${candidate.id}.jpg" />\n    <meta property="og:image:secure_url" content="https://www.pairuporleave.com/og/${candidate.id}.jpg" />\n    <meta property="og:image:type" content="image/jpeg" />`
    )
    .replace(
      /<meta property="og:image:alt" content=".*?" \/>/,
      `<meta property="og:image:alt" content="Vote for ${escapeXml(candidate.displayName)} — Pair Up or Leave" />`
    )
    .replace(
      /<meta property="og:url" content=".*?" \/>/,
      `<meta property="og:url" content="https://www.pairuporleave.com/candidate/${candidate.id}" />`
    )
    .replace(
      /<meta name="twitter:title" content=".*?" \/>/,
      `<meta name="twitter:title" content="Vote for ${escapeXml(candidate.displayName)} — PAIR UP OR LEAVE" />`
    )
    .replace(
      /<meta name="twitter:description" content=".*?" \/>/,
      `<meta name="twitter:description" content="Support ${escapeXml(candidate.displayName)} on Pair Up or Leave! Cast your verified votes now." />`
    )
    .replace(
      /<meta name="twitter:image" content=".*?" \/>/,
      `<meta name="twitter:image" content="https://www.pairuporleave.com/og/${candidate.id}.jpg" />`
    )
    .replace(
      /<meta name="twitter:image:alt" content=".*?" \/>/,
      `<meta name="twitter:image:alt" content="Vote for ${escapeXml(candidate.displayName)} — Pair Up or Leave" />`
    );

  // Write to public/candidate/<id>/index.html
  const candDir = path.resolve(`public/candidate/${candidate.id}`);
  if (!fs.existsSync(candDir)) fs.mkdirSync(candDir, { recursive: true });
  fs.writeFileSync(path.join(candDir, "index.html"), candidateHtml, "utf8");

  // Write to dist/candidate/<id>/index.html if dist exists
  if (fs.existsSync(path.resolve("dist"))) {
    const distCandDir = path.resolve(`dist/candidate/${candidate.id}`);
    if (!fs.existsSync(distCandDir)) fs.mkdirSync(distCandDir, { recursive: true });
    fs.writeFileSync(path.join(distCandDir, "index.html"), candidateHtml, "utf8");
  }

  console.log(`✓ Generated static Open Graph HTML for ${candidate.name} (using ${path.basename(baseHtmlPath)})`);
}

async function run() {
  console.log(`Generating Open Graph candidate banners for ${CANDIDATES.length} active candidates...`);
  for (const c of CANDIDATES) {
    try {
      await generateCandidateOgImage(c);
    } catch (err) {
      console.error(`Failed to generate OG image for ${c.name}:`, err);
    }
  }
  console.log("All candidate Open Graph images generated successfully!");
}

run();
