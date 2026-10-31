/**
 * Lot 1 du plan hybride : une grille par SAÉ, chargée et validée ; la notation suit la grille
 * Lancement : npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { chargerGrille, listerGrilles, resumeGrille, GRILLE_PAR_DEFAUT } from "../services/grilles/grilles.js";
import { grilleSchema } from "../schema/grille.js";
import { profilDe } from "../services/profils/index.js";
import { pointsParContrainte, points, noter } from "../services/analyse/notation.js";

const critere = (id, axe, extra = {}) => ({ id, axe, libelle: id, statut: "C", methode: "auto", seuil: null, piste: "", sourceCours: "", ...extra });
const grilleTest = (extra = {}) => ({
  id: "test",
  nom: "Test",
  profil: "sae105",
  axes: [
    { id: "qualite", nom: "Qualité", points: 3, description: "" },
    { id: "processus", nom: "Processus", points: 2, description: "" },
  ],
  criteres: [critere("Q1", "qualite"), critere("Q2", "qualite", { points: 2 }), critere("P1", "processus"), critere("P2", "processus", { statut: "R" })],
  ...extra,
});

test("toutes les grilles du dossier sont valides, et la SAÉ 105 est la grille par défaut", () => {
  assert.ok(listerGrilles().includes(GRILLE_PAR_DEFAUT));
  for (const id of listerGrilles()) assert.equal(chargerGrille(id).id, id);
  const sae105 = chargerGrille();
  assert.equal(sae105.criteres.length, 56);
  assert.equal(sae105.axes.reduce((s, a) => s + a.points, 0), 100);
  assert.equal(profilDe(sae105).analyser.name, "analyserDepot");
});

test("un identifiant mal formé ou une grille absente est refusé", () => {
  assert.throws(() => chargerGrille("../thresholds"), /mal formé/);
  assert.throws(() => chargerGrille("inexistante"), /introuvable/);
});

test("une grille incohérente est refusée", () => {
  assert.ok(grilleSchema.safeParse(grilleTest()).success);
  const axeInconnu = grilleSchema.safeParse(grilleTest({ criteres: [critere("Q1", "design")] }));
  assert.match(axeInconnu.error.issues[0].message, /Axe inconnu/);
  const doublon = grilleSchema.safeParse(grilleTest({ criteres: [critere("Q1", "qualite"), critere("Q1", "qualite")] }));
  assert.match(doublon.error.issues[0].message, /double/);
  const iaSansEchelle = grilleSchema.safeParse(grilleTest({ criteres: [critere("Q1", "qualite", { methode: "ia" })] }));
  assert.match(iaSansEchelle.error.issues[0].message, /échelle/);
  const tropDePoints = grilleSchema.safeParse(grilleTest({ criteres: [critere("Q1", "qualite", { points: 4 })] }));
  assert.match(tropDePoints.error.issues[0].message, /4 points fixés pour 3/);
  assert.throws(() => profilDe({ id: "x", profil: "inconnu" }), /profil inconnu/);
});

test("les points fixés par la grille sont gardés ; le reste de l'axe est réparti", () => {
  const grille = grilleSchema.parse(grilleTest());
  assert.deepEqual(pointsParContrainte(grille), { Q1: 1, Q2: 2, P1: 2 });
  // SAÉ 105 : la répartition d'avant (aucun point fixé), 100 points en tout
  const sae105 = pointsParContrainte(chargerGrille());
  assert.equal(Object.values(sae105).reduce((s, p) => s + p, 0), 100);
});

test("la note suit les axes et le total de la grille", () => {
  const grille = grilleSchema.parse(grilleTest());
  const max = pointsParContrainte(grille);
  const criteres = [
    { ...critere("Q1", "qualite"), verdict: "respecte" },
    { ...critere("Q2", "qualite", { points: 2 }), verdict: "non-respecte" },
    { ...critere("P1", "processus"), verdict: "respecte" },
  ].map((c) => ({ ...c, points: points(c, max[c.id], grille.bonusMax) }));
  const note = noter(criteres, grille);
  assert.deepEqual(note.parAxe, { qualite: { obtenus: 1, max: 3 }, processus: { obtenus: 2, max: 2 } });
  assert.equal(note.total, 5);
  assert.equal(note.totale, 3);
  assert.equal(note.bonus, 0);
  assert.deepEqual(resumeGrille(grille).axes.map((a) => a.id), ["qualite", "processus"]);
});
