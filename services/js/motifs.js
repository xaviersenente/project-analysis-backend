/**
 * Étape 4 : le JavaScript qui fait à la main ce que le CSS ou le HTML savent faire (M4).
 * Le JavaScript n'est pas compté en lignes : il est jugé sur ce qu'il fait.
 * Un JavaScript qui ne relève d'aucun motif (un calcul, un appel de données) ne coûte rien.
 */
import thresholds from "../../config/thresholds.js";

const MOTIFS = thresholds.sae105.javascript.motifs;

/**
 * Remplace les commentaires par des espaces, en gardant les retours à la ligne :
 * les positions (ligne, colonne) restent justes
 */
export const masquerCommentaires = (code) =>
  code
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "))
    // « // » précédé de « : » est une adresse (https://), pas un commentaire
    .replace(/(^|[^:\\])\/\/[^\n]*/g, (c, avant) => avant + " ".repeat(c.length - avant.length));

/**
 * @param {Array<{ chemin: string, contenu: string, ligneDepart: number }>} fichiers - Fichiers .js et scripts en ligne
 * @returns {Array<{ motif: string, occurrence: object, alternative: { titre: string, code: string } }>}
 */
export const chercherMotifs = (fichiers) => {
  const trouves = [];
  for (const { chemin, contenu, ligneDepart = 1 } of fichiers) {
    const code = masquerCommentaires(contenu);
    const lignes = contenu.split("\n");
    for (const { motif, expression, alternative } of MOTIFS) {
      for (const m of code.matchAll(new RegExp(expression.source, expression.flags))) {
        const avant = code.slice(0, m.index);
        const numero = avant.split("\n").length - 1;
        const colonne = m.index - (avant.lastIndexOf("\n") + 1);
        const brute = lignes[numero];
        const retrait = brute.length - brute.trimStart().length;
        const extrait = brute.trim();
        // Pour un motif sur plusieurs lignes, on surligne son début sur la ligne citée
        const longueur = Math.min(m[0].split("\n")[0].length, extrait.length - (colonne - retrait));
        trouves.push({
          motif,
          occurrence: {
            fichier: chemin,
            ligne: ligneDepart + numero,
            colonne: colonne + 1,
            extrait,
            surligne: [colonne - retrait, colonne - retrait + longueur],
          },
          alternative,
        });
      }
    }
  }
  return trouves.sort((a, b) =>
    a.occurrence.fichier === b.occurrence.fichier ? a.occurrence.ligne - b.occurrence.ligne : 0
  );
};

/** Volume de JavaScript, à titre d'information */
export const volume = (fichiers) => ({
  fichiers: fichiers.filter((f) => f.chemin.endsWith(".js")).length,
  lignes: fichiers.reduce((s, f) => s + f.contenu.split("\n").filter((l) => l.trim()).length, 0),
});
