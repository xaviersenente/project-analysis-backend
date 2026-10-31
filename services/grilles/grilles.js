/**
 * Grilles d'évaluation : une par SAÉ, dans config/grilles/<id>.json.
 * Le fichier de promo désigne la sienne (grille) ; sans elle, la SAÉ 105.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { grilleSchema, ID_GRILLE_REGEX } from "../../schema/grille.js";

const DOSSIER = fileURLToPath(new URL("../../config/grilles/", import.meta.url));
export const GRILLE_PAR_DEFAUT = "sae105-2026";

const chargees = new Map();

/**
 * @param {string} [id]
 * @returns {object} La grille validée
 * @throws {Error} - Identifiant mal formé, grille absente ou invalide
 */
export const chargerGrille = (id = GRILLE_PAR_DEFAUT) => {
  if (!ID_GRILLE_REGEX.test(id)) throw new Error(`Identifiant de grille mal formé : ${id}`);
  if (chargees.has(id)) return chargees.get(id);
  const fichier = path.join(DOSSIER, `${id}.json`);
  if (!fs.existsSync(fichier)) throw new Error(`Grille introuvable : config/grilles/${id}.json`);
  const verification = grilleSchema.safeParse(JSON.parse(fs.readFileSync(fichier, "utf-8")));
  if (!verification.success) {
    const probleme = verification.error.issues[0];
    throw new Error(`Grille ${id} invalide : ${probleme.path.join(".")} ${probleme.message}`);
  }
  if (verification.data.id !== id) throw new Error(`Grille ${id} : son champ id vaut « ${verification.data.id} »`);
  chargees.set(id, verification.data);
  return verification.data;
};

/** Grilles disponibles */
export const listerGrilles = () =>
  fs
    .readdirSync(DOSSIER)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5));

/** Ce que le résultat porte de la grille : l'interface en tire ses axes */
export const resumeGrille = (grille) => ({
  id: grille.id,
  nom: grille.nom,
  profil: grille.profil,
  axes: grille.axes.map(({ id, nom, points, description }) => ({ id, nom, points, description })),
});
