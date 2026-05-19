import Tesseract from "tesseract.js";
import sharp from "sharp";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const path = join(__dirname, "../public/plans/2.jpg");
const meta = await sharp(path).metadata();
const h = meta.height ?? 1000;
const w = meta.width ?? 1000;

for (const [label, topPct, heightPct] of [
  ["table", 0.52, 0.46],
  ["full", 0, 1],
  ["visual", 0.08, 0.42],
]) {
  const cropped = await sharp(path)
    .extract({
      left: 0,
      top: Math.floor(h * topPct),
      width: w,
      height: Math.floor(h * heightPct),
    })
    .resize({ width: w * 2 })
    .greyscale()
    .normalize()
    .sharpen()
    .toBuffer();

  const { data } = await Tesseract.recognize(cropped, "eng", {
    tessedit_char_whitelist: "0123456789 ",
  });
  const eans = [...data.text.matchAll(/\d{13}/g)].map((m) => m[0]);
  console.log(`\n=== ${label} === EAN: ${eans.length}`);
  if (eans.length) console.log(eans.slice(0, 8));
}

// sans whitelist, table 2x
const cropped2 = await sharp(path)
  .extract({ left: 0, top: Math.floor(h * 0.5), width: w, height: Math.floor(h * 0.48) })
  .resize({ width: Math.min(4000, w * 3) })
  .toBuffer();
const { data: d2 } = await Tesseract.recognize(cropped2, "fra+eng");
const all = [...d2.text.matchAll(/\d{13}/g)].map((m) => m[0]);
console.log(`\n=== table 3x fra === EAN: ${all.length}`);
console.log(d2.text.replace(/\s+/g, " ").slice(0, 800));
