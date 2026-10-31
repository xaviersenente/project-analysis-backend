/**
 * Lot 2 (portfolio) : l'EcoIndex d'une page
 * Lancement : npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ecoindex, quantile, noteEcoindex } from "../services/qualite/ecoindex.js";

test("une valeur est située entre ses quantiles, par interpolation", () => {
  assert.equal(quantile([0, 10, 20], 0), 0);
  assert.equal(quantile([0, 10, 20], 5), 0.5);
  assert.equal(quantile([0, 10, 20], 15), 1.5);
  assert.equal(quantile([0, 10, 20], 999), 2);
});

test("une page vide vaut 100 (A), une page énorme tend vers 0 (G)", () => {
  assert.deepEqual(ecoindex({ dom: 0, requetes: 0, poidsKo: 0 }), { score: 100, note: "A" });
  assert.equal(ecoindex({ dom: 600000, requetes: 4000, poidsKo: 300000 }).note, "G");
});

test("le score baisse quand la page grossit, et le DOM pèse le plus", () => {
  const base = { dom: 300, requetes: 30, poidsKo: 800 };
  const s = ecoindex(base).score;
  assert.ok(ecoindex({ ...base, dom: 900 }).score < s);
  assert.ok(ecoindex({ ...base, requetes: 90 }).score < s);
  assert.ok(ecoindex({ ...base, poidsKo: 2400 }).score < s);
  // À rang de quantile égal, le DOM compte trois fois, les requêtes deux fois, le poids une fois
  assert.ok(ecoindex({ ...base, dom: 603 }).score < ecoindex({ ...base, poidsKo: 1448.32 }).score);
});

test("les notes suivent les seuils de la méthode", () => {
  assert.equal(noteEcoindex(81), "A");
  assert.equal(noteEcoindex(80), "B");
  assert.equal(noteEcoindex(56), "C");
  assert.equal(noteEcoindex(55), "D");
  assert.equal(noteEcoindex(5), "G");
});
