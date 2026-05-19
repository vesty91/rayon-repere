/**
 * Extraction EAN + étagère + position (Sharp + Tesseract).
 * Usage: npm run extract-plano
 */
import Tesseract from "tesseract.js";
import sharp from "sharp";
import { writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLANS_DIR = join(__dirname, "../public/plans");
const OUT = join(__dirname, "../public/catalog.json");

const SHELF_RANGES = {
  1: [46, 53],
  2: [38, 45],
  3: [30, 37],
  4: [23, 29],
  5: [14, 22],
  6: [6, 13],
  7: [1, 6],
};

function guessShelf(position) {
  for (const [s, [min, max]] of Object.entries(SHELF_RANGES)) {
    if (position >= min && position <= max) return Number(s);
  }
  return null;
}

function extractEansFromText(text) {
  const found = new Set();
  const compact = text.replace(/\s+/g, "");
  for (let i = 0; i <= compact.length - 13; i++) {
    const chunk = compact.slice(i, i + 13);
    if (/^\d{13}$/.test(chunk)) found.add(chunk);
  }
  const lines = text.split("\n");
  for (const line of lines) {
    const digits = line.replace(/[^\d]/g, "");
    if (digits.length >= 13) {
      for (let i = 0; i <= digits.length - 13; i++) {
        const e = digits.slice(i, i + 13);
        if (/^\d{13}$/.test(e)) found.add(e);
      }
    }
  }
  return [...found];
}

function parseLineForEan(line, page) {
  const items = [];
  const eans = extractEansFromText(line);
  if (!eans.length) return items;

  for (const ean of eans) {
    const idx = line.replace(/\s/g, "").indexOf(ean);
    const before = idx > 0 ? line.slice(0, line.indexOf(ean[0])) : line;
    const nums = [...before.matchAll(/\b(\d{1,2})\b/g)].map((m) => Number(m[1]));

    let shelf = null;
    let position = null;
    if (nums.length >= 2) {
      const a = nums[nums.length - 2];
      const b = nums[nums.length - 1];
      if (a >= 1 && a <= 7 && b >= 1 && b <= 70) {
        shelf = a;
        position = b;
      } else if (b >= 1 && b <= 7 && a >= 1 && a <= 70) {
        shelf = b;
        position = a;
      }
    } else if (nums.length === 1 && nums[0] >= 1 && nums[0] <= 70) {
      position = nums[0];
      shelf = guessShelf(position);
    }

    if (!position) continue;
    if (!shelf) shelf = guessShelf(position);
    if (!shelf) continue;

    const after = line.slice(line.indexOf(ean.slice(-8)) + 8).trim();
    const name = after.replace(/^[\d\s|]+/, "").trim().slice(0, 80) || `Produit ${ean}`;

    items.push({ ean, name, page, shelf, position });
  }
  return items;
}

function parseText(text, page) {
  const items = [];
  const seen = new Set();
  for (const line of text.split("\n")) {
    for (const item of parseLineForEan(line, page)) {
      if (!seen.has(item.ean)) {
        seen.add(item.ean);
        items.push(item);
      }
    }
  }
  return items;
}

async function preprocess(path) {
  const meta = await sharp(path).metadata();
  const w = meta.width ?? 800;
  const h = meta.height ?? 1100;
  const top = Math.floor(h * 0.45);
  const height = h - top;

  return sharp(path)
    .extract({ left: 0, top, width: w, height })
    .resize({ width: Math.min(4000, w * 3) })
    .greyscale()
    .normalize()
    .sharpen()
    .png()
    .toBuffer();
}

async function ocrBuffer(buf) {
  const {
    data: { text },
  } = await Tesseract.recognize(buf, "fra+eng", {
    tessedit_pageseg_mode: "6",
  });
  return text;
}

async function extractPage(page) {
  const path = join(PLANS_DIR, `${page}.jpg`);
  if (!existsSync(path)) return [];

  console.log(`Page ${page}/48…`);
  const buf = await preprocess(path);
  const text = await ocrBuffer(buf);
  const items = parseText(text, page);

  if (items.length < 5) {
    const full = await sharp(path).resize({ width: 3200 }).greyscale().normalize().png().toBuffer();
    const text2 = await ocrBuffer(full);
    const more = parseText(text2, page);
    const seen = new Set(items.map((i) => i.ean));
    for (const m of more) {
      if (!seen.has(m.ean)) {
        seen.add(m.ean);
        items.push(m);
      }
    }
  }

  console.log(`  → ${items.length} produits`);
  return items;
}

async function main() {
  const all = [];
  for (let page = 2; page <= 48; page++) {
    all.push(...(await extractPage(page)));
  }

  const byEan = new Map();
  for (const item of all) {
    if (!byEan.has(item.ean)) byEan.set(item.ean, item);
  }

  const catalog = [...byEan.values()].sort(
    (a, b) => a.page - b.page || a.shelf - b.shelf || a.position - b.position
  );

  writeFileSync(OUT, JSON.stringify(catalog, null, 2), "utf8");
  console.log(`\nCatalogue: ${catalog.length} références → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
