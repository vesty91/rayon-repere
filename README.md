# Rayon Repère

Application mobile (PWA) pour retrouver un produit sur votre plan de rayon, par **code-barres** ou par **photo**.

## Vos 48 planogrammes

Les photos `1.jpg` … `48.jpg` (rayon **Ultra Frais — Intermarché**) sont intégrées dans `public/plans/`.  
Au premier lancement, les **48 pages** sont chargées automatiquement dans l’onglet **Plans**.

Pour mettre à jour les **codes EAN et libellés** depuis vos fichiers Excel corrigés (`planogramme_page_N/*.xlsx` à la racine du dossier parent) :

```bash
npm run catalog
```

Cela importe les Excel puis génère `public/catalog.json`.

## Démarrage

```bash
cd "C:\Users\Vesty\Desktop\Nouveau dossier\rayon-repere"
npm install
npm run dev
```

Ouvrez l’URL affichée (souvent `http://localhost:5173`) sur votre téléphone, sur le même réseau Wi‑Fi.

Pour installer sur l’écran d’accueil : menu du navigateur → **Ajouter à l’écran d’accueil**.

## Utilisation

### 1. Plans
- Onglet **Plans** → importez les photos de votre rayon (une photo = une section).
- Donnez un nom à chaque section (ex. « Rayon boissons », « Étagère 2 »).

### 2. Produits
- Onglet **Produits** → renseignez le nom, le code-barres (recommandé), une **photo de référence**.
- **Touchez l’image du plan** à l’emplacement exact du produit sur l’étagère.

### 3. Recherche
- Onglet **Trouver** :
  - **Code-barres** : scannez avec la caméra arrière.
  - **Photo produit** : photographiez l’article ; l’app compare avec vos photos enregistrées.

Le résultat affiche le plan avec un **marqueur** à la position enregistrée.

## Conseils

- Le scan code-barres est le plus fiable : enregistrez toujours le code EAN quand c’est possible.
- Pour la recherche photo, utilisez une photo nette, face au produit, similaire à celle enregistrée.
- Les données restent **sur votre appareil** (IndexedDB), sans serveur.

## Build production

```bash
npm run build
npm run preview
```

Le dossier `dist/` peut être hébergé sur n’importe quel hébergeur statique (HTTPS requis pour la caméra).
