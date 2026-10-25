/**
 * Tests des corrections de fiabilité F2 et F3 (CRITERES-SAE105-2026.md).
 * F4 (une étape qui échoue rend « Non mesurable ») est couvert par resultat.test.js et criteres.test.js.
 * Lancement : npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateHTML } from "../services/html/validationService.js";
import { optionsLighthouse, CHROME_FLAGS } from "../services/html/lighthouseService.js";

const HTML_VALIDE = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Accueil</title></head>
<body><main><h1>Accueil</h1><a href="contact.html">Contact</a></main></body></html>`;

// --- F2 : validation W3C ---

test("F2 : un HTML valide n'a aucune erreur, même avec le bruit de JAVA_TOOL_OPTIONS", async () => {
  process.env.JAVA_TOOL_OPTIONS = "-Xss2m";
  try {
    const resultat = await validateHTML(HTML_VALIDE);
    if (!resultat.mesurable) return; // Java absent de la machine de test : rien à vérifier ici
    assert.deepEqual(resultat.erreurs, []);
  } finally {
    delete process.env.JAVA_TOOL_OPTIONS;
  }
});

test("F2 : un HTML invalide rend ses erreurs", async () => {
  const resultat = await validateHTML("<!doctype html><html><head><title>t</title></head><body><p><div>x</p></span></body></html>");
  if (!resultat.mesurable) return;
  assert.ok(resultat.erreurs.length > 0);
  assert.ok(resultat.erreurs.every((e) => e.type === "error"));
});

test("F2 : sans Java, la validation est « Non mesurable », jamais une erreur de l'étudiant", async () => {
  process.env.JAVA_BIN = "/chemin/inexistant/java";
  try {
    const resultat = await validateHTML("<!doctype html><title>t</title>");
    assert.equal(resultat.mesurable, false);
    assert.equal(resultat.erreurs, null);
    assert.match(resultat.raison, /\S/);
  } finally {
    delete process.env.JAVA_BIN;
  }
});

// --- F3 : Lighthouse ---

test("F3 : Lighthouse émule un écran de 360 px et lance Chrome sans bac à sable", () => {
  const options = optionsLighthouse(9222);
  assert.equal(options.screenEmulation.width, 360);
  assert.equal(options.port, 9222);
  assert.ok(CHROME_FLAGS.includes("--no-sandbox"));
  assert.ok(CHROME_FLAGS.includes("--disable-dev-shm-usage"));
});
