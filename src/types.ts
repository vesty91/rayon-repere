export interface ShelfPlan {
  id: string;
  name: string;
  /** Photo importée manuellement */
  imageDataUrl?: string;
  /** Planogramme intégré (/plans/N.jpg) */
  imagePath?: string;
  pageNumber?: number;
  createdAt: number;
}

export interface PlanoEntry {
  ean: string;
  name: string;
  page: number;
  shelf: number;
  position: number;
}

export interface Product {
  id: string;
  planId: string;
  name: string;
  barcode: string | null;
  /** Position sur le plan en % (0–100) */
  x: number;
  y: number;
  photoDataUrl: string | null;
  /** Embedding MobileNet sérialisé */
  embedding: number[] | null;
  notes: string;
  createdAt: number;
}

export interface SearchResult {
  product?: Product;
  plan: ShelfPlan;
  score: number;
  method: "barcode" | "photo";
  /** Depuis le planogramme Intermarché intégré */
  plano?: PlanoEntry;
  marker?: { x: number; y: number };
  title?: string;
  subtitle?: string;
}
