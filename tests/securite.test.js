/**
 * Tests des corrections de sécurité S1 à S4 (CRITERES-SAE105-2026.md)
 * Lancement : npm test
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

const JETON = "jeton-de-test-0123456789";
const dossierDonnees = fs.mkdtempSync(path.join(os.tmpdir(), "webscope-"));

// Données factices : un fichier de promo et un résultat d'analyse
fs.writeFileSync(
  path.join(dossierDonnees, "promo.json"),
  JSON.stringify({
    dateRendu: "2027-01-15T23:59:00+01:00",
    projets: [
      { slug: "etu-01", nom: "Alice Test", groupe: "TP1", site: "https://exemple.invalid/" },
      { slug: "etu-02", nom: "Bob Test", groupe: "TP2", site: "https://exemple.invalid/b/" },
    ],
  })
);
fs.writeFileSync(
  path.join(dossierDonnees, "etu-01.json"),
  JSON.stringify({ validationScore: { total: 80 } })
);
// Un fichier hors promo, qui ne doit jamais être servi ni compté
fs.writeFileSync(
  path.join(dossierDonnees, "Xavier SENENTE.json"),
  JSON.stringify({ validationScore: { total: 0 } })
);

process.env.DATA_DIR = dossierDonnees;
process.env.API_TOKEN = JETON;
process.env.CORS_ORIGIN = "https://front.exemple.invalid";

let serveur;
let base;

before(async () => {
  const { default: app } = await import("../app.js");
  serveur = app.listen(0);
  await new Promise((resolve) => serveur.once("listening", resolve));
  base = `http://127.0.0.1:${serveur.address().port}`;
});

after(() => {
  serveur.close();
  fs.rmSync(dossierDonnees, { recursive: true, force: true });
});

const avecJeton = (options = {}) => ({
  ...options,
  headers: { Authorization: `Bearer ${JETON}`, ...options.headers },
});

// --- S2 : authentification ---

test("S2 : sans jeton, les routes répondent 401", async () => {
  for (const route of ["/scan/projects", "/scan/project/etu-01", "/stats/class", "/stats/student/etu-01"]) {
    const reponse = await fetch(base + route);
    assert.equal(reponse.status, 401, route);
  }
});

test("S2 : un mauvais jeton est refusé", async () => {
  const reponse = await fetch(`${base}/scan/projects`, {
    headers: { Authorization: "Bearer mauvais" },
  });
  assert.equal(reponse.status, 401);
});

test("S2 : avec le bon jeton, la liste des projets vient de la promo", async () => {
  const reponse = await fetch(`${base}/scan/projects`, avecJeton());
  assert.equal(reponse.status, 200);
  const projets = await reponse.json();
  assert.deepEqual(projets, [
    { slug: "etu-01", nom: "Alice Test", groupe: "TP1", analyse: true },
    { slug: "etu-02", nom: "Bob Test", groupe: "TP2", analyse: false },
  ]);
});

test("S2 : CORS limité au domaine du frontend", async () => {
  const reponse = await fetch(`${base}/scan/projects`, avecJeton({
    headers: { Origin: "https://front.exemple.invalid" },
  }));
  assert.equal(reponse.headers.get("access-control-allow-origin"), "https://front.exemple.invalid");

  const autre = await fetch(`${base}/scan/projects`, avecJeton({
    headers: { Origin: "https://ailleurs.invalid" },
  }));
  assert.equal(autre.headers.get("access-control-allow-origin"), null);
});

// --- S3 : /scan en POST authentifié ---

test("S3 : GET /scan ne lance plus d'analyse", async () => {
  const reponse = await fetch(`${base}/scan?url=http://127.0.0.1/&projectName=x`, avecJeton());
  assert.equal(reponse.status, 404);
});

test("S3 : POST /scan sans jeton répond 401", async () => {
  const reponse = await fetch(`${base}/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug: "etu-01" }),
  });
  assert.equal(reponse.status, 401);
});

test("S3 : POST /scan refuse un slug hors de la promo, et ignore toute URL fournie", async () => {
  const reponse = await fetch(`${base}/scan`, avecJeton({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug: "inconnu", url: "http://127.0.0.1:22/" }),
  }));
  assert.equal(reponse.status, 404);
});

test("S3 : POST /scan sans slug répond 400", async () => {
  const reponse = await fetch(`${base}/scan`, avecJeton({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "http://127.0.0.1/" }),
  }));
  assert.equal(reponse.status, 400);
});

// --- S4 : slugs validés ---

test("S4 : un slug mal formé est refusé (400)", async () => {
  for (const slug of ["..%2F..%2Fpackage", "Etu-01", "etu_01", "etu.01"]) {
    const reponse = await fetch(`${base}/scan/project/${slug}`, avecJeton());
    assert.equal(reponse.status, 400, slug);
  }
});

test("S4 : un fichier hors promo n'est jamais servi", async () => {
  const reponse = await fetch(`${base}/scan/project/Xavier%20SENENTE`, avecJeton());
  assert.equal(reponse.status, 400);
});

test("S4 : un projet de la promo est servi par son slug", async () => {
  const reponse = await fetch(`${base}/scan/project/etu-01`, avecJeton());
  assert.equal(reponse.status, 200);
  assert.deepEqual(await reponse.json(), { validationScore: { total: 80 } });
});

test("S4 : un projet de la promo pas encore analysé répond 404", async () => {
  const reponse = await fetch(`${base}/scan/project/etu-02`, avecJeton());
  assert.equal(reponse.status, 404);
});

test("S4 : les statistiques ne comptent que les projets de la promo", async () => {
  const reponse = await fetch(`${base}/stats/class`, avecJeton());
  assert.equal(reponse.status, 200);
  const stats = await reponse.json();
  assert.equal(stats.studentCount, 1);
  assert.deepEqual(stats.studentData.map((s) => s.name), ["etu-01"]);
});

test("S4 : /stats/student valide aussi le slug", async () => {
  const mauvais = await fetch(`${base}/stats/student/..%2Fx`, avecJeton());
  assert.equal(mauvais.status, 400);
  const bon = await fetch(`${base}/stats/student/etu-01`, avecJeton());
  assert.equal(bon.status, 200);
});
