/**
 * Site bilingue : un dossier par langue à la racine (fr/, en/), la même structure HTML dans chacun.
 * Seule la langue analysée est évaluée ; les autres versions sont comparées par leur nombre de pages.
 * Quand les nombres diffèrent et que les noms de fichiers se répondent, les pages qui manquent sont nommées.
 * Rien de noté.
 */
import thresholds from "../../config/thresholds.js";

const { analysee, autres, nomsCommunsMin } = thresholds.sae105.langues;

/**
 * @param {Array<{ fichier: string }>} pages - Pages de l'inventaire
 * @returns {null | { analysee: string, versions: Array<{ langue: string, pages: string[] }>, complet: boolean, manquantes: string[] }}
 *   null : pas de dossier pour la langue analysée et au moins une autre langue
 */
export const versionsLinguistiques = (pages) => {
  const dans = (langue) => pages.map((p) => p.fichier).filter((f) => f.startsWith(`${langue}/`)).sort();
  const versions = [analysee, ...autres].map((langue) => ({ langue, pages: dans(langue) })).filter((v) => v.pages.length > 0);
  if (versions[0]?.langue !== analysee || versions.length < 2) return null;

  const [reference, ...traductions] = versions;
  const noms = (v) => new Set(v.pages.map((f) => f.slice(v.langue.length + 1)));
  // Même nombre de pages : complet, même si des noms sont traduits (a-propos.html / about.html)
  const manquantes = traductions.filter((v) => v.pages.length !== reference.pages.length).flatMap((v) => {
    const a = noms(reference);
    const b = noms(v);
    const communs = [...a].filter((n) => b.has(n)).length;
    // Noms traduits (apropos.html / about.html) : on ne devine pas les correspondances
    if (communs / Math.max(a.size, b.size) <= nomsCommunsMin) return [];
    return [
      ...[...a].filter((n) => !b.has(n)).map((n) => `${v.langue}/${n}`),
      ...[...b].filter((n) => !a.has(n)).map((n) => `${reference.langue}/${n}`),
    ];
  });
  return {
    analysee,
    versions,
    complet: traductions.every((v) => v.pages.length === reference.pages.length) && manquantes.length === 0,
    manquantes,
  };
};

/** Les pages à évaluer : la racine et la langue analysée, jamais les autres versions */
export const pagesEvaluees = (pages, langues) =>
  langues ? pages.filter((p) => !langues.versions.slice(1).some((v) => p.fichier.startsWith(`${v.langue}/`))) : pages;
