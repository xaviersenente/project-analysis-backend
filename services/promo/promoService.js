import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ValidationError, AppError } from "../../utils/errors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Identifiant d'un projet : minuscules, chiffres et tirets (S4)
 */
export const SLUG_REGEX = /^[a-z0-9-]+$/;

/**
 * Dossier des données (hors de Git), surchargeable par DATA_DIR
 */
export const dossierDonnees = () =>
  path.resolve(process.env.DATA_DIR || path.join(__dirname, "../../data"));

/**
 * Lit le fichier de promo (data/promo.json, ou PROMO_FILE)
 * @returns {{ dateRendu: string, projets: Array<{slug, nom, groupe, site}> }}
 */
export const chargerPromo = () => {
  const fichier = process.env.PROMO_FILE || path.join(dossierDonnees(), "promo.json");
  if (!fs.existsSync(fichier)) {
    throw new AppError("Fichier de promo introuvable", 500);
  }
  const promo = JSON.parse(fs.readFileSync(fichier, "utf-8"));
  const projets = (promo.projets || []).filter((p) => SLUG_REGEX.test(p.slug));
  return { ...promo, projets };
};

/**
 * Vérifie la forme d'un slug
 * @param {string} slug
 * @throws {ValidationError}
 */
export const validerSlug = (slug) => {
  if (typeof slug !== "string" || !SLUG_REGEX.test(slug)) {
    throw new ValidationError("Identifiant de projet invalide");
  }
  return slug;
};

/**
 * Trouve un projet de la promo par son slug
 * @returns {object|null}
 */
export const trouverProjet = (slug) =>
  chargerPromo().projets.find((p) => p.slug === validerSlug(slug)) || null;

/**
 * Chemin du résultat d'analyse d'un projet, toujours dans le dossier des données
 */
export const cheminResultat = (slug) => {
  const dossier = dossierDonnees();
  const chemin = path.resolve(dossier, `${validerSlug(slug)}.json`);
  if (path.dirname(chemin) !== dossier) {
    throw new ValidationError("Identifiant de projet invalide");
  }
  return chemin;
};
