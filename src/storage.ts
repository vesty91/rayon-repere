import type { Product, ShelfPlan } from "./types";

const DB_NAME = "rayon-repere";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("plans")) {
        db.createObjectStore("plans", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("products")) {
        const store = db.createObjectStore("products", { keyPath: "id" });
        store.createIndex("planId", "planId", { unique: false });
        store.createIndex("barcode", "barcode", { unique: false });
      }
    };
  });
}

async function tx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const result = fn(store);
    transaction.oncomplete = () => {
      if (result instanceof IDBRequest) {
        resolve(result.result as T);
      } else {
        resolve();
      }
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getAllPlans(): Promise<ShelfPlan[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction("plans", "readonly").objectStore("plans").getAll();
    req.onsuccess = () =>
      resolve((req.result as ShelfPlan[]).sort((a, b) => b.createdAt - a.createdAt));
    req.onerror = () => reject(req.error);
  });
}

export async function savePlan(plan: ShelfPlan): Promise<void> {
  await tx("plans", "readwrite", (s) => s.put(plan));
}

export async function deletePlan(id: string): Promise<void> {
  await tx("plans", "readwrite", (s) => s.delete(id));
  const products = await getProductsByPlan(id);
  for (const p of products) {
    await deleteProduct(p.id);
  }
}

export async function getAllProducts(): Promise<Product[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction("products", "readonly").objectStore("products").getAll();
    req.onsuccess = () => resolve(req.result as Product[]);
    req.onerror = () => reject(req.error);
  });
}

export async function getProductsByPlan(planId: string): Promise<Product[]> {
  const all = await getAllProducts();
  return all.filter((p) => p.planId === planId);
}

export async function saveProduct(product: Product): Promise<void> {
  await tx("products", "readwrite", (s) => s.put(product));
}

export async function deleteProduct(id: string): Promise<void> {
  await tx("products", "readwrite", (s) => s.delete(id));
}

export async function findByBarcode(barcode: string): Promise<Product | null> {
  const normalized = barcode.trim();
  const all = await getAllProducts();
  return (
    all.find((p) => p.barcode && p.barcode.trim() === normalized) ?? null
  );
}

export function uid(): string {
  return crypto.randomUUID();
}

export async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
