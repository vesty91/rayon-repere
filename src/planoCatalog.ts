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

export function findInCatalog(
  catalog: PlanoEntry[],
  barcode: string
): PlanoEntry | null {
  const code = barcode.trim();
  return catalog.find((e) => e.ean === code) ?? null;
}
