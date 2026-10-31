/**
 * Profil « portfolio » (S3) : le site en ligne est le livrable ; le dépôt donne l'historique,
 * les fichiers déclaratifs et la stack.
 * Aucun code du dépôt n'est exécuté (framework, CMS…) : on parcourt le site publié.
 * Les contraintes notées restent au jury ; les mesures sont des informations (statut I).
 */
import { creerSuivi } from "../../utils/mesure.js";
import { resoudreVersion, recuperer, dossierCache } from "../source/depot.js";
import { parcourirSite } from "../runtime/parcours.js";
import { pointsParContrainte, points, noter } from "./notation.js";
import { nonMesurable, aJuger } from "./mesure.js";
import { resumeGrille } from "../grilles/grilles.js";
import { liensDuReadme, urlDepot } from "./analyserDepot.js";
import { ecoindex } from "../qualite/ecoindex.js";
import { categorieTiers } from "../runtime/parcours.js";
import qualiteWeb, { pagesLues } from "./qualiteWeb.js";
import processus from "./processus.js";
import thresholds from "../../config/thresholds.js";
import { lireHistorique } from "../source/historique.js";
import { fichiersDuDepot, tracesIaDansHistorique, elementsSensibles, declaratif } from "../source/depotPortfolio.js";

export const ANALYSEURS = { ...qualiteWeb, ...processus };

/**
 * Les critères de la grille, mesurés par les analyseurs du profil.
 * Un critère manuel sans analyseur attend le jury ; un autre sans analyseur est « Non mesurable ».
 */
export const evaluerCriteres = async (grille, analyseurs, ctx) => {
  const maxPoints = pointsParContrainte(grille);
  const criteres = [];
  for (const modele of grille.criteres) {
    let mesure;
    if (!analyseurs[modele.id]) {
      mesure = modele.methode === "manuel" ? aJuger() : nonMesurable("Aucun analyseur pour ce critère dans ce profil");
    } else {
      try {
        mesure = await analyseurs[modele.id](ctx);
      } catch (error) {
        console.error(`⚠️ ${modele.id} : ${error.message}`);
        mesure = nonMesurable(`Analyse impossible : ${error.message.split("\n")[0]}`);
      }
    }
    const { bonusPoints, ...propre } = mesure;
    const critere = { ...modele, ...propre, bonusPoints };
    critere.points = points(critere, maxPoints[modele.id], grille.bonusMax);
    delete critere.bonusPoints;
    critere.occurrences = (critere.occurrences ?? []).map((o) => ({ surligne: null, ...o }));
    critere.totalOccurrences = critere.occurrences.length;
    criteres.push(critere);
  }
  return criteres;
};

/** Ce que le résultat garde du parcours : sans le texte ni les liens des pages */
export const resumeParcours = (parcours) => ({
  url: parcours.url,
  parcouruLe: parcours.parcouruLe,
  https: parcours.https,
  robots: parcours.robots,
  sitemap: parcours.sitemap,
  nonParcourues: parcours.nonParcourues,
  pages: parcours.pages.map((p) =>
    p.page
      ? {
          chemin: p.chemin,
          url: p.url,
          statut: p.statut,
          titre: p.titre,
          poidsKo: p.poidsKo,
          requetes: p.requetes,
          dom: p.dom,
          ecoindex: ecoindex({ dom: p.dom, requetes: p.requetes, poidsKo: p.poidsKo }),
          debordement: p.debordement.largeur > p.debordement.viewport,
          violations: p.violations.reduce((s, v) => s + v.total, 0),
          tiers: p.tiers.length,
          captures: p.captures,
        }
      : { chemin: p.chemin, url: p.url, statut: p.statut, erreur: p.erreur ?? null, captures: [] }
  ),
  tiers: [...new Set(parcours.pages.flatMap((p) => (p.tiers ?? []).map((u) => new URL(u).hostname)))].map((hote) => ({
    hote,
    categorie: categorieTiers(hote),
    pages: parcours.pages.filter((p) => p.tiers?.some((u) => new URL(u).hostname === hote)).map((p) => p.chemin),
  })),
  cookies: parcours.cookies,
});

const alertes = (ctx) => {
  const liste = [];
  if (ctx.depot && !declaratif(ctx.depot.dossier, ctx.depot.fichiers, thresholds.portfolio.declaratifs.ia)) {
    liste.push({ type: "ia-non-declaree", message: "Pas de fichier IA.md", details: "Le sujet traite son absence comme une déclaration mensongère" });
  }
  if (ctx.depot?.sensibles.length) {
    const secrets = ctx.depot.sensibles.filter((o) => o.ligne);
    liste.push({
      type: "fichiers-sensibles",
      message: "Fichiers sensibles dans le dépôt public",
      details: `${ctx.depot.sensibles.length} élément(s)${secrets.length ? `, dont ${secrets.length} secret(s) en dur (valeurs masquées)` : ""} : ${[...new Set(ctx.depot.sensibles.map((o) => o.fichier))].slice(0, 4).join(", ")}`,
    });
  }
  const autres = ctx.historique?.commits.filter((c) => c.drapeaux.includes("autre-auteur")) ?? [];
  if (autres.length) {
    liste.push({ type: "autre-auteur", message: "Commits d'un autre auteur", details: `${autres.length} commit(s) de ${[...new Set(autres.map((c) => c.auteur))].join(", ")}` });
  }
  if (ctx.parcours && pagesLues(ctx).length === 0) {
    const accueil = ctx.parcours.pages[0];
    liste.push({ type: "site-inaccessible", message: "Site inaccessible en ligne", details: `${ctx.parcours.url} : ${accueil?.erreur ?? `statut ${accueil?.statut}`}` });
  }
  return liste;
};

/**
 * @param {object} options
 * @param {{ slug: string, nom: string, groupe: string, depot?: string, site?: string, figma?: string }} options.projet
 * @param {{ dateRendu: string }} options.promo
 * @param {object} options.grille
 * @param {string} [options.cache]
 * @param {boolean} [options.sansNavigateur] - Sans parcours du site (tests, hors connexion)
 * @param {string} [options.dossierCaptures]
 * @returns {Promise<{ resultat: object, racineSite: null }>}
 */
export const analyserPortfolio = async ({ projet, promo, grille, cache = dossierCache(), sansNavigateur = false, dossierCaptures = null }) => {
  const { nonMesurable: etapes, mesurer } = creerSuivi();

  // Le dépôt : sa version au rendu (l'historique et les fichiers déclaratifs viennent au lot 3)
  const version = projet.depot ? await mesurer("Version du dépôt", () => resoudreVersion(projet.depot, promo.dateRendu, { cache })) : null;
  const copie = version ? await mesurer("Récupération du dépôt", () => recuperer(projet.depot, version.sha, { cache })) : null;
  const readme = copie ? liensDuReadme(copie) : { site: null, figma: null };
  const site = projet.site || readme.site;

  const ctx = { projet, promo, copie };
  if (copie) {
    const depot = await mesurer("Lecture du dépôt", () => {
      const fichiers = fichiersDuDepot(copie);
      return { dossier: copie, fichiers, tracesIa: tracesIaDansHistorique(copie, version.sha), sensibles: elementsSensibles(copie, fichiers) };
    });
    if (depot) ctx.depot = depot;
    else ctx.raisonDepot = etapes.at(-1)?.raison;
    ctx.historique = await mesurer("Historique Git", () =>
      lireHistorique({ dossier: copie, sha: version.sha, dateRendu: promo.dateRendu, emailEtudiant: projet.email ?? null, reglages: thresholds.portfolio.historique })
    );
    if (!ctx.historique) ctx.raisonHistorique = etapes.at(-1)?.raison;
  } else {
    ctx.raisonDepot = ctx.raisonHistorique = projet.depot ? `Dépôt illisible : ${etapes.at(-1)?.raison ?? "version introuvable"}` : "Pas de dépôt dans le fichier de promo";
  }
  // La période du projet : du début annoncé (dateDebut), sinon du premier commit, au rendu
  const premierCommit = ctx.historique?.sessions[0]?.debut;
  ctx.periode = { debut: new Date(promo.dateDebut ?? premierCommit ?? promo.dateRendu), fin: new Date(promo.dateRendu) };
  if (!site) ctx.raisonParcours = "Pas d'adresse du site en ligne (fichier de promo ou README)";
  else if (sansNavigateur) ctx.raisonParcours = "Parcours du site désactivé pour cette analyse";
  else {
    ctx.parcours = await mesurer("Parcours du site en ligne", () => parcourirSite({ url: site, dossierCaptures }));
    if (!ctx.parcours) ctx.raisonParcours = etapes.at(-1)?.raison;
  }

  const criteres = await evaluerCriteres(grille, ANALYSEURS, ctx);
  const resultat = {
    version: 3,
    grille: resumeGrille(grille),
    source: {
      depot: projet.depot ?? "—",
      ref: version?.ref ?? "—",
      sha: version?.sha ?? "—",
      raison: version?.raison ?? (projet.depot ? "version introuvable" : "pas de dépôt dans le fichier de promo"),
      analyseLe: new Date().toISOString(),
    },
    projet: { slug: projet.slug, nom: projet.nom, groupe: projet.groupe },
    liens: { site: site ?? null, depot: projet.depot ? urlDepot(projet.depot) : null, figma: projet.figma || readme.figma || null },
    note: noter(criteres, grille),
    criteres,
    parcours: ctx.parcours ? resumeParcours(ctx.parcours) : undefined,
    historique: ctx.historique ?? undefined,
    alertes: alertes(ctx),
    nonMesurable: etapes,
  };
  return { resultat, racineSite: null };
};
