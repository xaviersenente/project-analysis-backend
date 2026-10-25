/**
 * Étape 5 : les contrôles en navigateur sur le dépôt piégé, servi sous /depot-piege/
 * (Lighthouse et Puppeteer à 360 px). Sans Chrome sur la machine, le test ne fait rien.
 * Lancement : npm test
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";
import * as chromeLauncher from "chrome-launcher";
import { preparerSite } from "./aides/depotPiege.js";
import { analyserSite } from "../services/analyse/analyserSite.js";

const chrome = chromeLauncher.Launcher.getInstallations().length > 0;
let racine;
let resultat;
const captures = fs.mkdtempSync(path.join(os.tmpdir(), "captures-"));
// Maquette déjà lue (sans API Figma) : son écran « Accueil Mobile » est associé à index.html
const maquette = { fichier: createRequire(import.meta.url)("./fixtures/maquette-piege.json"), version: { id: "1", date: "2027-01-05T10:00:00Z" } };
const critere = (id) => resultat.criteres.find((c) => c.id === id);

before(async () => {
  if (!chrome) return;
  racine = await preparerSite();
  resultat = await analyserSite({ racine, nomDepot: "depot-piege", sansValidationW3c: true, maquette, dossierCaptures: captures });
});
after(() => {
  if (racine) fs.rmSync(racine, { recursive: true, force: true });
  fs.rmSync(captures, { recursive: true, force: true });
});

const sauf = { skip: !chrome && "Chrome absent" };

test("tous les contrôles en navigateur sont mesurés", sauf, () => {
  for (const id of ["E4", "E5", "E11", "E15", "A12", "A13", "A14", "G11"]) {
    assert.notEqual(critere(id).verdict, "non-mesurable", `${id} : ${critere(id).raison}`);
  }
  assert.deepEqual(resultat.nonMesurable, []);
});

test("E5 et A14 : l'image de 1 200 px déborde, sa ligne est retrouvée dans le HTML", sauf, () => {
  assert.equal(critere("E5").verdict, "non-respecte");
  const o = critere("E5").occurrences.find((x) => x.extrait.includes("lourde.jpg"));
  assert.ok(o, JSON.stringify(critere("E5").occurrences));
  assert.equal(o.fichier, "index.html");
  assert.equal(o.ligne, 31);
  assert.ok(critere("E5").valeur > 360);
  assert.equal(critere("A14").verdict, "non-respecte");
});

test("A13 et E15 : les scores Lighthouse, moyennés sur les pages", sauf, () => {
  assert.equal(typeof critere("A13").valeur, "number");
  assert.equal(typeof critere("E15").valeur, "number");
  assert.equal(typeof resultat.blocs.accessibilite.lighthouse.seo, "number");
  assert.ok(Array.isArray(resultat.blocs.accessibilite.contrastes));
});

test("E11 : le poids transféré de l'accueil", sauf, () => {
  assert.ok(critere("E11").valeur > 300, `${critere("E11").valeur} Ko`);
  assert.equal(resultat.ressources.poidsAccueilKo, critere("E11").valeur);
});

test("M9 : les ressources en échec au chargement ne doublent pas celles de l'inventaire", sauf, () => {
  const extraits = critere("M9").occurrences.map((o) => o.extrait);
  assert.equal(extraits.filter((e) => e.includes("Photo.webp")).length, 1);
  assert.equal(extraits.filter((e) => e.includes("favicon.svg")).length, 1);
});

test("E4 : un lien-icône trop petit est relevé ; un lien texte ne l'est jamais", sauf, async () => {
  const copie = await preparerSite();
  const index = fs.readFileSync(`${copie}/index.html`, "utf-8");
  fs.writeFileSync(
    `${copie}/index.html`,
    index.replace(
      '<p class="pied__texte">',
      '<a class="pied__icone" href="https://exemple.test/instagram"><img src="assets/img/motif.svg" alt="Instagram" width="20" height="20"></a>\n      <p class="pied__texte">'
    )
  );
  const variante = await analyserSite({ racine: copie, nomDepot: "depot-piege", sansValidationW3c: true });
  fs.rmSync(copie, { recursive: true, force: true });
  const e4 = variante.criteres.find((c) => c.id === "E4");
  const extraits = e4.occurrences.map((o) => o.extrait);
  assert.ok(extraits.some((e) => /pied__icone.*← 20 × \d+ px/.test(e)), JSON.stringify(extraits));
  // Les liens texte du pied de page (mailto, tel), petits eux aussi, ne sont pas des commandes
  assert.ok(!extraits.some((e) => e.includes("mailto:") || e.includes("tel:")), JSON.stringify(extraits));
  // Un bouton reste une commande, même avec du texte
  assert.ok(extraits.some((e) => e.includes("burger")), JSON.stringify(extraits));
});

test("la vue par page porte le score Lighthouse Accessibilité de chaque page", sauf, () => {
  for (const page of resultat.pages) {
    assert.notEqual(page.controles.lighthouseA11y.verdict, "non-mesurable", page.fichier);
    assert.match(page.controles.lighthouseA11y.valeur, /^\d+$/);
  }
});

test("G11 : textes de la maquette comparés au site à 393 px, écarts et absents relevés avec leur ligne", sauf, () => {
  const g11 = critere("G11");
  assert.equal(g11.verdict, "non-respecte");
  assert.equal(g11.detailValeur, "2 textes au style de la maquette sur 4 retrouvés · 2 absents sur 6 · 2 couleurs hors maquette");
  assert.equal(g11.valeur, 50);
  const extraits = g11.occurrences.map((o) => `${o.fichier}:${o.ligne} ${o.extrait}`);
  assert.ok(extraits.includes('index.html:28 <h2 class="carte__titre">  ← « NOTRE DERNIER PROJET » : taille 20 px → 24 px'), extraits.join("\n"));
  assert.ok(extraits.includes("index.html:null « Des sites rapides et accessibles »  ← absent de la page (écran « Accueil Mobile »)"));
  assert.ok(extraits.some((e) => e.startsWith("index.html:36") && e.includes("couleur #1d4ed8 → #0000ee")));
});

test("G11 : le bloc met chaque écran face à sa page, avec la capture du site", sauf, () => {
  const bloc = resultat.blocs.graphique.maquette;
  assert.deepEqual(bloc.ecrans.map((e) => [e.nom, e.fichier]), [["Accueil Mobile", "index.html"], ["Contact Mobile", "contact.html"], ["Menu ouvert", null]]);
  assert.deepEqual(bloc.ecrans[0].textes, { total: 5, conformes: 2, justifies: 0, ecarts: 2, absents: 1 });
  // Sans API Figma, pas d'image de l'écran ; la capture du site est écrite
  assert.equal(bloc.ecrans[0].captures.maquette, null);
  assert.match(bloc.ecrans[0].captures.site, /^captures\/[0-9a-f]{12}-site\.webp$/);
  assert.ok(fs.existsSync(path.join(captures, path.basename(bloc.ecrans[0].captures.site))));
});
