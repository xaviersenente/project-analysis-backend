/**
 * Étape 1 : récupérer le dépôt à une version figée, par un clone partiel
 * Lancement : npm test
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { preparerDepot, DATE_RENDU } from "./aides/depotPiege.js";
import { resoudreVersion, recuperer, trouverRacineSite } from "../services/source/depot.js";

const cache = fs.mkdtempSync(path.join(os.tmpdir(), "webscope-cache-"));
after(() => fs.rmSync(cache, { recursive: true, force: true }));

test("sans tag v1 : le dernier commit avant la date de rendu", async () => {
  const { dossier, shaAvant } = await preparerDepot();
  const version = await resoudreVersion(dossier, DATE_RENDU, { cache });
  assert.equal(version.sha, shaAvant);
  assert.equal(version.ref, "main");
  assert.match(version.raison, /avant la date de rendu/);
});

test("avec un tag v1 : le tag, même si d'autres commits suivent", async () => {
  const { dossier, shaAvant } = await preparerDepot({ tagV1: true });
  const version = await resoudreVersion(dossier, DATE_RENDU, { cache });
  assert.equal(version.sha, shaAvant);
  assert.equal(version.ref, "v1");
  assert.match(version.raison, /tag v1/);
});

test("la version récupérée est figée : un fichier ajouté après le rendu est absent", async () => {
  const { dossier, shaAvant } = await preparerDepot();
  const copie = await recuperer(dossier, shaAvant, { cache });
  assert.ok(fs.existsSync(path.join(copie, "index.html")));
  assert.ok(!fs.existsSync(path.join(copie, "apres-rendu.html")));
  // Le clone garde l'historique complet, pour la timeline (lot 3)
  assert.ok(fs.existsSync(path.join(copie, ".git")));
});

test("une seconde récupération réutilise le clone en cache", async () => {
  const { dossier, shaAvant } = await preparerDepot();
  const premiere = await recuperer(dossier, shaAvant, { cache });
  fs.writeFileSync(path.join(premiere, "temoin.txt"), "déjà là");
  const seconde = await recuperer(dossier, shaAvant, { cache });
  assert.equal(seconde, premiere);
  assert.ok(fs.existsSync(path.join(seconde, "temoin.txt")));
});

test("un dépôt introuvable lève une erreur claire", async () => {
  await assert.rejects(
    resoudreVersion(path.join(os.tmpdir(), "depot-qui-n-existe-pas"), DATE_RENDU, { cache }),
    /Dépôt inaccessible/
  );
});

test("racine du site : le dossier qui contient index.html, au plus près de la racine", () => {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), "racine-"));
  fs.mkdirSync(path.join(racine, "src/pages"), { recursive: true });
  fs.writeFileSync(path.join(racine, "src/index.html"), "");
  fs.writeFileSync(path.join(racine, "src/pages/index.html"), "");
  assert.equal(trouverRacineSite(racine), "src");
  fs.writeFileSync(path.join(racine, "index.html"), "");
  assert.equal(trouverRacineSite(racine), ".");
  fs.rmSync(racine, { recursive: true, force: true });
});
