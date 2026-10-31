/**
 * Profils d'analyse : la grille dit quoi évaluer, le profil sait comment le mesurer.
 * Chaque profil rend le résultat v3 à partir d'un projet du fichier de promo.
 */
import { analyserDepot } from "../analyse/analyserDepot.js";
import { analyserPortfolio } from "../analyse/analyserPortfolio.js";

const PROFILS = {
  // Site HTML/CSS servi en local depuis le dépôt (SAÉ 105)
  sae105: { analyser: analyserDepot },
  // Site en ligne parcouru tel quel, quel que soit l'outil qui l'a produit (portfolio S3)
  portfolio: { analyser: analyserPortfolio },
};

/**
 * @param {object} grille
 * @returns {{ analyser: Function }}
 * @throws {Error} - Profil inconnu
 */
export const profilDe = (grille) => {
  const profil = PROFILS[grille.profil];
  if (!profil) throw new Error(`Grille ${grille.id} : profil inconnu « ${grille.profil} »`);
  return profil;
};
