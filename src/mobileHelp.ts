export function renderMobileBanner(): string {
  const host = location.hostname;
  const isLocalhost = host === "localhost" || host === "127.0.0.1";

  if (window.isSecureContext) {
    if (isLocalhost) {
      return `
        <div class="card mobile-warn">
          <h2>Sur téléphone ?</h2>
          <p class="score">N’utilisez pas <code>localhost</code> sur le téléphone.</p>
          <p class="score">Sur le PC : <code>npm run tel</code>, puis l’URL <strong>https://…</strong> affichée (même Wi‑Fi).</p>
        </div>`;
    }
    return "";
  }

  return `
    <div class="card mobile-warn">
      <h2>Connexion requise (HTTPS)</h2>
      <p class="score">La caméra exige <strong>https://</strong> (pas http).</p>
      <p class="score">PC : <code>npm run tel</code> → sur le téléphone ouvrez l’URL <strong>https://</strong> affichée.</p>
      <p class="score">Acceptez l’avertissement de certificat si demandé.</p>
    </div>
  `;
}
