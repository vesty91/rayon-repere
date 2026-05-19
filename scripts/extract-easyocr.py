"""Extraction EAN depuis planogrammes (EasyOCR + crop tableau)."""
import json
import re
import sys
from pathlib import Path

import easyocr
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PLANS = ROOT / "public" / "plans"
OUT = ROOT / "public" / "catalog.json"

SHELF_RANGES = {
    1: (46, 53),
    2: (38, 45),
    3: (30, 37),
    4: (23, 29),
    5: (14, 22),
    6: (6, 13),
    7: (1, 6),
}


def guess_shelf(pos: int) -> int | None:
    for s, (lo, hi) in SHELF_RANGES.items():
        if lo <= pos <= hi:
            return s
    return None


def normalize_ean(s: str) -> str | None:
    digits = re.sub(r"\D", "", s)
    if len(digits) == 13:
        return digits
    if len(digits) == 12:
        return "0" + digits
    return None


def crop_table(img: Image.Image) -> Image.Image:
    w, h = img.size
    top = int(h * 0.48)
    crop = img.crop((0, top, w, h))
    scale = max(2, 2400 // crop.width)
    crop = crop.resize((crop.width * scale, crop.height * scale), Image.Resampling.LANCZOS)
    return crop


def parse_detections(detections, page: int) -> list[dict]:
    """Regroupe détections OCR par ligne (coordonnée Y)."""
    lines: dict[int, list[tuple[float, str]]] = {}
    for bbox, text, conf in detections:
        if conf < 0.25:
            continue
        y = bbox[0][1]
        key = int(y // 18)
        lines.setdefault(key, []).append((bbox[0][0], text))

    items = []
    for key in sorted(lines.keys()):
        parts = sorted(lines[key], key=lambda x: x[0])
        line = " ".join(t for _, t in parts)
        eans = re.findall(r"\b(\d[\d\s]{11,14}\d)\b", line)
        for raw in eans:
            ean = normalize_ean(raw)
            if not ean:
                continue
            before = line.split(raw.replace(" ", ""))[0] if raw.replace(" ", "") in line.replace(" ", "") else line
            nums = [int(x) for x in re.findall(r"\b\d{1,2}\b", before)]
            shelf, pos = None, None
            if len(nums) >= 2:
                a, b = nums[-2], nums[-1]
                if 1 <= a <= 7 and 1 <= b <= 60:
                    shelf, pos = a, b
                elif 1 <= b <= 7 and 1 <= a <= 60:
                    shelf, pos = b, a
            elif len(nums) == 1:
                pos = nums[0]
                shelf = guess_shelf(pos)
            if not pos:
                continue
            if not shelf:
                shelf = guess_shelf(pos)
            if not shelf:
                continue
            name_start = line.find(ean[-6:]) if ean[-6:] in line else len(line)
            name = re.sub(r"\s+", " ", line[name_start:]).strip()[:80]
            if not name or len(name) < 3:
                name = f"Produit {ean}"
            items.append(
                {"ean": ean, "name": name, "page": page, "shelf": shelf, "position": pos}
            )
    return items


def main():
    reader = easyocr.Reader(["fr", "en"], gpu=False, verbose=False)
    all_items: list[dict] = []

    pages = range(2, 49) if len(sys.argv) < 2 else [int(sys.argv[1])]
    for page in pages:
        path = PLANS / f"{page}.jpg"
        if not path.exists():
            continue
        print(f"Page {page}…", flush=True)
        img = Image.open(path).convert("RGB")
        crop = crop_table(img)
        arr = np.array(crop)
        detections = reader.readtext(arr, paragraph=False)
        items = parse_detections(detections, page)
        print(f"  → {len(items)} produits", flush=True)
        all_items.extend(items)

    by_ean: dict[str, dict] = {}
    for it in all_items:
        if it["ean"] not in by_ean:
            by_ean[it["ean"]] = it

    catalog = sorted(by_ean.values(), key=lambda x: (x["page"], x["shelf"], x["position"]))
    OUT.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nCatalogue: {len(catalog)} références → {OUT}")


if __name__ == "__main__":
    main()
