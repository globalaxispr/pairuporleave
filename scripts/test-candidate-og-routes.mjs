import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import handler from "../api/candidate.ts";

console.log("=== TESTING CANDIDATE OPEN GRAPH ROUTES & PREVIEWS ===");

const CANDIDATE_A = {
  id: "04cd3cd6-8b53-4d10-9f31-3d184cf4268e",
  name: "STANLEY & GINOU",
};

const CANDIDATE_B = {
  id: "2ba6e081-63f1-4911-ae0c-c5ad9a555e74",
  name: "BABAS & CYCY",
};

// 1. Verify static prerendered HTML files
function extractMeta(html) {
  const titleMatch = html.match(/<title>(.*?)<\/title>/);
  const ogTitleMatch = html.match(/<meta property="og:title" content="(.*?)"/);
  const ogImageMatch = html.match(/<meta property="og:image" content="(.*?)"/);
  const ogDescMatch = html.match(/<meta property="og:description" content="(.*?)"/);
  const canonicalMatch = html.match(/<link rel="canonical" href="(.*?)"/);

  return {
    title: titleMatch ? titleMatch[1] : null,
    ogTitle: ogTitleMatch ? ogTitleMatch[1] : null,
    ogImage: ogImageMatch ? ogImageMatch[1] : null,
    ogDesc: ogDescMatch ? ogDescMatch[1] : null,
    canonical: canonicalMatch ? canonicalMatch[1] : null,
  };
}

const htmlPathA = path.resolve(`public/candidate/${CANDIDATE_A.id}/index.html`);
const htmlPathB = path.resolve(`public/candidate/${CANDIDATE_B.id}/index.html`);

assert(fs.existsSync(htmlPathA), `Candidate A HTML must exist at ${htmlPathA}`);
assert(fs.existsSync(htmlPathB), `Candidate B HTML must exist at ${htmlPathB}`);

const metaA = extractMeta(fs.readFileSync(htmlPathA, "utf8"));
const metaB = extractMeta(fs.readFileSync(htmlPathB, "utf8"));

console.log("\n--- Candidate A (Stanley & Ginou) Metadata ---");
console.log("  Title:    ", metaA.title);
console.log("  OG Title: ", metaA.ogTitle);
console.log("  OG Image: ", metaA.ogImage);
console.log("  Canonical:", metaA.canonical);

console.log("\n--- Candidate B (Babas & Cycy) Metadata ---");
console.log("  Title:    ", metaB.title);
console.log("  OG Title: ", metaB.ogTitle);
console.log("  OG Image: ", metaB.ogImage);
console.log("  Canonical:", metaB.canonical);

// Assert differences
assert.notStrictEqual(metaA.title, metaB.title, "Candidate A and B must have different titles");
assert.notStrictEqual(metaA.ogTitle, metaB.ogTitle, "Candidate A and B must have different og:titles");
assert.notStrictEqual(metaA.ogImage, metaB.ogImage, "Candidate A and B must have different og:images");
assert.notStrictEqual(metaA.canonical, metaB.canonical, "Candidate A and B must have different canonical URLs");

assert(metaA.ogTitle.includes("STANLEY"), "Candidate A og:title must contain STANLEY");
assert(metaB.ogTitle.includes("BABAS"), "Candidate B og:title must contain BABAS");

assert(metaA.ogImage.includes(CANDIDATE_A.id), "Candidate A og:image must point to candidate A ID");
assert(metaB.ogImage.includes(CANDIDATE_B.id), "Candidate B og:image must point to candidate B ID");

// Verify image files exist and are valid sizes
const imgPathA = path.resolve(`public/og/${CANDIDATE_A.id}.jpg`);
const imgPathB = path.resolve(`public/og/${CANDIDATE_B.id}.jpg`);

assert(fs.existsSync(imgPathA), `Candidate A 1200x630 OG image must exist at ${imgPathA}`);
assert(fs.existsSync(imgPathB), `Candidate B 1200x630 OG image must exist at ${imgPathB}`);

const sizeA = fs.statSync(imgPathA).size;
const sizeB = fs.statSync(imgPathB).size;
console.log(`\nCandidate A image size: ${(sizeA / 1024).toFixed(1)} KB`);
console.log(`Candidate B image size: ${(sizeB / 1024).toFixed(1)} KB`);
assert(sizeA > 20000 && sizeA < 300000, "Image A must be between 20KB and 300KB (WhatsApp optimal)");
assert(sizeB > 20000 && sizeB < 300000, "Image B must be between 20KB and 300KB (WhatsApp optimal)");

// 2. Test api/candidate.ts serverless function with mock req/res
async function testApiHandler(candidateId) {
  return new Promise((resolve, reject) => {
    let responseBody = "";
    let statusCode = 200;
    let headers = {};

    const req = {
      url: `/api/candidate?id=${candidateId}`,
      query: { id: candidateId },
    };

    const res = {
      writeHead(code, h) {
        statusCode = code;
        headers = h;
      },
      end(chunk) {
        if (chunk) responseBody += chunk;
        resolve({ statusCode, headers, body: responseBody });
      },
    };

    handler(req, res).catch(reject);
  });
}

console.log("\n--- Testing api/candidate.ts Serverless Function ---");
const resApiA = await testApiHandler(CANDIDATE_A.id);
assert.strictEqual(resApiA.statusCode, 200, "API handler must return HTTP 200 for Candidate A");
assert(resApiA.headers["Content-Type"].includes("text/html"), "API handler must return text/html");
const apiMetaA = extractMeta(resApiA.body);
assert(apiMetaA.ogTitle.includes("STANLEY"), "API returned HTML must contain STANLEY in og:title");

const resApiB = await testApiHandler(CANDIDATE_B.id);
assert.strictEqual(resApiB.statusCode, 200, "API handler must return HTTP 200 for Candidate B");
const apiMetaB = extractMeta(resApiB.body);
assert(apiMetaB.ogTitle.includes("BABAS"), "API returned HTML must contain BABAS in og:title");

assert.notStrictEqual(apiMetaA.ogTitle, apiMetaB.ogTitle, "API outputs for Candidate A and B must differ");
assert.notStrictEqual(apiMetaA.ogImage, apiMetaB.ogImage, "API images for Candidate A and B must differ");

console.log("\n✓ ALL OPEN GRAPH ROUTE TESTS PASSED SUCCESSFULLY (100%)!");

