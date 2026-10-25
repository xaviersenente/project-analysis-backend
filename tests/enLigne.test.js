/**
 * Étape 6 : le contrôle léger du site en ligne. Pages et ressources répondent-elles,
 * lesquelles sont en 404 et pourquoi ; le site déployé est-il la version évaluée ?
 * Le « site en ligne » est ici le dépôt piégé servi en local, et l'API GitHub une imitation.
 * Lancement : npm test
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import express from "express";
import { preparerSite } from "./aides/depotPiege.js";
import { inventorier } from "../services/source/inventaire.js";
import { servir } from "../services/runtime/serveurLocal.js";
import { verifierEnLigne } from "../services/runtime/enLigne.js";

let racine;
let site;
let api;
let apiUrl;
let inventaire;
let resultat;

before(async () => {
  racine = await preparerSite();
  inventaire = inventorier(racine);
  // En ligne, contact.html manque : le site déployé n'est pas à jour
  site = await servir(racine, "depot-piege", inventaire.fichiers.filter((f) => f !== "contact.html"));
  const app = express();
  app.get("/repos/etu/depot-piege/deployments", (req, res) =>
    res.json(req.query.environment === "github-pages" ? [{ sha: "d".repeat(40), created_at: "2027-01-12T09:00:00Z" }] : [])
  );
  api = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  apiUrl = `http://127.0.0.1:${api.address().port}`;
  resultat = await verifierEnLigne({ url: site.url, inventaire, depot: "etu/depot-piege", sha: "a".repeat(40), apiGithub: apiUrl });
});
after(async () => {
  await site?.fermer();
  api?.close();
  fs.rmSync(racine, { recursive: true, force: true });
});

const erreur = (chemin) => resultat.erreurs.find((e) => e.chemin === chemin);

test("le site répond : pages et ressources comptées", () => {
  assert.equal(resultat.repond, true);
  assert.equal(resultat.url, site.url);
  assert.equal(resultat.pages.total, 2);
  assert.equal(resultat.pages.enErreur, 1);
  assert.ok(resultat.ressources.total >= 4);
});

test("une page du dépôt absente en ligne : 404, sans cause dans le dépôt", () => {
  assert.deepEqual(erreur("contact.html"), {
    type: "page",
    chemin: "contact.html",
    url: new URL("contact.html", site.url).href,
    statut: 404,
    cause: null,
    citePar: [],
  });
});

test("une image citée avec la mauvaise casse : 404, cause « casse », avec la page et la ligne", () => {
  const e = erreur("assets/img/Photo.webp");
  assert.equal(e.statut, 404);
  assert.equal(e.cause, "casse");
  assert.deepEqual(e.citePar, [{ page: "index.html", ligne: 29 }]);
});

test("un chemin en « / » vise la racine du domaine : 404, cause « chemin-racine »", () => {
  const e = erreur("/favicon.svg");
  assert.equal(e.statut, 404);
  assert.equal(e.cause, "chemin-racine");
  assert.equal(e.url, new URL("/favicon.svg", site.url).href);
});

test("les ressources présentes répondent : aucune erreur pour la feuille de style", () => {
  assert.equal(erreur("css/style.css"), undefined);
});

test("le site déployé n'est pas la version évaluée", () => {
  assert.deepEqual(resultat.deploiement, { sha: "d".repeat(40), date: "2027-01-12T09:00:00Z", versionEvaluee: false });
});

test("un site qui ne répond pas : rien d'autre n'est vérifié, la raison est donnée", async () => {
  const r = await verifierEnLigne({ url: "http://127.0.0.1:9/depot/", inventaire, depot: null, sha: null });
  assert.equal(r.repond, false);
  assert.match(r.raison, /ne répond pas/);
  assert.deepEqual(r.erreurs, []);
  assert.equal(r.deploiement, null);
});
