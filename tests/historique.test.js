/**
 * Étape 7 : l'historique Git et la timeline (critère M10)
 * Lancement : npm test
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { lireHistorique } from "../services/source/historique.js";

const DATE_RENDU = "2027-01-15T23:59:00+01:00";
let depot;
let historique;

/** Un commit daté, d'un auteur donné, qui modifie `lignes` lignes */
const commit = (dossier, { date, dateCommit = date, auteur = "Alice Dupont", email = "alice@etu.test", message, lignes = 10 }) => {
  fs.appendFileSync(path.join(dossier, "index.html"), "<p>ligne</p>\n".repeat(lignes));
  execFileSync("git", ["add", "-A"], { cwd: dossier });
  execFileSync("git", ["commit", "-q", "-m", message], {
    cwd: dossier,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: auteur,
      GIT_AUTHOR_EMAIL: email,
      GIT_COMMITTER_NAME: auteur,
      GIT_COMMITTER_EMAIL: email,
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: dateCommit,
    },
  });
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: dossier }).toString().trim();
};

before(() => {
  depot = fs.mkdtempSync(path.join(os.tmpdir(), "historique-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: depot });
  // Session 1 : le 5 janvier, deux commits à 20 min d'écart
  commit(depot, { date: "2027-01-05T14:00:00+01:00", message: "Structure de la page d'accueil", lignes: 100 });
  commit(depot, { date: "2027-01-05T14:20:00+01:00", message: "update", lignes: 10 });
  // Session 2 : le 5 janvier encore, après plus de 2 h de pause
  commit(depot, { date: "2027-01-05T17:00:00+01:00", message: "Variables de couleur", lignes: 20 });
  // Session 3 : un commit d'un autre auteur
  commit(depot, { date: "2027-01-08T10:00:00+01:00", auteur: "Tom Marchal", email: "tom@etu.test", message: "Correction du menu", lignes: 10 });
  // Session 4 : la veille du rendu, avec une date de commit très éloignée (rebase)
  const sha = commit(depot, {
    date: "2027-01-14T21:00:00+01:00",
    dateCommit: "2027-01-15T22:00:00+01:00",
    message: "Pages équipe et contact",
    lignes: 60,
  });
  execFileSync("git", ["tag", "v1"], { cwd: depot });
  // Après la version évaluée : jamais compté
  commit(depot, { date: "2027-01-20T10:00:00+01:00", message: "Après le rendu", lignes: 500 });
  historique = lireHistorique({ dossier: depot, sha, dateRendu: DATE_RENDU });
});
after(() => fs.rmSync(depot, { recursive: true, force: true }));

test("les commits jusqu'à la version évaluée, du plus ancien au plus récent", () => {
  assert.equal(historique.commits.length, 5);
  assert.equal(historique.commits[0].message, "Structure de la page d'accueil");
  assert.ok(!historique.commits.some((c) => c.message === "Après le rendu"));
  const premier = historique.commits[0];
  assert.equal(premier.ajouts, 100);
  assert.equal(premier.suppressions, 0);
  assert.equal(premier.fichiers, 1);
  assert.equal(premier.auteur, "Alice Dupont");
});

test("sessions : une nouvelle après plus de 2 h sans commit", () => {
  assert.equal(historique.sessions.length, 4);
  assert.deepEqual(historique.sessions.map((s) => s.commits), [2, 1, 1, 1]);
  // Durée estimée : 20 min + 30 min de forfait, puis 3 sessions d'un commit à 30 min
  assert.equal(historique.indicateurs.dureeEstimeeMinutes, 50 + 30 * 3);
});

test("indicateurs : jours actifs, durée du projet, plus gros commit", () => {
  const i = historique.indicateurs;
  assert.equal(i.commits, 5);
  assert.equal(i.joursActifs, 3);
  assert.equal(i.plusGrosCommit, 100);
  assert.equal(i.dureeProjetJours, 9.3);
});

test("part des lignes modifiées dans les 48 dernières heures avant le rendu", () => {
  // 60 lignes sur 200 : le dernier commit a été écrit le 14 janvier à 21 h (date d'auteur)
  assert.equal(historique.indicateurs.partDernieres48h, 0.3);
});

test("drapeaux : message générique, autre auteur, dates divergentes", () => {
  const drapeaux = Object.fromEntries(historique.commits.map((c) => [c.message, c.drapeaux]));
  assert.deepEqual(drapeaux.update, ["message-generique"]);
  assert.deepEqual(drapeaux["Correction du menu"], ["autre-auteur"]);
  assert.deepEqual(drapeaux["Pages équipe et contact"], ["dates-divergentes"]);
  assert.deepEqual(drapeaux["Variables de couleur"], []);
  assert.equal(historique.indicateurs.commitsAutreAuteur, 1);
});

test("l'auteur principal peut venir du fichier de promo", () => {
  const avecEmail = lireHistorique({ dossier: depot, sha: historique.commits.at(-1).sha, dateRendu: DATE_RENDU, emailEtudiant: "tom@etu.test" });
  assert.equal(avecEmail.indicateurs.commitsAutreAuteur, 4);
});

test("les tags posés, avec leur commit", () => {
  assert.deepEqual(historique.tags.map((t) => [t.nom, t.sha]), [["v1", historique.commits.at(-1).sha]]);
});

test("les seuils de M10 accompagnent l'historique", () => {
  assert.deepEqual(historique.seuils, { sessionsMin: 6, joursMin: 4, partDernieres48hMax: 0.5 });
  assert.equal(historique.dateRendu, DATE_RENDU);
});
