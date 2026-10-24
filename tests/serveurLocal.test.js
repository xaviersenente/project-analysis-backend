/**
 * Étape 5 : le site servi en local sous /<nom-du-dépôt>/, comme un site de projet GitHub Pages
 * Lancement : npm test
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { preparerSite } from "./aides/depotPiege.js";
import { inventorier } from "../services/source/inventaire.js";
import { servir, nomDuDepot } from "../services/runtime/serveurLocal.js";

let racine;
let serveur;

before(async () => {
  racine = await preparerSite();
  serveur = await servir(racine, "depot-piege", inventorier(racine).fichiers);
});
after(async () => {
  await serveur.fermer();
  fs.rmSync(racine, { recursive: true, force: true });
});

const statut = async (url) => (await fetch(url)).status;

test("le site est servi sous /<nom-du-dépôt>/", async () => {
  assert.match(serveur.url, /^http:\/\/127\.0\.0\.1:\d+\/depot-piege\/$/);
  assert.equal(await statut(serveur.url), 200);
  assert.equal(await statut(`${serveur.url}css/style.css`), 200);
  assert.equal(await statut(`${serveur.url}contact.html`), 200);
});

test("un chemin commençant par / échoue, comme en ligne", async () => {
  assert.equal(await statut(new URL("/favicon.svg", serveur.url).href), 404);
  assert.equal(await statut(new URL("/css/style.css", serveur.url).href), 404);
});

test("la casse compte, même sur un disque qui l'ignore (macOS)", async () => {
  assert.equal(await statut(`${serveur.url}assets/img/photo.webp`), 200);
  assert.equal(await statut(`${serveur.url}assets/img/Photo.webp`), 404);
});

test("rien n'est servi hors du site", async () => {
  assert.equal(await statut(`${serveur.url}..%2F..%2Fetc%2Fpasswd`), 404);
});

test("nom du dépôt : la dernière partie de « propriétaire/dépôt », d'une URL ou d'un chemin", () => {
  assert.equal(nomDuDepot("mmi-montbeliard/sae105-2026-dupont-alice"), "sae105-2026-dupont-alice");
  assert.equal(nomDuDepot("https://github.com/x/R111-2026-TP5-correction.git"), "R111-2026-TP5-correction");
  assert.equal(nomDuDepot("/Users/moi/MMI1/R111-2026-TP5-correction"), "R111-2026-TP5-correction");
});
