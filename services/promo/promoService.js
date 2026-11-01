import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Identifiant d'un projet : minuscules, chiffres et tirets (S4)
 */
export const SLUG_REGEX = /^[a-z0-9-]+$/;

/** Racine des données (hors de Git) : un dossier par promo, nommé semestre-type (s1-sae, s3-projet…) */
export const RACINE_DONNEES = path.join(__dirname, "../../data");

/** Identifiant d'une promo : semestre, type, et un suffixe éventuel (s1-sae, s2-projet, s3-sae-portfolio) */
export const PROMO_REGEX = /^s[1-6]-(sae|projet)(-[a-z0-9]+)*$/;

/**
 * Dossier des données de la promo choisie (DATA_DIR, fixé par choisirPromo ou le .env)
 */
export const dossierDonnees = () => path.resolve(process.env.DATA_DIR || RACINE_DONNEES);

/** Les promos de data/ : celles qui ont un fichier promo.json */
export const promosDisponibles = (racine = RACINE_DONNEES) =>
  fs.existsSync(racine)
    ? fs
        .readdirSync(racine, { withFileTypes: true })
        .filter((e) => e.isDirectory() && PROMO_REGEX.test(e.name) && fs.existsSync(path.join(racine, e.name, "promo.json")))
        .map((e) => e.name)
        .sort()
    : [];

/**
 * Choisit la promo à traiter : ses données deviennent le dossier des données (DATA_DIR)
 * @param {string|undefined} id - s1-sae, s3-sae… ; sans identifiant, DATA_DIR doit déjà être fixé
 * @throws {Error} - Promo absente, mal nommée ou introuvable : le message liste les promos disponibles
 */
export const choisirPromo = (id, racine = RACINE_DONNEES) => {
  const disponibles = promosDisponibles(racine);
  const liste = disponibles.length ? disponibles.join(", ") : `aucune (créez ${path.join(racine, "<semestre>-<type>", "promo.json")})`;
  if (!id) {
    if (process.env.DATA_DIR) return dossierDonnees();
    throw new Error(`Précisez la promo, par exemple : ${disponibles[0] ?? "s1-sae"}. Disponibles : ${liste}`);
  }
  if (!PROMO_REGEX.test(id)) throw new Error(`Promo mal nommée : « ${id} » (attendu : s1-sae, s2-projet…). Disponibles : ${liste}`);
  if (!disponibles.includes(id)) throw new Error(`Promo introuvable : « ${id} ». Disponibles : ${liste}`);
  process.env.DATA_DIR = path.join(racine, id);
  return process.env.DATA_DIR;
};

/**
 * Lit le fichier de promo (data/<promo>/promo.json, ou PROMO_FILE)
 * @returns {{ dateRendu: string, projets: Array<{slug, nom, groupe, site}> }}
 */
export const chargerPromo = () => {
  const fichier = process.env.PROMO_FILE || path.join(dossierDonnees(), "promo.json");
  if (!fs.existsSync(fichier)) {
    throw new Error(`Fichier de promo introuvable : ${fichier}`);
  }
  const promo = JSON.parse(fs.readFileSync(fichier, "utf-8"));
  const projets = (promo.projets || []).filter((p) => SLUG_REGEX.test(p.slug));
  return { ...promo, projets };
};

/**
 * Vérifie la forme d'un slug
 * @param {string} slug
 * @throws {Error} - Slug mal formé
 */
export const validerSlug = (slug) => {
  if (typeof slug !== "string" || !SLUG_REGEX.test(slug)) {
    throw new Error(`Identifiant de projet invalide : ${slug}`);
  }
  return slug;
};

/**
 * Chemin du résultat d'analyse d'un projet, toujours dans le dossier des données
 */
export const cheminResultat = (slug) => {
  const dossier = dossierDonnees();
  const chemin = path.resolve(dossier, `${validerSlug(slug)}.json`);
  if (path.dirname(chemin) !== dossier) {
    throw new Error(`Identifiant de projet invalide : ${slug}`);
  }
  return chemin;
};
