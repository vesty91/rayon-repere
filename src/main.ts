import type { PlanoEntry, Product, SearchResult, ShelfPlan } from "./types";
import {
  deletePlan,
  deleteProduct,
  findByBarcode,
  getAllPlans,
  getAllProducts,
  readFileAsDataUrl,
  savePlan,
  saveProduct,
  uid,
} from "./storage";
import {
  detachBarcodeVideo,
  startBarcodeScan,
  stopBarcodeScan,
} from "./barcode";
import { findInCatalog, loadPlanoCatalog } from "./planoCatalog";
import { formatLocation, slotToMarker } from "./planoMeta";
import { planImageSrc, seedBuiltInPlansIfNeeded } from "./seedPlans";
import { renderMobileBanner } from "./mobileHelp";

async function imageMatch() {
  return import("./imageMatch");
}

type Tab = "search" | "plans" | "products";
type SearchMode = "barcode" | "photo";

const state = {
  tab: "search" as Tab,
  searchMode: "barcode" as SearchMode,
  plans: [] as ShelfPlan[],
  products: [] as Product[],
  pendingPos: null as { x: number; y: number } | null,
  pendingPhoto: null as string | null,
  scanLock: false,
  photoStream: null as MediaStream | null,
  planoCatalog: [] as PlanoEntry[],
};

const app = document.getElementById("app")!;
const BUILTIN_PREFIX = "plano-";

function toast(msg: string, type: "success" | "error" = "success") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function showLoading(msg: string) {
  hideLoading();
  const el = document.createElement("div");
  el.id = "loading-overlay";
  el.className = "loading-overlay";
  el.innerHTML = `<div class="spinner"></div><p>${msg}</p>`;
  document.body.appendChild(el);
}

function hideLoading() {
  document.getElementById("loading-overlay")?.remove();
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function planMapHtml(
  plan: ShelfPlan,
  marker?: { x: number; y: number; cls?: string }
): string {
  const dot = marker
    ? `<span class="marker ${marker.cls ?? ""}" style="left:${marker.x}%;top:${marker.y}%"></span>`
    : "";
  return `
    <div class="plan-map-wrap">
      <img src="${planImageSrc(plan)}" alt="${escapeHtml(plan.name)}" />
      ${dot}
    </div>
  `;
}

async function refreshData() {
  state.plans = await getAllPlans();
  state.products = await getAllProducts();
}

async function searchByBarcode(code: string): Promise<SearchResult | null> {
  const entry = findInCatalog(state.planoCatalog, code);
  if (entry) {
    const plan =
      state.plans.find((p) => p.pageNumber === entry.page) ??
      state.plans.find((p) => p.id === `${BUILTIN_PREFIX}${entry.page}`);
    if (plan) {
      return {
        plan,
        score: 1,
        method: "barcode",
        plano: entry,
        marker: slotToMarker(entry.shelf, entry.position),
        title: entry.name,
        subtitle: formatLocation(entry.shelf, entry.position),
      };
    }
  }
  const product = await findByBarcode(code);
  if (!product) return null;
  const plan = state.plans.find((p) => p.id === product.planId);
  if (!plan) return null;
  return {
    product,
    plan,
    score: 1,
    method: "barcode",
    marker: { x: product.x, y: product.y },
    title: product.name,
  };
}

async function searchByPhotoEmbedding(
  query: number[]
): Promise<SearchResult | null> {
  const { cosineSimilarity } = await imageMatch();
  let best: SearchResult | null = null;
  for (const product of state.products) {
    if (!product.embedding?.length) continue;
    const score = cosineSimilarity(query, product.embedding);
    const plan = state.plans.find((p) => p.id === product.planId);
    if (!plan) continue;
    if (!best || score > best.score) {
      best = {
        product,
        plan,
        score,
        method: "photo",
        marker: { x: product.x, y: product.y },
        title: product.name,
      };
    }
  }
  if (best && best.score < 0.55) return null;
  return best;
}

function renderSearchResult(result: SearchResult): string {
  const pct = Math.round(result.score * 100);
  const methodLabel =
    result.method === "barcode"
      ? "Code-barres — planogramme"
      : `Photo (${pct}% de ressemblance)`;
  const name = result.title ?? result.product?.name ?? "Produit";
  const marker = result.marker ??
    (result.product
      ? { x: result.product.x, y: result.product.y, cls: "result" }
      : undefined);
  return `
    <div class="card">
      <h2>Produit trouvé</h2>
      <p><strong>${escapeHtml(name)}</strong></p>
      ${result.subtitle ? `<p class="score">${escapeHtml(result.subtitle)}</p>` : ""}
      <p class="score">${methodLabel}</p>
      ${result.product?.notes ? `<p class="score">${escapeHtml(result.product.notes)}</p>` : ""}
      <span class="badge">${escapeHtml(result.plan.name)}</span>
      ${marker ? planMapHtml(result.plan, { ...marker, cls: "result" }) : planMapHtml(result.plan)}
    </div>
  `;
}

function renderSearchTab(): string {
  return `
    <section>
      <div class="segment">
        <button type="button" data-mode="barcode" class="${state.searchMode === "barcode" ? "active" : ""}">Code-barres</button>
        <button type="button" data-mode="photo" class="${state.searchMode === "photo" ? "active" : ""}">Photo produit</button>
      </div>
      <div class="card">
        <h2>${state.searchMode === "barcode" ? "Scanner le code-barres" : "Photographier le produit"}</h2>
        ${
          state.searchMode === "barcode"
            ? `<ol class="scan-steps">
                <li>Autorisez la <strong>caméra</strong> si le téléphone le demande.</li>
                <li>Pointez la <strong>caméra arrière</strong> vers le code-barres (à 15–25 cm, bien éclairé).</li>
                <li>Le scan est <strong>automatique</strong> — pas besoin d’appuyer sur un bouton.</li>
              </ol>
              ${
                state.planoCatalog.length > 0
                  ? `<p class="score">${state.planoCatalog.length} codes EAN indexés — scannez un code du planogramme.</p>`
                  : `<p class="score">Première fois sur un produit ? Après le scan, touchez <strong>Ajouter ce code-barres</strong> et pointez sa place sur le plan.</p>`
              }`
            : state.products.length === 0
              ? `<p class="empty">Ajoutez des produits dans l’onglet Produits, ou utilisez le scan code-barres.</p>`
              : ""
        }
        <div id="barcode-reader" class="${state.searchMode === "photo" ? "hidden" : ""}">
          <video id="barcode-video" class="video-preview" playsinline muted></video>
        </div>
        <video id="photo-video" class="video-preview ${state.searchMode === "barcode" ? "hidden" : ""}" playsinline muted></video>
        <div class="btn-row">
          ${
            state.searchMode === "photo"
              ? `<button type="button" class="btn btn-primary" id="btn-capture-photo">Prendre la photo</button>
                 <button type="button" class="btn btn-secondary" id="btn-pick-photo">Galerie</button>`
              : `<button type="button" class="btn btn-secondary" id="btn-stop-scan">Arrêter le scan</button>`
          }
        </div>
        <div class="manual-ean ${state.searchMode === "barcode" ? "" : "hidden"}">
          <label for="manual-ean-input">Ou saisir le code EAN à la main</label>
          <div class="manual-ean-row">
            <input type="text" id="manual-ean-input" inputmode="numeric" pattern="[0-9]*" placeholder="13 chiffres" maxlength="13" autocomplete="off" />
            <button type="button" class="btn btn-primary" id="btn-manual-ean">OK</button>
          </div>
        </div>
        <input type="file" accept="image/*" id="search-photo-input" class="hidden" />
      </div>
      <div id="search-result"></div>
    </section>
  `;
}

function renderPlansTab(): string {
  const builtin = state.plans
    .filter((p) => p.id.startsWith(BUILTIN_PREFIX))
    .sort((a, b) => (a.pageNumber ?? 0) - (b.pageNumber ?? 0));
  const custom = state.plans.filter((p) => !p.id.startsWith(BUILTIN_PREFIX));
  if (builtin.length === 0 && custom.length === 0) {
    return `<section><div class="card"><p class="empty">Chargement des plans…</p></div></section>`;
  }
  const list = custom
    .map(
      (p) => `
      <div class="card">
        <h2>${escapeHtml(p.name)}</h2>
        <img class="plan-thumb" src="${planImageSrc(p)}" alt="" />
        <button type="button" class="btn btn-danger btn-delete-plan" data-id="${p.id}">Supprimer</button>
      </div>`
    )
    .join("");
  const grid = builtin
    .map(
      (p) =>
        `<button type="button" class="plan-tile" data-page="${p.pageNumber ?? 0}"><img src="${planImageSrc(p)}" alt="" loading="lazy" /><span>${p.pageNumber}</span></button>`
    )
    .join("");
  return `
    <section>
      <div class="card plano-banner">
        <h2>Ultra Frais — Intermarché</h2>
        <p class="score">${builtin.length} pages · ${state.planoCatalog.length} codes EAN indexés</p>
      </div>
      <div class="plan-grid">${grid}</div>
      <div id="plan-preview"></div>
      ${list}
      <label class="btn btn-secondary">+ Plan perso<input type="file" accept="image/*" id="plan-file-input" class="hidden" /></label>
    </section>`;
}

function renderProductsTab(): string {
  const planOptions = state.plans
    .map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
    .join("");
  const list = state.products
    .map((pr) => {
      const plan = state.plans.find((p) => p.id === pr.planId);
      return `
        <div class="list-item">
          ${pr.photoDataUrl ? `<img src="${pr.photoDataUrl}" alt="" />` : `<div style="width:48px;height:48px;background:var(--surface2);border-radius:6px"></div>`}
          <div class="info">
            <strong>${escapeHtml(pr.name)}</strong>
            <small>${plan ? escapeHtml(plan.name) : "?"} · ${pr.barcode ?? "sans code"}</small>
          </div>
          <button type="button" class="btn btn-danger" style="width:auto;padding:0.4rem 0.6rem;margin:0" data-delete-product="${pr.id}">×</button>
        </div>
      `;
    })
    .join("");

  const form =
    state.plans.length === 0
      ? `<p class="empty">Créez d'abord un plan de rayon.</p>`
      : `
        <div class="field">
          <label>Nom du produit</label>
          <input type="text" id="product-name" placeholder="Ex: Coca 1,5L" />
        </div>
        <div class="field">
          <label>Code-barres (optionnel)</label>
          <input type="text" id="product-barcode" inputmode="numeric" placeholder="EAN / UPC" />
        </div>
        <div class="field">
          <label>Plan de rayon</label>
          <select id="product-plan">${planOptions}</select>
        </div>
        <div class="field">
          <label>Photo de référence (recherche visuelle)</label>
          <input type="file" accept="image/*" capture="environment" id="product-photo-input" />
          <img id="product-photo-preview" class="plan-thumb hidden" alt="" />
        </div>
        <div class="field">
          <label>Position — touchez l'image du plan</label>
          <div id="product-plan-map"></div>
          <p class="score" id="pos-label">Aucune position sélectionnée</p>
        </div>
        <div class="field">
          <label>Notes (optionnel)</label>
          <textarea id="product-notes" rows="2" placeholder="Étagère haute, à gauche…"></textarea>
        </div>
        <button type="button" class="btn btn-primary" id="btn-save-product">Enregistrer le produit</button>
      `;

  return `
    <section>
      <div class="card">
        <h2>Nouveau produit</h2>
        ${form}
      </div>
      ${
        state.products.length > 0
          ? `<div class="card"><h2>Produits (${state.products.length})</h2>${list}</div>`
          : ""
      }
    </section>
  `.replace(/<\/?div>/g, (t) => (t.includes("/") ? "</div>" : "<div"));
}

function render() {
  const titles: Record<Tab, string> = {
    search: "Trouver un produit",
    plans: "Plans de rayon",
    products: "Catalogue produits",
  };
  app.innerHTML = `
    <header>
      <h1>Rayon Repère</h1>
      <p>${titles[state.tab]}</p>
    </header>
    <div id="mobile-banner">${renderMobileBanner()}</div>
    <main id="main-content"></main>
    <nav class="tabs">
      <button type="button" data-tab="search" class="${state.tab === "search" ? "active" : ""}"><span class="icon">🔍</span>Trouver</button>
      <button type="button" data-tab="plans" class="${state.tab === "plans" ? "active" : ""}"><span class="icon">🗺️</span>Plans</button>
      <button type="button" data-tab="products" class="${state.tab === "products" ? "active" : ""}"><span class="icon">📦</span>Produits</button>
    </nav>
  `;
  const main = document.getElementById("main-content")!;
  if (state.tab === "search") main.innerHTML = renderSearchTab();
  else if (state.tab === "plans") main.innerHTML = renderPlansTab();
  else main.innerHTML = renderProductsTab();
  bindEvents();
}

function bindEvents() {
  document.querySelectorAll("nav.tabs button").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await cleanupSearch();
      state.tab = (btn as HTMLButtonElement).dataset.tab as Tab;
      render();
    });
  });
  if (state.tab === "search") void bindSearchEvents();
  if (state.tab === "plans") bindPlansEvents();
  if (state.tab === "products") bindProductsEvents();
}

async function cleanupSearch() {
  state.scanLock = false;
  await stopBarcodeScan();
  const barcodeVideo = document.getElementById(
    "barcode-video"
  ) as HTMLVideoElement | null;
  if (barcodeVideo) detachBarcodeVideo(barcodeVideo);
  stopPhotoStream();
}

function stopPhotoStream() {
  state.photoStream?.getTracks().forEach((t) => t.stop());
  state.photoStream = null;
}

async function bindSearchEvents() {
  document.querySelectorAll(".segment button").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await cleanupSearch();
      state.searchMode = (btn as HTMLButtonElement).dataset.mode as SearchMode;
      render();
    });
  });

  if (state.searchMode === "barcode") {
    const video = document.getElementById(
      "barcode-video"
    ) as HTMLVideoElement | null;
    if (!video) return;

    const handleBarcode = async (code: string) => {
      if (state.scanLock) return;
      state.scanLock = true;
      toast(`Code lu : ${code}`);
      try {
        showLoading("Recherche…");
        const result = await searchByBarcode(code);
        hideLoading();
        const box = document.getElementById("search-result");
        if (!box) return;
        if (result) {
          box.innerHTML = renderSearchResult(result);
          toast(`Trouvé : ${result.title ?? result.product?.name ?? "produit"}`);
          if (navigator.vibrate) navigator.vibrate(80);
        } else {
          box.innerHTML = `<div class="card">
            <p class="empty">Code <strong>${escapeHtml(code)}</strong> introuvable.</p>
            <p class="score">Ajoutez-le une fois : touchez le plan à l’emplacement du produit.</p>
            <button type="button" class="btn btn-primary" id="btn-add-barcode">Ajouter ce code-barres</button>
          </div>`;
          document.getElementById("btn-add-barcode")?.addEventListener("click", () => {
            sessionStorage.setItem("pending-barcode", code);
            void cleanupSearch().then(() => {
              state.tab = "products";
              render();
            });
          });
          toast("Code non indexé", "error");
        }
      } finally {
        setTimeout(() => {
          state.scanLock = false;
        }, 1500);
      }
    };

    document.getElementById("btn-manual-ean")?.addEventListener("click", () => {
      const raw = (
        document.getElementById("manual-ean-input") as HTMLInputElement
      ).value.trim();
      const code = raw.replace(/\D/g, "");
      if (code.length < 8) {
        toast("Code EAN invalide", "error");
        return;
      }
      void handleBarcode(code);
    });

    try {
      await startBarcodeScan(video, (code) => {
        void handleBarcode(code);
      });
    } catch {
      toast("Autorisez la caméra pour scanner", "error");
    }

    document.getElementById("btn-stop-scan")?.addEventListener("click", async () => {
      await stopBarcodeScan();
      detachBarcodeVideo(video);
      toast("Scan arrêté");
    });
  } else {
    await initPhotoSearch();
  }
  document.getElementById("btn-capture-photo")?.addEventListener("click", captureAndSearch);
  document.getElementById("btn-pick-photo")?.addEventListener("click", () => {
    document.getElementById("search-photo-input")?.click();
  });
  document.getElementById("search-photo-input")?.addEventListener("change", async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) await runPhotoSearchFromFile(file);
  });
}

async function initPhotoSearch() {
  const video = document.getElementById("photo-video") as HTMLVideoElement | null;
  if (!video) return;
  try {
    state.photoStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
    video.srcObject = state.photoStream;
    await video.play();
  } catch {
    toast("Caméra indisponible — utilisez la galerie", "error");
  }
}

async function captureAndSearch() {
  const video = document.getElementById("photo-video") as HTMLVideoElement;
  if (!video.videoWidth) {
    toast("Caméra pas prête", "error");
    return;
  }
  showLoading("Analyse de l'image…");
  try {
    const im = await imageMatch();
    await im.loadModel();
    const emb = await im.computeEmbeddingFromVideo(video);
    await runPhotoSearch(emb);
  } catch {
    toast("Erreur d'analyse", "error");
  } finally {
    hideLoading();
  }
}

async function runPhotoSearchFromFile(file: File) {
  showLoading("Analyse de l'image…");
  try {
    const im = await imageMatch();
    await im.loadModel();
    const emb = await im.computeEmbeddingFromFile(file);
    await runPhotoSearch(emb);
  } catch {
    toast("Erreur d'analyse", "error");
  } finally {
    hideLoading();
  }
}

async function runPhotoSearch(queryEmb: number[]) {
  const result = await searchByPhotoEmbedding(queryEmb);
  const box = document.getElementById("search-result");
  if (!box) return;
  if (result) {
    box.innerHTML = renderSearchResult(result);
    toast(`Trouvé : ${result.title ?? result.product?.name ?? "produit"}`);
  } else {
    box.innerHTML = `<div class="card"><p class="empty">Aucune correspondance. Enregistrez ce produit avec une photo de référence.</p></div>`;
    toast("Produit non reconnu", "error");
  }
}

function bindPlansEvents() {
  document.getElementById("plan-file-input")?.addEventListener("change", async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const name =
      prompt("Nom de cette section de rayon ?", file.name.replace(/\.[^.]+$/, "")) ??
      "Rayon";
    showLoading("Import du plan…");
    try {
      const imageDataUrl = await readFileAsDataUrl(file);
      await savePlan({
        id: uid(),
        name,
        imageDataUrl,
        createdAt: Date.now(),
      });
      await refreshData();
      toast("Plan ajouté");
      render();
    } finally {
      hideLoading();
    }
  });

  document.querySelectorAll(".plan-tile").forEach((btn) => {
    btn.addEventListener("click", () => {
      const page = Number((btn as HTMLButtonElement).dataset.page);
      const plan = state.plans.find((p) => p.pageNumber === page);
      const preview = document.getElementById("plan-preview");
      if (!plan || !preview) return;
      preview.innerHTML = `<div class="card"><h2>${escapeHtml(plan.name)}</h2>${planMapHtml(plan)}</div>`;
      preview.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  });

  document.querySelectorAll(".btn-delete-plan").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = (btn as HTMLButtonElement).dataset.id!;
      if (id.startsWith(BUILTIN_PREFIX)) {
        toast("Les pages du planogramme intégré ne peuvent pas être supprimées", "error");
        return;
      }
      if (!confirm("Supprimer ce plan et tous ses produits ?")) return;
      await deletePlan(id);
      await refreshData();
      toast("Plan supprimé");
      render();
    });
  });
}

function bindProductsEvents() {
  const planSelect = document.getElementById("product-plan") as HTMLSelectElement | null;

  const attachMapClick = (mapEl: HTMLElement, plan: ShelfPlan) => {
    mapEl.addEventListener("click", (ev) => {
      const rect = mapEl.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 100;
      const y = ((ev.clientY - rect.top) / rect.height) * 100;
      state.pendingPos = { x, y };
      const wrap = document.getElementById("product-plan-map");
      if (wrap) {
        wrap.innerHTML = planMapHtml(plan, { x, y });
        attachMapClick(wrap.querySelector(".plan-map-wrap")!, plan);
      }
      const label = document.getElementById("pos-label");
      if (label) label.textContent = `Position : ${x.toFixed(0)}% × ${y.toFixed(0)}%`;
    });
  };

  const updateMap = () => {
    const planId = planSelect?.value;
    const wrap = document.getElementById("product-plan-map");
    if (!wrap || !planId) return;
    const plan = state.plans.find((p) => p.id === planId);
    if (!plan) return;
    state.pendingPos = null;
    wrap.innerHTML = planMapHtml(plan);
    const mapEl = wrap.querySelector(".plan-map-wrap");
    if (mapEl) attachMapClick(mapEl as HTMLElement, plan);
  };

  planSelect?.addEventListener("change", updateMap);
  updateMap();

  const pendingBarcode = sessionStorage.getItem("pending-barcode");
  if (pendingBarcode) {
    sessionStorage.removeItem("pending-barcode");
    const input = document.getElementById("product-barcode") as HTMLInputElement | null;
    if (input) input.value = pendingBarcode;
    toast("Code-barres prérempli — complétez et touchez le plan");
  }

  document.getElementById("product-photo-input")?.addEventListener("change", async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    state.pendingPhoto = await readFileAsDataUrl(file);
    const img = document.getElementById("product-photo-preview") as HTMLImageElement;
    img.src = state.pendingPhoto;
    img.classList.remove("hidden");
  });

  document.getElementById("btn-save-product")?.addEventListener("click", async () => {
    const name = (document.getElementById("product-name") as HTMLInputElement).value.trim();
    const barcode =
      (document.getElementById("product-barcode") as HTMLInputElement).value.trim() ||
      null;
    const planId = (document.getElementById("product-plan") as HTMLSelectElement).value;
    const notes = (
      document.getElementById("product-notes") as HTMLTextAreaElement
    ).value.trim();

    if (!name) {
      toast("Indiquez un nom", "error");
      return;
    }
    if (!state.pendingPos) {
      toast("Touchez le plan pour indiquer la position", "error");
      return;
    }

    showLoading("Enregistrement…");
    try {
      let embedding: number[] | null = null;
      if (state.pendingPhoto) {
        const im = await imageMatch();
        await im.loadModel();
        embedding = await im.computeEmbedding(state.pendingPhoto);
      }
      await saveProduct({
        id: uid(),
        planId,
        name,
        barcode,
        x: state.pendingPos.x,
        y: state.pendingPos.y,
        photoDataUrl: state.pendingPhoto,
        embedding,
        notes,
        createdAt: Date.now(),
      });
      await refreshData();
      state.pendingPos = null;
      state.pendingPhoto = null;
      toast("Produit enregistré");
      render();
    } finally {
      hideLoading();
    }
  });

  document.querySelectorAll("[data-delete-product]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = (btn as HTMLElement).dataset.deleteProduct!;
      if (!confirm("Supprimer ce produit ?")) return;
      await deleteProduct(id);
      await refreshData();
      render();
    });
  });
}

async function init() {
  try {
    showLoading("Chargement…");
    await seedBuiltInPlansIfNeeded();
    state.planoCatalog = await loadPlanoCatalog();
    await refreshData();
    hideLoading();
    render();
  } catch (e) {
    hideLoading();
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    app.innerHTML = `
      <div class="card" style="margin:1rem">
        <h2>Erreur au chargement</h2>
        <p class="score">${escapeHtml(msg)}</p>
        <p class="score">Utilisez <code>npm run tel</code> sur le PC, puis https:// sur le téléphone.</p>
        <button type="button" class="btn btn-primary" onclick="location.reload()">Réessayer</button>
      </div>`;
  }
}

void init();
