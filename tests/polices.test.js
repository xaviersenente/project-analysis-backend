/**
 * Les polices du site copiées avec les données (data/polices/<slug>/, jamais dans Git),
 * pour que l'interface montre chaque famille dans sa vraie police.
 * Lancement : npm test
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { copierPolices } from "../services/source/polices.js";

const racine = fs.mkdtempSync(path.join(os.tmpdir(), "webscope-site-"));
const sortie = fs.mkdtempSync(path.join(os.tmpdir(), "webscope-polices-"));
after(() => {
  fs.rmSync(racine, { recursive: true, force: true });
  fs.rmSync(sortie, { recursive: true, force: true });
});

fs.mkdirSync(path.join(racine, "assets/fonts"), { recursive: true });
fs.writeFileSync(path.join(racine, "assets/fonts/inter-400.woff2"), "wOF2 inter");
fs.writeFileSync(path.join(racine, "assets/fonts/titre.woff"), "wOFF titre");
// Une ancienne copie, d'une police qui a disparu du site
fs.writeFileSync(path.join(sortie, "ancienne.woff2"), "x");

const resultat = {
  ressources: {
    polices: [
      { fichier: "assets/fonts/inter-400.woff2", famille: "Inter", graisse: "400", format: "woff2" },
      { fichier: "assets/fonts/titre.woff", famille: "Titre", graisse: "700", format: "woff" },
      { fichier: "assets/fonts/absente.woff2", famille: "Absente", graisse: "400", format: "woff2" },
      { fichier: "../../etc/passwd.woff2", famille: "Piège", graisse: "400", format: "woff2" },
    ],
  },
};

test("chaque police du site est copiée sous un nom stable ; son chemin relatif est noté", () => {
  const bilan = copierPolices({ racineSite: racine, resultat, dossierSortie: sortie });
  const [inter, titre, absente, piege] = resultat.ressources.polices;
  assert.match(inter.copie, /^polices\/[0-9a-f]{12}\.woff2$/);
  assert.match(titre.copie, /^polices\/[0-9a-f]{12}\.woff$/);
  assert.equal(fs.readFileSync(path.join(sortie, path.basename(inter.copie)), "utf-8"), "wOF2 inter");
  assert.equal(absente.copie, null);
  assert.equal(piege.copie, null);
  assert.equal(bilan.copiees, 2);
  // Le dossier ne garde que les polices de cette analyse
  assert.deepEqual(fs.readdirSync(sortie).sort(), [path.basename(inter.copie), path.basename(titre.copie)].sort());
  // Même fichier, même nom d'une analyse à l'autre
  const avant = inter.copie;
  copierPolices({ racineSite: racine, resultat, dossierSortie: sortie });
  assert.equal(resultat.ressources.polices[0].copie, avant);
});
