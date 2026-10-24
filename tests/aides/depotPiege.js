/**
 * Prépare le dépôt piégé de l'étape 10 dans un dossier temporaire :
 * les fichiers de tests/fixtures/depot-piege, deux images générées,
 * puis un historique Git daté (un commit avant la date de rendu, un après).
 */
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import sharp from "sharp";

const FIXTURE = fileURLToPath(new URL("../fixtures/depot-piege", import.meta.url));

export const DATE_RENDU = "2027-01-15T23:59:00+01:00";

const git = (dossier, args, date) =>
  execFileSync("git", args, {
    cwd: dossier,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Alice Dupont",
      GIT_AUTHOR_EMAIL: "alice@etu.test",
      GIT_COMMITTER_NAME: "Alice Dupont",
      GIT_COMMITTER_EMAIL: "alice@etu.test",
      ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}),
    },
    stdio: "pipe",
  }).toString();

/** Copie le site piégé et génère ses images : à utiliser tel quel, sans Git */
export const preparerSite = async (dossier = fs.mkdtempSync(path.join(os.tmpdir(), "piege-"))) => {
  fs.cpSync(FIXTURE, dossier, { recursive: true });
  // La page cite « Photo.webp » : le fichier, lui, est en minuscules (faute de casse)
  await sharp({ create: { width: 400, height: 300, channels: 3, background: "#f5c518" } })
    .webp()
    .toFile(path.join(dossier, "assets/img/photo.webp"));
  // Une image d'environ 300 Ko (seuil E10 : 150 Ko) : du bruit, peu compressible
  const bruit = Buffer.alloc(1200 * 800 * 3);
  for (let i = 0; i < bruit.length; i++) bruit[i] = (i * 2654435761) >>> 24;
  await sharp(bruit, { raw: { width: 1200, height: 800, channels: 3 } })
    .jpeg({ quality: 70 })
    .toFile(path.join(dossier, "assets/img/lourde.jpg"));
  return dossier;
};

/**
 * Le site piégé, versionné : un commit le 10 janvier, un autre après le rendu
 * @param {{ tagV1?: boolean }} options - Poser le tag v1 sur le premier commit
 * @returns {Promise<{ dossier: string, shaAvant: string, shaApres: string }>}
 */
export const preparerDepot = async ({ tagV1 = false } = {}) => {
  const dossier = await preparerSite();
  git(dossier, ["init", "-q", "-b", "main"]);
  git(dossier, ["add", "-A"]);
  git(dossier, ["commit", "-q", "-m", "Première version du site"], "2027-01-10T14:00:00+01:00");
  const shaAvant = git(dossier, ["rev-parse", "HEAD"]).trim();
  if (tagV1) git(dossier, ["tag", "v1"], "2027-01-10T14:05:00+01:00");

  fs.writeFileSync(path.join(dossier, "apres-rendu.html"), "<!DOCTYPE html><title>Trop tard</title>\n");
  git(dossier, ["add", "-A"]);
  git(dossier, ["commit", "-q", "-m", "Ajout après la date de rendu"], "2027-01-20T10:00:00+01:00");
  const shaApres = git(dossier, ["rev-parse", "HEAD"]).trim();

  return { dossier, shaAvant, shaApres };
};
