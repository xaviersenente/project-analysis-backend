/**
 * Étape 2 : inventaire des pages et des ressources, résolues sur le disque
 * Lancement : npm test
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { preparerSite } from "./aides/depotPiege.js";
import { inventorier } from "../services/source/inventaire.js";

let racine;
let inventaire;

before(async () => {
  racine = await preparerSite();
  inventaire = inventorier(racine);
});
after(() => fs.rmSync(racine, { recursive: true, force: true }));

test("toutes les pages HTML, même sans lien qui y mène", () => {
  assert.deepEqual(
    inventaire.pages.map((p) => p.fichier),
    ["contact.html", "index.html"]
  );
});

test("les feuilles de style d'une page, dans leur ordre de liaison", () => {
  const contact = inventaire.pages.find((p) => p.fichier === "contact.html");
  assert.deepEqual(contact.feuilles, ["css/style.css", "css/contact.css"]);
});

test("une image citée avec la mauvaise casse est introuvable, cause « casse », avec sa ligne", () => {
  const photo = inventaire.introuvables.find((i) => i.chemin === "assets/img/Photo.webp");
  assert.ok(photo, JSON.stringify(inventaire.introuvables));
  assert.equal(photo.cause, "casse");
  assert.equal(photo.page, "index.html");
  assert.equal(photo.ligne, 29);
  assert.match(photo.extrait, /Photo\.webp/);
});

test("un chemin commençant par / est relevé : il tombera en 404 sur GitHub Pages", () => {
  assert.deepEqual(
    inventaire.cheminsRacine.map(({ page, chemin, ligne }) => ({ page, chemin, ligne })),
    [{ page: "index.html", chemin: "/favicon.svg", ligne: 8 }]
  );
});

test("les images, avec leur alt, leurs dimensions et leur position", () => {
  const index = inventaire.pages.find((p) => p.fichier === "index.html");
  const deco = index.images.find((i) => i.src === "assets/img/motif.svg");
  assert.equal(deco.alt, "");
  assert.equal(deco.chemin, "assets/img/motif.svg");
  assert.equal(deco.ligne, 30);
  const lourde = index.images.find((i) => i.src === "assets/img/lourde.jpg");
  assert.equal(lourde.loading, "lazy");
  assert.equal(lourde.largeur, 1200);
});

test("les scripts et les polices préchargées", () => {
  const index = inventaire.pages.find((p) => p.fichier === "index.html");
  assert.deepEqual(index.scripts.map((s) => s.chemin), ["js/menu.js"]);
  assert.deepEqual(index.policesPrechargees, ["assets/fonts/texte.woff2"]);
});

test("une police citée seulement dans le CSS n'est pas orpheline ; les fichiers jamais cités le sont", () => {
  assert.ok(!inventaire.orphelins.includes("assets/fonts/texte.woff2"));
  assert.ok(!inventaire.orphelins.includes("css/composants.css"));
  // photo.webp n'est citée qu'avec une mauvaise casse
  assert.ok(inventaire.orphelins.includes("assets/img/photo.webp"));
  // Les fichiers de travail ne sont pas des ressources du site
  assert.ok(!inventaire.orphelins.includes("README.md"));
});

test("les fichiers du dépôt, sans .git ni node_modules", () => {
  assert.ok(inventaire.fichiers.includes("css/style.css"));
  assert.ok(inventaire.fichiers.every((f) => !f.startsWith(".git/") && !f.includes("node_modules")));
});
