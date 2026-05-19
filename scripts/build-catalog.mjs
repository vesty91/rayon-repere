/** Fusionne scripts/pages/*.json + public/catalog.json (OCR) → public/catalog.json */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PAGES_DIR = join(__dirname, "pages");
const OUT = join(__dirname, "../public/catalog.json");
const OCR = join(__dirname, "../public/catalog.json");

function loadJson(path) {
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf8"));
}

const byEan = new Map();

if (existsSync(PAGES_DIR)) {
  for (const file of readdirSync(PAGES_DIR).filter((f) => f.endsWith(".json"))) {
    for (const item of loadJson(join(PAGES_DIR, file))) {
      if (item.ean) byEan.set(String(item.ean).replace(/\D/g, ""), item);
    }
  }
}

for (const item of loadJson(OCR)) {
  const ean = String(item.ean || "").replace(/\D/g, "");
  if (ean.length === 13 && !byEan.has(ean)) byEan.set(ean, { ...item, ean });
}

const catalog = [...byEan.values()].sort(
  (a, b) => a.page - b.page || a.shelf - b.shelf || a.position - b.position
);

writeFileSync(OUT, JSON.stringify(catalog, null, 2), "utf8");
console.log(`Catalogue fusionné : ${catalog.length} références → ${OUT}`);
