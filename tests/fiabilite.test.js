/**
 * Tests des corrections de fiabilité F2 à F5 (CRITERES-SAE105-2026.md)
 * Lancement : npm test
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import express from "express";

const JETON = "jeton-de-test-0123456789";
const dossierDonnees = fs.mkdtempSync(path.join(os.tmpdir(), "webscope-"));
const dossierSite = fs.mkdtempSync(path.join(os.tmpdir(), "webscope-site-"));

// Un site minimal, sans feuille de style : le CSS n'est pas mesurable
fs.writeFileSync(
  path.join(dossierSite, "index.html"),
  `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Accueil</title></head>
<body><main><h1>Accueil</h1><a href="contact.html">Contact</a></main></body></html>`
);
fs.writeFileSync(
  path.join(dossierSite, "contact.html"),
  `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Contact</title></head>
<body><main><h1>Contact</h1></main></body></html>`
);

process.env.DATA_DIR = dossierDonnees;
process.env.API_TOKEN = JETON;
// Chrome introuvable : Lighthouse doit passer en « Non mesurable », sans faire échouer l'analyse
process.env.CHROME_PATH = "/chemin/inexistant/chrome";

let serveurSite;
let serveurApi;
let base;

before(async () => {
  const site = express();
  site.use(express.static(dossierSite));
  serveurSite = site.listen(0);
  await new Promise((resolve) => serveurSite.once("listening", resolve));
  const urlSite = `http://127.0.0.1:${serveurSite.address().port}/`;

  fs.writeFileSync(
    path.join(dossierDonnees, "promo.json"),
    JSON.stringify({
      projets: [
        { slug: "sans-css", nom: "Site sans CSS", site: urlSite },
        { slug: "injoignable", nom: "Site injoignable", site: "http://127.0.0.1:9/" },
      ],
    })
  );

  const { default: app } = await import("../app.js");
  serveurApi = app.listen(0);
  await new Promise((resolve) => serveurApi.once("listening", resolve));
  base = `http://127.0.0.1:${serveurApi.address().port}`;
});

after(async () => {
  serveurSite.close();
  serveurApi.close();
  const { fermerChrome } = await import("../services/html/lighthouseService.js");
  await fermerChrome();
  fs.rmSync(dossierDonnees, { recursive: true, force: true });
  fs.rmSync(dossierSite, { recursive: true, force: true });
});

const scanner = (slug) =>
  fetch(`${base}/scan`, {
    method: "POST",
    headers: { Authorization: `Bearer ${JETON}`, "Content-Type": "application/json" },
    body: JSON.stringify({ slug }),
  });

// --- F2 : validation W3C ---

test("F2 : un HTML valide n'a aucune erreur, même avec le bruit de JAVA_TOOL_OPTIONS", async () => {
  const { validateHTML } = await import("../services/html/validationService.js");
  process.env.JAVA_TOOL_OPTIONS = "-Xss2m";
  try {
    const resultat = await validateHTML(fs.readFileSync(path.join(dossierSite, "index.html"), "utf-8"));
    if (!resultat.mesurable) return; // Java absent de la machine de test : rien à vérifier ici
    assert.deepEqual(resultat.erreurs, []);
  } finally {
    delete process.env.JAVA_TOOL_OPTIONS;
  }
});

test("F2 : un HTML invalide rend ses erreurs", async () => {
  const { validateHTML } = await import("../services/html/validationService.js");
  const resultat = await validateHTML("<!doctype html><html><head><title>t</title></head><body><p><div>x</p></span></body></html>");
  if (!resultat.mesurable) return;
  assert.ok(resultat.erreurs.length > 0);
  assert.ok(resultat.erreurs.every((e) => e.type === "error"));
});

test("F2 : sans Java, la validation est « Non mesurable », jamais une erreur de l'étudiant", async () => {
  const { validateHTML } = await import("../services/html/validationService.js");
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

test("F2 : le score de validation ignore les pages non mesurables", async () => {
  const { calculateValidationScore } = await import("../services/html/validationService.js");
  const pages = [
    { validationErrors: [] },
    { validationErrors: null, validation: { mesurable: false, raison: "Java absent" } },
  ];
  const score = calculateValidationScore(pages);
  assert.equal(score.total, 100);
  assert.equal(score.stats.pagesAnalyzed, 1);

  const aucune = calculateValidationScore([pages[1]]);
  assert.equal(aucune.total, null);
  assert.equal(aucune.mesurable, false);
});

// --- F3 : Lighthouse ---

test("F3 : Lighthouse émule un écran de 360 px et lance Chrome sans bac à sable", async () => {
  const { optionsLighthouse, CHROME_FLAGS } = await import("../services/html/lighthouseService.js");
  const options = optionsLighthouse(9222);
  assert.equal(options.screenEmulation.width, 360);
  assert.equal(options.port, 9222);
  assert.ok(CHROME_FLAGS.includes("--no-sandbox"));
  assert.ok(CHROME_FLAGS.includes("--disable-dev-shm-usage"));
});

// --- F4 : une étape qui échoue ne fait pas tout échouer ---

test("F4 : sans CSS ni Chrome, l'analyse est enregistrée et ces étapes sont « Non mesurable »", async () => {
  const reponse = await scanner("sans-css");
  assert.equal(reponse.status, 200);

  const resultat = JSON.parse(fs.readFileSync(path.join(dossierDonnees, "sans-css.json"), "utf-8"));
  const etapes = resultat.nonMesurable.map((n) => n.etape);
  assert.ok(etapes.includes("CSS"), etapes.join(", "));
  assert.ok(etapes.some((e) => e.startsWith("Lighthouse")), etapes.join(", "));

  // Les pages sont bien analysées
  assert.equal(resultat.pages.length, 2);
  assert.ok(resultat.pages.every((p) => p.lighthouseReport === null));
  // Aucune fausse erreur de validation
  for (const page of resultat.pages) {
    if (page.validation.mesurable) {
      assert.ok(page.validationErrors.every((e) => !/Failed to validate/.test(e.message)));
    } else {
      assert.equal(page.validationErrors, null);
    }
  }
  // Le CSS n'est pas noté sur une chaîne vide
  assert.equal(resultat.cssAnalysisResult, null);
  assert.equal(resultat.classAnalysis, null);
});

test("F4 : un site injoignable est enregistré comme « Non mesurable », sans erreur 500", async () => {
  const reponse = await scanner("injoignable");
  assert.equal(reponse.status, 200);
  const resultat = JSON.parse(fs.readFileSync(path.join(dossierDonnees, "injoignable.json"), "utf-8"));
  assert.ok(resultat.nonMesurable.length > 0);
  assert.deepEqual(resultat.pages, []);
});

// --- F5 : pas de délai global sur axios ---

test("F5 : charger le compilateur CSS ne modifie pas axios.defaults.timeout", async () => {
  const { default: axios } = await import("axios");
  await import("../services/css/cssCompiler.js");
  assert.ok(!axios.defaults.timeout);
});
