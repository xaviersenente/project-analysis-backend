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
