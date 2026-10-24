import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import sharp from "sharp";
import thresholds from "../../config/thresholds.js";

/**
 * Nom stable d'une vignette : le même fichier donne la même vignette d'une analyse à l'autre
 * @param {string} fichier - Chemin de l'image dans le site
 */
const nomVignette = (fichier) =>
  `${createHash("sha1").update(fichier).digest("hex").slice(0, 12)}.webp`;

/**
 * Génère une vignette WebP pour chaque image du résultat, et renseigne son champ « vignette ».
 * Une image introuvable ou hors du site reçoit vignette: null, sans faire échouer le reste.
 *
 * @param {object} options
 * @param {string} options.racineSite - Dossier racine du site (le dépôt cloné)
 * @param {object} options.resultat - Résultat v2, modifié en place
 * @param {string} options.dossierSortie - data/vignettes/<slug>/ (hors de Git)
 * @returns {Promise<{ generees: number, manquantes: Array<{ fichier: string, raison: string }> }>}
 */
export const genererVignettes = async ({ racineSite, resultat, dossierSortie }) => {
  const images = resultat?.ressources?.images ?? [];
  const racine = path.resolve(racineSite);
  const { taille, qualite } = thresholds.vignettes;
  const manquantes = [];
  let generees = 0;

  fs.mkdirSync(dossierSortie, { recursive: true });

  for (const image of images) {
    const source = path.resolve(racine, image.fichier);
    // Jamais de lecture hors du site
    if (!source.startsWith(racine + path.sep)) {
      image.vignette = null;
      manquantes.push({ fichier: image.fichier, raison: "chemin hors du site" });
      continue;
    }
    if (!fs.existsSync(source)) {
      image.vignette = null;
      manquantes.push({ fichier: image.fichier, raison: "fichier introuvable" });
      continue;
    }
    try {
      const nom = nomVignette(image.fichier);
      await sharp(source, { animated: false })
        .resize(taille, taille, { fit: "cover", position: "attention" })
        .webp({ quality: qualite })
        .toFile(path.join(dossierSortie, nom));
      // Relatif à la page du projet (/projet/<slug>/), donc protégé par la même règle d'accès
      image.vignette = `vignettes/${nom}`;
      generees++;
    } catch (error) {
      image.vignette = null;
      manquantes.push({ fichier: image.fichier, raison: error.message.split("\n")[0] });
    }
  }

  return { generees, manquantes };
};
