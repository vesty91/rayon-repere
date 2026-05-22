import type { PlanoEntry } from "./types";

let cache: PlanoEntry[] | null = null;

export async function loadPlanoCatalog(): Promise<PlanoEntry[]> {
  if (cache) return cache;
  try {
    const res = await fetch("/catalog.json");
    if (!res.ok) {
      cache = [];
      return cache;
    }
    cache = (await res.json()) as PlanoEntry[];
    return cache;
  } catch {
    cache = [];
    return cache;
  }
}

function normalizeEan(barcode: string): string {
  return barcode.replace(/\D/g, "");
}

export function findInCatalog(
  catalog: PlanoEntry[],
  barcode: string
): PlanoEntry | null {
  const code = normalizeEan(barcode.trim());
  if (code.length !== 13) return null;
  return catalog.find((e) => normalizeEan(e.ean) === code) ?? null;
}
