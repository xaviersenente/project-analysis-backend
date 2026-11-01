/**
 * Le fichier de promo et les identifiants de projet (S4) : un slug mal formé ne sort
 * jamais du dossier des données.
 * Lancement : npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { validerSlug, cheminResultat, dossierDonnees } from "../services/promo/promoService.js";

test("S4 : un slug de minuscules, chiffres et tirets est accepté", () => {
  assert.equal(validerSlug("etu-01"), "etu-01");
});

test("S4 : un slug mal formé est refusé", () => {
  for (const slug of ["../promo", "Etu-01", "etu 01", "etu/01", "", null]) {
    assert.throws(() => validerSlug(slug), /Identifiant de projet invalide/);
  }
});

test("S4 : le résultat d'un projet est toujours dans le dossier des données", () => {
  assert.equal(cheminResultat("etu-01"), path.join(dossierDonnees(), "etu-01.json"));
  assert.throws(() => cheminResultat("../secret"));
});

test("promo : un dossier par semestre et type, choisi par son nom", async () => {
  const fs = await import("fs");
  const os = await import("os");
  const { choisirPromo, promosDisponibles, PROMO_REGEX } = await import("../services/promo/promoService.js");
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), "webscope-promos-"));
  const avant = process.env.DATA_DIR;
  try {
    for (const id of ["s1-sae", "s3-sae", "s2-projet"]) {
      fs.mkdirSync(path.join(racine, id));
      fs.writeFileSync(path.join(racine, id, "promo.json"), "{}");
    }
    // Sans promo.json, ou mal nommé : pas une promo
    fs.mkdirSync(path.join(racine, "s4-sae"));
    fs.mkdirSync(path.join(racine, "old"));
    fs.writeFileSync(path.join(racine, "old", "promo.json"), "{}");
    assert.deepEqual(promosDisponibles(racine), ["s1-sae", "s2-projet", "s3-sae"]);

    assert.equal(choisirPromo("s3-sae", racine), path.join(racine, "s3-sae"));
    assert.equal(process.env.DATA_DIR, path.join(racine, "s3-sae"));
    assert.throws(() => choisirPromo("s4-sae", racine), /Promo introuvable : « s4-sae ». Disponibles : s1-sae, s2-projet, s3-sae/);
    assert.throws(() => choisirPromo("../secret", racine), /Promo mal nommée/);
    delete process.env.DATA_DIR;
    assert.throws(() => choisirPromo(undefined, racine), /Précisez la promo, par exemple : s1-sae/);
    for (const id of ["s1-sae", "s6-projet", "s3-sae-portfolio"]) assert.match(id, PROMO_REGEX);
    for (const id of ["s7-sae", "s1-tp", "S1-sae", "s1-sae/.."]) assert.doesNotMatch(id, PROMO_REGEX);
  } finally {
    if (avant === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = avant;
    fs.rmSync(racine, { recursive: true, force: true });
  }
});
