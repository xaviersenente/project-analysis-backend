/**
 * Tests des vignettes d'images : une petite image WebP par image du site,
 * rangée avec les données de l'étudiant (jamais dans Git)
 * Lancement : npm test
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import sharp from "sharp";
import { genererVignettes } from "../services/source/vignettes.js";
import thresholds from "../config/thresholds.js";

const racine = fs.mkdtempSync(path.join(os.tmpdir(), "webscope-site-"));
const sortie = fs.mkdtempSync(path.join(os.tmpdir(), "webscope-vignettes-"));

const resultat = () => ({
  ressources: {
    images: [
      { fichier: "assets/img/equipe.jpg", alt: "Photo de l'équipe" },
      { fichier: "assets/svg/logo.svg", alt: "" },
      { fichier: "assets/img/absente.webp", alt: "Image disparue" },
      { fichier: "../../etc/passwd", alt: "Chemin hors du site" },
    ],
  },
});

before(async () => {
  fs.mkdirSync(path.join(racine, "assets/img"), { recursive: true });
  fs.mkdirSync(path.join(racine, "assets/svg"), { recursive: true });
  await sharp({ create: { width: 2400, height: 1600, channels: 3, background: "#f5c518" } })
    .jpeg()
    .toFile(path.join(racine, "assets/img/equipe.jpg"));
  fs.writeFileSync(
    path.join(racine, "assets/svg/logo.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="32"><rect width="120" height="32" fill="#111"/></svg>'
  );
});

after(() => {
  fs.rmSync(racine, { recursive: true, force: true });
  fs.rmSync(sortie, { recursive: true, force: true });
});

test("une vignette WebP, carrée et légère, par image trouvée", async () => {
  const r = resultat();
  const bilan = await genererVignettes({ racineSite: racine, resultat: r, dossierSortie: sortie });
  assert.equal(bilan.generees, 2);

  const [photo, logo] = r.ressources.images;
  assert.match(photo.vignette, /^vignettes\/[a-f0-9]{12}\.webp$/);
  const fichier = path.join(sortie, path.basename(photo.vignette));
  const meta = await sharp(fichier).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.width, thresholds.vignettes.taille);
  assert.equal(meta.height, thresholds.vignettes.taille);
  assert.ok(fs.statSync(fichier).size < 8 * 1024, "une vignette pèse moins de 8 Ko");

  // Un SVG est rasterisé lui aussi
  assert.match(logo.vignette, /\.webp$/);
});

test("une image introuvable ou hors du site n'a pas de vignette, sans faire échouer le reste", async () => {
  const r = resultat();
  const bilan = await genererVignettes({ racineSite: racine, resultat: r, dossierSortie: sortie });
  const [, , absente, horsSite] = r.ressources.images;
  assert.equal(absente.vignette, null);
  assert.equal(horsSite.vignette, null);
  assert.equal(bilan.manquantes.length, 2);
  // Rien n'a été écrit hors du dossier de sortie
  assert.ok(fs.readdirSync(sortie).every((f) => /^[a-f0-9]{12}\.webp$/.test(f)));
});

test("le nom d'une vignette est stable d'une analyse à l'autre", async () => {
  const a = resultat();
  const b = resultat();
  await genererVignettes({ racineSite: racine, resultat: a, dossierSortie: sortie });
  await genererVignettes({ racineSite: racine, resultat: b, dossierSortie: sortie });
  assert.equal(a.ressources.images[0].vignette, b.ressources.images[0].vignette);
});

test("un résultat sans ressources ne plante pas", async () => {
  const bilan = await genererVignettes({ racineSite: racine, resultat: {}, dossierSortie: sortie });
  assert.equal(bilan.generees, 0);
});
