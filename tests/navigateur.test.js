/**
 * Étape 5 : les contrôles en navigateur sur le dépôt piégé, servi sous /depot-piege/
 * (Lighthouse et Puppeteer à 360 px). Sans Chrome sur la machine, le test ne fait rien.
 * Lancement : npm test
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import * as chromeLauncher from "chrome-launcher";
import { preparerSite } from "./aides/depotPiege.js";
import { analyserSite } from "../services/analyse/analyserSite.js";

const chrome = chromeLauncher.Launcher.getInstallations().length > 0;
let racine;
let resultat;
const critere = (id) => resultat.criteres.find((c) => c.id === id);

before(async () => {
  if (!chrome) return;
  racine = await preparerSite();
  resultat = await analyserSite({ racine, nomDepot: "depot-piege", sansValidationW3c: true });
});
after(() => racine && fs.rmSync(racine, { recursive: true, force: true }));

const sauf = { skip: !chrome && "Chrome absent" };

test("tous les contrôles en navigateur sont mesurés", sauf, () => {
  for (const id of ["E4", "E5", "E11", "E15", "A12", "A13", "A14"]) {
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

test("la vue par page porte le score Lighthouse Accessibilité de chaque page", sauf, () => {
  for (const page of resultat.pages) {
    assert.notEqual(page.controles.lighthouseA11y.verdict, "non-mesurable", page.fichier);
    assert.match(page.controles.lighthouseA11y.valeur, /^\d+$/);
  }
});
