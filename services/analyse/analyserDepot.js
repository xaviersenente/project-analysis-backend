/**
 * Étape 8 : analyse d'un projet à partir de son dépôt, à une version figée.
 * Enchaîne les étapes 1 à 3 et les critères ; rend le résultat v2.
 */
import fs from "fs";
import path from "path";
import { creerSuivi } from "../../utils/mesure.js";
import { resoudreVersion, recuperer, trouverRacineSite, dossierCache } from "../source/depot.js";
import { analyserSite } from "./analyserSite.js";
import { nomDuDepot } from "../runtime/serveurLocal.js";

const URL = /https?:\/\/[^\s)>\]]+/;

/** Liens lus dans le README : site en ligne et maquette Figma */
const liensDuReadme = (dossier) => {
  const readme = fs.readdirSync(dossier).find((f) => /^readme\.md$/i.test(f));
  if (!readme) return { site: null, figma: null };
  const lignes = fs.readFileSync(path.join(dossier, readme), "utf-8").split("\n");
  const chercher = (motif) => lignes.find((l) => motif.test(l))?.match(URL)?.[0] ?? null;
  return { site: chercher(/url du site|site en ligne/i), figma: chercher(/figma/i) };
};

/** Alertes qui empêchent de corriger sereinement */
const alertes = (analyse) => {
  const liste = [];
  const js = analyse.blocs?.methodologie?.javascript;
  if (js?.motifs.length) {
    const fichiers = [...new Set(js.motifs.map((m) => m.occurrence.fichier))];
    liste.push({ type: "js-remplace-css", message: "JavaScript détecté qui remplace du CSS", details: `${js.motifs.length} motif${js.motifs.length > 1 ? "s" : ""} dans ${fichiers.join(", ")}` });
  }
  const historique = analyse.historique;
  if (historique) {
    const autres = historique.commits.filter((c) => c.drapeaux.includes("autre-auteur"));
    if (autres.length) {
      const noms = [...new Set(autres.map((c) => c.auteur))];
      liste.push({ type: "autre-auteur", message: "Commits d'un autre auteur", details: `${autres.length} commit${autres.length > 1 ? "s" : ""} de ${noms.join(", ")}` });
    }
    const retouches = historique.commits.filter((c) => c.drapeaux.includes("dates-divergentes"));
    if (retouches.length) {
      // Indice d'un rebase ou d'une date modifiée : à vérifier, ce n'est pas une preuve
      liste.push({ type: "historique-reecrit", message: "Historique Git retouché ?", details: `${retouches.length} commit${retouches.length > 1 ? "s" : ""} dont la date de commit s'écarte de la date d'auteur` });
    }
  }
  return liste;
};

/** Adresse web du dépôt, quand c'est un dépôt GitHub */
const urlDepot = (depot) =>
  /^[\w.-]+\/[\w.-]+$/.test(depot) && !fs.existsSync(depot) ? `https://github.com/${depot}` : /^https?:\/\//.test(depot) ? depot.replace(/\.git$/, "") : null;

/**
 * @param {object} options
 * @param {{ slug: string, nom: string, groupe: string, depot: string, site?: string, figma?: string }} options.projet
 * @param {{ dateRendu: string, contenusAttendus?: string[] }} options.promo
 * @param {string} [options.cache]
 * @param {boolean} [options.sansValidationW3c]
 * @param {boolean} [options.sansNavigateur]
 * @param {string} [options.dossierCaptures] - Captures maquette / site (G11), hors de Git
 * @returns {Promise<{ resultat: object, racineSite: string | null }>}
 */
export const analyserDepot = async ({ projet, promo, cache = dossierCache(), sansValidationW3c = false, sansNavigateur = false, dossierCaptures = null }) => {
  const { nonMesurable: etapes, mesurer } = creerSuivi();

  const version = await mesurer("Version du dépôt", () => resoudreVersion(projet.depot, promo.dateRendu, { cache }));
  const copie = version ? await mesurer("Récupération du dépôt", () => recuperer(projet.depot, version.sha, { cache })) : null;
  const racineRelative = copie ? await mesurer("Racine du site", () => trouverRacineSite(copie)) : null;
  const racineSite = racineRelative ? path.join(copie, racineRelative) : null;

  const readme = copie ? liensDuReadme(copie) : { site: null, figma: null };
  // Le fichier de promo l'emporte ; un champ laissé vide renvoie au README
  const figma = projet.figma || readme.figma;
  const analyse = await analyserSite({
    racine: racineSite,
    promo,
    git: copie ? { dossier: copie, sha: version.sha } : null,
    sansValidationW3c,
    sansNavigateur,
    nomDepot: nomDuDepot(projet.depot),
    emailEtudiant: projet.email ?? null,
    raisonEchec: etapes.at(-1) ? `${etapes.at(-1).etape} : ${etapes.at(-1).raison}` : null,
    maquette: figma ? { url: figma, ecrans: projet.ecrans } : null,
    dossierCaptures,
    cache,
  });

  const resultat = {
    version: 2,
    source: {
      depot: projet.depot,
      ref: version?.ref ?? "—",
      sha: version?.sha ?? "—",
      raison: version?.raison ?? "version introuvable",
      analyseLe: new Date().toISOString(),
      racine: racineRelative,
    },
    projet: { slug: projet.slug, nom: projet.nom, groupe: projet.groupe },
    liens: {
      site: projet.site || readme.site,
      depot: urlDepot(projet.depot),
      figma,
    },
    note: analyse.note,
    criteres: analyse.criteres,
    pages: analyse.pages,
    ressources: analyse.ressources,
    blocs: analyse.blocs,
    historique: analyse.historique,
    // Le contrôle du site en ligne (lot 4) complétera les alertes
    alertes: alertes(analyse),
    nonMesurable: [...etapes, ...analyse.nonMesurable],
  };
  return { resultat, racineSite };
};
