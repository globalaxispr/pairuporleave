import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs";
import path from "node:path";

interface CandidateMeta {
  id: string;
  displayName: string;
  name: string;
}

const STATIC_CANDIDATES: Record<string, CandidateMeta> = {
  "04cd3cd6-8b53-4d10-9f31-3d184cf4268e": {
    id: "04cd3cd6-8b53-4d10-9f31-3d184cf4268e",
    displayName: "STANLEY & GINOU",
    name: "STANLEY & GINOU",
  },
  "2ba6e081-63f1-4911-ae0c-c5ad9a555e74": {
    id: "2ba6e081-63f1-4911-ae0c-c5ad9a555e74",
    displayName: "BABAS & CYCY",
    name: "BABAS & CYCY",
  },
  "4be7ca71-0220-4118-8574-96d69bead207": {
    id: "4be7ca71-0220-4118-8574-96d69bead207",
    displayName: "PRINCE REMY & SANTANA",
    name: "PRINCE REMY & SANTANA",
  },
  "29300743-0005-4ccd-8678-12b910b68138": {
    id: "29300743-0005-4ccd-8678-12b910b68138",
    displayName: "DAA KIDD & CHLOÉ",
    name: "DAA KIDD & CHLOÉ",
  },
  "6453902e-184f-4248-a648-13a49903561e": {
    id: "6453902e-184f-4248-a648-13a49903561e",
    displayName: "NERVA & MILDRED",
    name: "NERVA & MILDRED",
  },
};

function escapeXml(str: string): string {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export default async function handler(
  req: IncomingMessage & { query?: Record<string, string | string[]> },
  res: ServerResponse
) {
  try {
    const url = new URL(req.url || "", "https://www.pairuporleave.com");
    const rawId = (req.query?.id as string) || url.searchParams.get("id") || "";
    const candidateId = rawId.trim();

    // Verify candidate ID format (UUID check to avoid injections)
    const isUuid = /^[0-9a-fA-F-]{36}$/.test(candidateId);
    if (!isUuid) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid candidate ID" }));
      return;
    }

    // Try reading prerendered static candidate HTML if present on disk
    const prerenderedPath = path.resolve(
      process.cwd(),
      "dist",
      "candidate",
      candidateId,
      "index.html"
    );

    if (fs.existsSync(prerenderedPath)) {
      const html = fs.readFileSync(prerenderedPath, "utf8");
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=86400",
      });
      res.end(html);
      return;
    }

    // Fallback: Read base index.html and inject dynamic metadata
    const indexPath = path.resolve(process.cwd(), "dist", "index.html");
    const fallbackIndexPath = path.resolve(process.cwd(), "index.html");
    const baseHtml = fs.existsSync(indexPath)
      ? fs.readFileSync(indexPath, "utf8")
      : fs.readFileSync(fallbackIndexPath, "utf8");

    let candidate = STATIC_CANDIDATES[candidateId];

    // If candidate not in static list, fetch safe public candidate record from Supabase
    if (!candidate) {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://wbecjmayzdzlcpajwzey.supabase.co";
      const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || "";
      if (supabaseAnonKey) {
        const resp = await fetch(
          `${supabaseUrl}/rest/v1/candidates?id=eq.${candidateId}&select=id,name,display_name`,
          {
            headers: {
              apikey: supabaseAnonKey,
              Authorization: `Bearer ${supabaseAnonKey}`,
            },
          }
        );
        if (resp.ok) {
          const list = await resp.json();
          if (Array.isArray(list) && list.length > 0) {
            candidate = {
              id: list[0].id,
              displayName: list[0].display_name || list[0].name,
              name: list[0].name,
            };
          }
        }
      }
    }

    if (!candidate) {
      // Candidate not found - return base SPA so client router can render 404
      res.writeHead(404, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
      });
      res.end(baseHtml);
      return;
    }

    const title = `Vote for ${escapeXml(candidate.displayName)} — PAIR UP OR LEAVE`;
    const desc = `Vote for ${escapeXml(candidate.displayName)} on PAIR UP OR LEAVE! Official Reality Show voting competition. Cast your verified votes now.`;
    const canonical = `https://www.pairuporleave.com/candidate/${candidate.id}`;
    const ogImage = `https://www.pairuporleave.com/og/${candidate.id}.jpg`;

    const injectedHtml = baseHtml
      .replace(/<title>.*?<\/title>/, `<title>${title}</title>`)
      .replace(
        /<meta name="description" content=".*?" \/>/,
        `<meta name="description" content="${desc}" />`
      )
      .replace(/<link rel="canonical" href=".*?" \/>/, `<link rel="canonical" href="${canonical}" />`)
      .replace(/<meta property="og:title" content=".*?" \/>/, `<meta property="og:title" content="${title}" />`)
      .replace(/<meta property="og:description" content=".*?" \/>/, `<meta property="og:description" content="${desc}" />`)
      .replace(
        /<meta property="og:image" content=".*?" \/>/,
        `<meta property="og:image" content="${ogImage}" />\n    <meta property="og:image:secure_url" content="${ogImage}" />\n    <meta property="og:image:type" content="image/jpeg" />`
      )
      .replace(/<meta property="og:url" content=".*?" \/>/, `<meta property="og:url" content="${canonical}" />`)
      .replace(/<meta name="twitter:title" content=".*?" \/>/, `<meta name="twitter:title" content="${title}" />`)
      .replace(/<meta name="twitter:description" content=".*?" \/>/, `<meta name="twitter:description" content="${desc}" />`)
      .replace(/<meta name="twitter:image" content=".*?" \/>/, `<meta name="twitter:image" content="${ogImage}" />`);

    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=86400",
    });
    res.end(injectedHtml);
  } catch (err) {
    console.error("api/candidate error:", err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
}

