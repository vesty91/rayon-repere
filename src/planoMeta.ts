/** Plages de positions sur le visuel du planogramme */
export const SHELF_RANGES: Record<number, [number, number]> = {
  1: [46, 53],
  2: [38, 45],
  3: [30, 37],
  4: [23, 29],
  5: [14, 22],
  6: [6, 13],
  7: [1, 6],
};

const VISUAL_TOP = 0.11;
const VISUAL_BOTTOM = 0.46;

export function planLabel(page: number): string {
  if (page === 1) return "Vue d'ensemble — Ultra Frais (17 éléments)";
  return `Page ${page} — Planogramme`;
}

export function planImagePath(page: number): string {
  return `/plans/${page}.jpg`;
}

/** Convertit étagère + position en % sur l'image du plano */
export function slotToMarker(
  shelf: number,
  position: number
): { x: number; y: number } {
  const range = SHELF_RANGES[shelf] ?? [1, 50];
  const [min, max] = range;
  const span = Math.max(1, max - min);
  const x = 0.03 + ((position - min) / span) * 0.94;
  const y = VISUAL_TOP + ((7 - shelf) / 6) * (VISUAL_BOTTOM - VISUAL_TOP);
  return {
    x: Math.round(Math.min(97, Math.max(3, x * 100)) * 10) / 10,
    y: Math.round(Math.min(48, Math.max(8, y * 100)) * 10) / 10,
  };
}

export function formatLocation(shelf: number, position: number): string {
  return `Étagère ${shelf} · Position ${position}`;
}
