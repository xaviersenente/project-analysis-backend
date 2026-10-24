/**
 * Projet de référence (étape 10) : le corrigé R111-2026-TP5-correction doit respecter
 * presque toutes les contraintes. Chaque écart est soit un défaut de l'outil, soit un
 * défaut du corrigé : ceux qui restent sont lus et expliqués ci-dessous.
 *
 * Le dépôt est privé : le test cherche un clone local (TP5_DEPOT, sinon ../MMI1/…)
 * et ne fait rien sans lui (CI).
 * Lancement : npm test
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { analyserDepot } from "../services/analyse/analyserDepot.js";
import { resultatSchema } from "../schema/resultat.js";

const DEPOT =
  process.env.TP5_DEPOT ??
  fileURLToPath(new URL("../../../MMI1/R111-2026-TP5-correction", import.meta.url));
const disponible = fs.existsSync(path.join(DEPOT, ".git"));

// Écarts lus et attendus : le corrigé est celui d'un TP, pas un rendu de SAÉ
const ECARTS_ATTENDUS = {
  // Défaut du corrigé : le logo de l'en-tête fait 30 × 30 px (commande sans texte, sous 44 px)
  E4: "non-respecte",
  // blockquote, em, script : demandés par le sujet de la SAÉ (requiredTags), pas par le TP 5
  A15: "non-respecte",
  // Le README du corrigé n'est pas celui du gabarit étudiant (nom, groupe, URL)
  M12: "non-respecte",
  // Recommandation : le corrigé n'est pas tagué
  M14: "non-respecte",
};

const cache = fs.mkdtempSync(path.join(os.tmpdir(), "webscope-tp5-"));
let resultat;

before(async () => {
  if (!disponible) return;
  ({ resultat } = await analyserDepot({
    projet: { slug: "tp5-correction", nom: "Corrigé TP5", groupe: "Référence", depot: DEPOT },
    promo: { dateRendu: "2027-06-30T23:59:00+02:00" },
    cache,
  }));
});
after(() => fs.rmSync(cache, { recursive: true, force: true }));

test("le corrigé du TP 5 respecte toutes les contraintes mesurables, hors écarts expliqués", { skip: !disponible && "clone du corrigé absent" }, () => {
  const ecarts = resultat.criteres
    .filter((c) => ["C", "R"].includes(c.statut) && ["non-respecte", "partiel"].includes(c.verdict))
    .map((c) => [c.id, c.verdict]);
  assert.deepEqual(Object.fromEntries(ecarts), ECARTS_ATTENDUS);
});

test("le résultat du corrigé est valide, sans étape en échec", { skip: !disponible && "clone du corrigé absent" }, () => {
  assert.ok(resultatSchema.safeParse(resultat).success);
  assert.deepEqual(resultat.nonMesurable, []);
  assert.equal(resultat.pages.length, 8);
  // Validation W3C passée sur les 8 pages, sans erreur
  assert.equal(resultat.criteres.find((c) => c.id === "M1").valeur, 0);
});

test("contrôles en navigateur : ni débordement, ni contraste en échec, Lighthouse 100", { skip: !disponible && "clone du corrigé absent" }, () => {
  const valeur = (id) => resultat.criteres.find((c) => c.id === id);
  for (const id of ["E5", "A14", "A12", "E11"]) assert.equal(valeur(id).verdict, "respecte", id);
  assert.equal(valeur("A13").valeur, 100);
  assert.equal(valeur("M4").verdict, "respecte");
});

test("E4 : seule commande trop petite, le logo de l'en-tête ; les liens texte ne comptent pas", { skip: !disponible && "clone du corrigé absent" }, () => {
  const e4 = resultat.criteres.find((c) => c.id === "E4");
  assert.deepEqual([...new Set(e4.occurrences.map((o) => o.extrait))], ['<a class="header__logo" href="index.html">  ← 30 × 30 px']);
  assert.equal(e4.occurrences.length, 8);
});

test("le bonus BEM du corrigé est obtenu", { skip: !disponible && "clone du corrigé absent" }, () => {
  assert.equal(resultat.note.bonus, 5);
});
