/** Fusionne scripts/pages/*.json (Excel corrigés) → public/catalog.json */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PAGES_DIR = join(__dirname, "pages");
const OUT = join(__dirname, "../public/catalog.json");
/** Pages sans Excel : compléter depuis l’ancien catalogue si présent */
const OCR_FALLBACK = OUT;
const FALLBACK_PAGES = new Set([1, 48]);

function loadJson(path) {
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf8"));
}

const byEan = new Map();
const pagesFromJson = new Set();

if (existsSync(PAGES_DIR)) {
  for (const file of readdirSync(PAGES_DIR).filter((f) => f.endsWith(".json"))) {
    for (const item of loadJson(join(PAGES_DIR, file))) {
      const ean = String(item.ean || "").replace(/\D/g, "");
      if (ean.length !== 13) continue;
      pagesFromJson.add(item.page);
      byEan.set(ean, { ...item, ean });
    }
  }
}

for (const item of loadJson(OCR_FALLBACK)) {
  const ean = String(item.ean || "").replace(/\D/g, "");
  if (ean.length !== 13 || !FALLBACK_PAGES.has(item.page) || pagesFromJson.has(item.page)) {
    continue;
  }
  if (!byEan.has(ean)) byEan.set(ean, { ...item, ean });
}

const catalog = [...byEan.values()].sort(
  (a, b) => a.page - b.page || a.shelf - b.shelf || a.position - b.position
);

writeFileSync(OUT, JSON.stringify(catalog, null, 2), "utf8");
console.log(`Catalogue fusionné : ${catalog.length} références → ${OUT}`);
