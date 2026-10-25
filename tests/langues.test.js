/**
 * Site bilingue : seul le dossier de la langue analysée (fr/) est évalué, l'autre version
 * est seulement comparée (autant de pages dans chaque langue). Rien de noté : une alerte.
 * Lancement : npm test
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { versionsLinguistiques } from "../services/source/langues.js";
import { analyserSite } from "../services/analyse/analyserSite.js";
import { alertes } from "../services/analyse/analyserDepot.js";

const pages = (liste) => liste.map((fichier) => ({ fichier }));

test("un site sans dossiers de langue n'est pas bilingue", () => {
  assert.equal(versionsLinguistiques(pages(["index.html", "contact.html"])), null);
  // Un seul dossier de langue : pas de comparaison possible, tout est analysé
  assert.equal(versionsLinguistiques(pages(["index.html", "fr/index.html"])), null);
});

test("fr/ et en/ : la version française est analysée, l'anglaise comptée", () => {
  const v = versionsLinguistiques(pages(["index.html", "fr/index.html", "fr/apropos.html", "en/index.html", "en/about.html"]));
  assert.equal(v.analysee, "fr");
  assert.deepEqual(v.versions, [
    { langue: "fr", pages: ["fr/apropos.html", "fr/index.html"] },
    { langue: "en", pages: ["en/about.html", "en/index.html"] },
  ]);
  assert.equal(v.complet, true);
  assert.deepEqual(v.manquantes, []);
});

test("une page de moins en anglais : incomplet ; si les noms se répondent, la page manquante est nommée", () => {
  const memesNoms = versionsLinguistiques(pages(["fr/index.html", "fr/contact.html", "fr/equipe.html", "en/index.html", "en/equipe.html"]));
  assert.equal(memesNoms.complet, false);
  assert.deepEqual(memesNoms.manquantes, ["en/contact.html"]);
  // Noms traduits : on ne devine pas lesquelles manquent, seul le compte parle
  const traduits = versionsLinguistiques(pages(["fr/index.html", "fr/apropos.html", "fr/contact.html", "en/index.html", "en/about.html"]));
  assert.equal(traduits.complet, false);
  assert.deepEqual(traduits.manquantes, []);
});

test("l'alerte donne le compte de chaque langue, et les pages manquantes quand on les connaît", () => {
  const langues = versionsLinguistiques(pages(["fr/index.html", "fr/contact.html", "fr/equipe.html", "en/index.html", "en/equipe.html"]));
  const [alerte] = alertes({ langues });
  assert.equal(alerte.type, "langues-incompletes");
  assert.equal(alerte.details, "fr : 3 pages, en : 2 pages ; sans traduction : en/contact.html");
  assert.deepEqual(alertes({ langues: versionsLinguistiques(pages(["fr/index.html", "en/index.html"])) }), []);
});

test("l'analyse ne porte que sur la racine et fr/ ; en/ n'est pas mesuré, mais ses liens comptent", async () => {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), "webscope-langues-"));
  after(() => fs.rmSync(racine, { recursive: true, force: true }));
  const page = (lang, titre, lien) =>
    `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${titre}</title><link rel="stylesheet" href="../css/style.css"></head><body><main><h1>${titre}</h1><a href="${lien}">${lang === "fr" ? "English" : "Français"}</a></main></body></html>`;
  fs.mkdirSync(path.join(racine, "fr"));
  fs.mkdirSync(path.join(racine, "en"));
  fs.mkdirSync(path.join(racine, "css"));
  fs.writeFileSync(path.join(racine, "css/style.css"), "body { margin: 0; }\n");
  fs.writeFileSync(path.join(racine, "index.html"), '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Studio</title><meta http-equiv="refresh" content="0; url=fr/"></head><body></body></html>');
  fs.writeFileSync(path.join(racine, "fr/index.html"), page("fr", "Accueil", "../en/index.html"));
  fs.writeFileSync(path.join(racine, "en/index.html"), page("en", "Home", "../fr/index.html"));
  fs.writeFileSync(path.join(racine, "en/about.html"), page("en", "About", "../fr/index.html"));
  const r = await analyserSite({ racine, sansNavigateur: true, sansValidationW3c: true });
  assert.deepEqual(r.pages.map((p) => p.fichier), ["fr/index.html", "index.html"]);
  assert.equal(r.langues.complet, false);
  assert.deepEqual(r.langues.versions.map((v) => v.pages.length), [1, 2]);
});

test("même nombre de pages, noms en partie traduits : complet", () => {
  const v = versionsLinguistiques(
    pages(["fr/index.html", "fr/contact.html", "fr/a-propos.html", "fr/glossaire.html", "en/index.html", "en/contact.html", "en/about.html", "en/glossary.html"])
  );
  assert.equal(v.complet, true);
  assert.deepEqual(v.manquantes, []);
});

test("dépôt sans page à la racine, avec fr/ et en/ : la racine du site est leur parent", async () => {
  const { trouverRacineSite } = await import("../services/source/depot.js");
  const depot = fs.mkdtempSync(path.join(os.tmpdir(), "webscope-racine-"));
  after(() => fs.rmSync(depot, { recursive: true, force: true }));
  for (const d of ["en", "fr", "src/css"]) fs.mkdirSync(path.join(depot, d), { recursive: true });
  fs.writeFileSync(path.join(depot, "en/index.html"), "<!doctype html>");
  fs.writeFileSync(path.join(depot, "fr/index.html"), "<!doctype html>");
  assert.equal(trouverRacineSite(depot), ".");
  // Un seul dossier de langue : c'est lui, la racine
  fs.rmSync(path.join(depot, "en"), { recursive: true });
  assert.equal(trouverRacineSite(depot), "fr");
});

test("site en ligne bilingue : une adresse donnée en …/fr/ désigne la racine du site", async () => {
  const { baseDuSite } = await import("../services/runtime/enLigne.js");
  assert.equal(baseDuSite("https://lumieres.exemple.fr/fr/", "fr"), "https://lumieres.exemple.fr/");
  assert.equal(baseDuSite("https://etu.github.io/projet/en", "fr"), "https://etu.github.io/projet/");
  assert.equal(baseDuSite("https://etu.github.io/projet", "fr"), "https://etu.github.io/projet/");
  // Site d'une seule langue : l'adresse est gardée telle quelle
  assert.equal(baseDuSite("https://etu.github.io/fr/", null), "https://etu.github.io/fr/");
});

test("maquette d'un site bilingue : les écrans « EN » ne sont associés à rien, les « FR » aux pages de fr/", async () => {
  const { apparier } = await import("../services/maquette/ecrans.js");
  const ecrans = ["Page d'accueil FR", "Page d'accueil EN", "Page contact FR", "Page contact EN", "Menu FR"].map((nom, i) => ({ id: String(i), nom, largeur: 393, textes: [] }));
  const pagesSite = ["index.html", "fr/index.html", "fr/contact.html"].map((fichier) => ({ fichier, titre: "" }));
  const { paires, ecransSansPage } = apparier(ecrans, pagesSite, {}, { analysee: "fr", autres: ["en"] });
  assert.deepEqual(paires.map((p) => [p.ecran.nom, p.fichier]), [["Page d'accueil FR", "fr/index.html"], ["Page contact FR", "fr/contact.html"]]);
  assert.deepEqual(ecransSansPage, ["Menu FR"]);
});

test("analyse d'un site bilingue avec sa maquette : seuls les écrans FR sont associés, aux pages de fr/", async () => {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), "webscope-maquette-langues-"));
  after(() => fs.rmSync(racine, { recursive: true, force: true }));
  for (const d of ["fr", "en"]) {
    fs.mkdirSync(path.join(racine, d));
    fs.writeFileSync(path.join(racine, d, "index.html"), `<!doctype html><html lang="${d}"><head><meta charset="utf-8"><title>${d}</title></head><body><h1>${d}</h1></body></html>`);
  }
  const cadre = (id, name) => ({ id, name, type: "FRAME", absoluteBoundingBox: { x: 0, y: 0, width: 393, height: 800 }, fills: [], children: [] });
  const fichier = { document: { children: [{ id: "0", name: "Maquette", type: "CANVAS", children: [cadre("1", "Accueil FR"), cadre("2", "Accueil EN")] }] } };
  const r = await analyserSite({ racine, sansNavigateur: true, sansValidationW3c: true, maquette: { fichier, version: { id: "1", date: "2027-01-01T00:00:00Z" } } });
  assert.deepEqual(r.blocs.graphique.maquette.ecrans.map((e) => [e.nom, e.fichier]), [["Accueil FR", "fr/index.html"]]);
});
