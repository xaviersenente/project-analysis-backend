/**
 * Les polices du site, copiées avec les données (<données>/polices/<slug>/, hors de Git)
 * et publiées sous la page du projet, comme les vignettes : l'interface montre ainsi
 * chaque famille dans sa vraie police, sans dépendre des polices installées sur le poste.
 */
import fs from "fs";
import path from "path";
import { createHash } from "crypto";

const FORMATS = new Set(["woff2", "woff", "ttf", "otf"]);

/** Nom stable : le même fichier donne la même copie d'une analyse à l'autre */
const nomCopie = (fichier, format) => `${createHash("sha1").update(fichier).digest("hex").slice(0, 12)}.${format}`;

/**
 * Copie les polices du résultat et renseigne leur champ « copie » ; le dossier est vidé avant
 * @param {object} options
 * @param {string} options.racineSite - Racine du site (le dépôt cloné)
 * @param {object} options.resultat - Résultat v2, modifié en place
 * @param {string} options.dossierSortie - data/polices/<slug>/
 * @returns {{ copiees: number }}
 */
export const copierPolices = ({ racineSite, resultat, dossierSortie }) => {
  const racine = path.resolve(racineSite);
  fs.rmSync(dossierSortie, { recursive: true, force: true });
  fs.mkdirSync(dossierSortie, { recursive: true });
  let copiees = 0;
  for (const police of resultat.ressources?.polices ?? []) {
    const source = path.resolve(racine, police.fichier);
    const format = police.format.toLowerCase();
    // Jamais de lecture hors du site
    if (!source.startsWith(racine + path.sep) || !FORMATS.has(format) || !fs.existsSync(source)) {
      police.copie = null;
      continue;
    }
    const nom = nomCopie(police.fichier, format);
    fs.copyFileSync(source, path.join(dossierSortie, nom));
    // Relatif à la page du projet (/projet/<slug>/), donc protégé par la même règle d'accès
    police.copie = `polices/${nom}`;
    copiees++;
  }
  return { copiees };
};
