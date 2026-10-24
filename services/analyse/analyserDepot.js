/**
 * Étape 8 : analyse d'un projet à partir de son dépôt, à une version figée.
 * Enchaîne les étapes 1 à 3 et les critères ; rend le résultat v2.
 */
import fs from "fs";
import path from "path";
import { creerSuivi } from "../../utils/mesure.js";
import { resoudreVersion, recuperer, trouverRacineSite, dossierCache } from "../source/depot.js";
import { analyserSite } from "./analyserSite.js";

const URL = /https?:\/\/[^\s)>\]]+/;

/** Liens lus dans le README : site en ligne et maquette Figma */
const liensDuReadme = (dossier) => {
  const readme = fs.readdirSync(dossier).find((f) => /^readme\.md$/i.test(f));
  if (!readme) return { site: null, figma: null };
  const lignes = fs.readFileSync(path.join(dossier, readme), "utf-8").split("\n");
  const chercher = (motif) => lignes.find((l) => motif.test(l))?.match(URL)?.[0] ?? null;
  return { site: chercher(/url du site|site en ligne/i), figma: chercher(/figma/i) };
};

/** Adresse web du dépôt, quand c'est un dépôt GitHub */
const urlDepot = (depot) =>
  /^[\w.-]+\/[\w.-]+$/.test(depot) && !fs.existsSync(depot) ? `https://github.com/${depot}` : /^https?:\/\//.test(depot) ? depot.replace(/\.git$/, "") : null;

/**
 * @param {object} options
 * @param {{ slug: string, nom: string, groupe: string, depot: string, site?: string }} options.projet
 * @param {{ dateRendu: string, contenusAttendus?: string[] }} options.promo
 * @param {string} [options.cache]
 * @param {boolean} [options.sansValidationW3c]
 * @returns {Promise<{ resultat: object, racineSite: string | null }>}
 */
export const analyserDepot = async ({ projet, promo, cache = dossierCache(), sansValidationW3c = false }) => {
  const { nonMesurable: etapes, mesurer } = creerSuivi();

  const version = await mesurer("Version du dépôt", () => resoudreVersion(projet.depot, promo.dateRendu, { cache }));
  const copie = version ? await mesurer("Récupération du dépôt", () => recuperer(projet.depot, version.sha, { cache })) : null;
  const racineRelative = copie ? await mesurer("Racine du site", () => trouverRacineSite(copie)) : null;
  const racineSite = racineRelative ? path.join(copie, racineRelative) : null;

  const analyse = await analyserSite({
    racine: racineSite,
    promo,
    git: copie ? { dossier: copie, sha: version.sha } : null,
    sansValidationW3c,
    raisonEchec: etapes.at(-1) ? `${etapes.at(-1).etape} : ${etapes.at(-1).raison}` : null,
  });

  const readme = copie ? liensDuReadme(copie) : { site: null, figma: null };
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
      site: readme.site ?? projet.site ?? null,
      depot: urlDepot(projet.depot),
      figma: readme.figma,
    },
    note: analyse.note,
    criteres: analyse.criteres,
    pages: analyse.pages,
    ressources: analyse.ressources,
    blocs: analyse.blocs,
    // Site en ligne (lot 4), JavaScript (lot 2) et historique (lot 3) donneront les alertes
    alertes: [],
    nonMesurable: [...etapes, ...analyse.nonMesurable],
  };
  return { resultat, racineSite };
};
