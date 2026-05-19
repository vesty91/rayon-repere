import type { ShelfPlan } from "./types";
import { getAllPlans, savePlan } from "./storage";
import { planImagePath, planLabel } from "./planoMeta";

const BUILTIN_ID = "plano-";

export function planImageSrc(plan: ShelfPlan): string {
  return plan.imagePath ?? plan.imageDataUrl ?? "";
}

export async function seedBuiltInPlansIfNeeded(): Promise<void> {
  const existing = await getAllPlans();
  if (existing.some((p) => p.id.startsWith(BUILTIN_ID))) return;

  for (let page = 1; page <= 48; page++) {
    const plan: ShelfPlan = {
      id: `${BUILTIN_ID}${page}`,
      name: planLabel(page),
      imagePath: planImagePath(page),
      pageNumber: page,
      createdAt: Date.now() - (48 - page),
    };
    await savePlan(plan);
  }
}
