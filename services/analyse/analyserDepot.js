/**
 * Étape 8 : analyse d'un projet à partir de son dépôt, à une version figée.
 * Enchaîne les étapes 1 à 3 et les critères ; rend le résultat v3. Profil SAÉ 105.
 */
import fs from "fs";
import path from "path";
import { creerSuivi } from "../../utils/mesure.js";
import { resoudreVersion, recuperer, trouverRacineSite, dossierCache } from "../source/depot.js";
import { analyserSite } from "./analyserSite.js";
import { nomDuDepot } from "../runtime/serveurLocal.js";
import { chargerGrille, resumeGrille } from "../grilles/grilles.js";

const URL = /https?:\/\/[^\s)>\]]+/;

/** Liens lus dans le README : site en ligne et maquette Figma */
export const liensDuReadme = (dossier) => {
  const readme = fs.readdirSync(dossier).find((f) => /^readme\.md$/i.test(f));
  if (!readme) return { site: null, figma: null };
  const lignes = fs.readFileSync(path.join(dossier, readme), "utf-8").split("\n");
  const chercher = (motif) => lignes.find((l) => motif.test(l))?.match(URL)?.[0] ?? null;
  return { site: chercher(/url du site|site en ligne/i), figma: chercher(/figma/i) };
};

/** Alertes qui empêchent de corriger sereinement */
export const alertes = (analyse) => {
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
  const langues = analyse.langues;
  if (langues && !langues.complet) {
    const comptes = langues.versions.map((v) => `${v.langue} : ${v.pages.length} page${v.pages.length > 1 ? "s" : ""}`).join(", ");
    liste.push({
      type: "langues-incompletes",
      message: "Versions linguistiques incomplètes",
      details: comptes + (langues.manquantes.length ? ` ; sans traduction : ${langues.manquantes.join(", ")}` : ""),
    });
  }
  const enLigne = analyse.enLigne;
  if (enLigne && !enLigne.repond) {
    liste.push({ type: "site-inaccessible", message: "Site inaccessible en ligne", details: `${enLigne.url} : ${enLigne.raison} ; l'analyse du dépôt reste valable` });
  }
  if (enLigne?.erreurs.length) {
    const CAUSES = { casse: "casse", "chemin-racine": "chemin en /", "absent-du-depot": "absent du dépôt" };
    const liste404 = enLigne.erreurs.slice(0, 5).map((e) => `${e.chemin} (${e.statut || "sans réponse"}${e.cause ? `, ${CAUSES[e.cause]}` : ""})`);
    const reste = enLigne.erreurs.length - liste404.length;
    liste.push({
      type: "pages-404",
      message: "Adresses en erreur sur le site en ligne",
      details: liste404.join(", ") + (reste > 0 ? ` et ${reste} autre${reste > 1 ? "s" : ""}` : ""),
    });
  }
  if (enLigne?.deploiement && !enLigne.deploiement.versionEvaluee) {
    liste.push({
      type: "site-non-a-jour",
      message: "Le site en ligne n'est pas la version évaluée",
      details: `déployé : ${enLigne.deploiement.sha.slice(0, 7)} le ${new Date(enLigne.deploiement.date).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" })}`,
    });
  }
  return liste;
};

/** Adresse web du dépôt, quand c'est un dépôt GitHub */
export const urlDepot = (depot) =>
  /^[\w.-]+\/[\w.-]+$/.test(depot) && !fs.existsSync(depot) ? `https://github.com/${depot}` : /^https?:\/\//.test(depot) ? depot.replace(/\.git$/, "") : null;

/**
 * @param {object} options
 * @param {{ slug: string, nom: string, groupe: string, depot: string, site?: string, figma?: string }} options.projet
 * @param {{ dateRendu: string, contenusAttendus?: string[] }} options.promo
 * @param {object} [options.grille] - Grille de la SAÉ ; par défaut, la SAÉ 105
 * @param {string} [options.cache]
 * @param {boolean} [options.sansValidationW3c]
 * @param {boolean} [options.sansNavigateur]
 * @param {string} [options.dossierCaptures] - Captures maquette / site (G11), hors de Git
 * @param {boolean} [options.sansEnLigne] - Sans le contrôle du site en ligne (tests, hors connexion)
 * @returns {Promise<{ resultat: object, racineSite: string | null }>}
 */
export const analyserDepot = async ({ projet, promo, grille = chargerGrille(), cache = dossierCache(), sansValidationW3c = false, sansNavigateur = false, dossierCaptures = null, sansEnLigne = false }) => {
  const { nonMesurable: etapes, mesurer } = creerSuivi();

  const version = await mesurer("Version du dépôt", () => resoudreVersion(projet.depot, promo.dateRendu, { cache }));
  const copie = version ? await mesurer("Récupération du dépôt", () => recuperer(projet.depot, version.sha, { cache })) : null;
  const racineRelative = copie ? await mesurer("Racine du site", () => trouverRacineSite(copie)) : null;
  const racineSite = racineRelative ? path.join(copie, racineRelative) : null;

  const readme = copie ? liensDuReadme(copie) : { site: null, figma: null };
  // Le fichier de promo l'emporte ; un champ laissé vide renvoie au README
  const figma = projet.figma || readme.figma;
  const site = projet.site || readme.site;
  const analyse = await analyserSite({
    racine: racineSite,
    grille,
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
    siteEnLigne: site && !sansEnLigne ? { url: site, depot: urlDepot(projet.depot)?.match(/github\.com\/([\w.-]+\/[\w.-]+)$/)?.[1] ?? null, sha: version?.sha ?? null } : null,
  });

  const resultat = {
    version: 3,
    grille: resumeGrille(grille),
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
      site,
      depot: urlDepot(projet.depot),
      figma,
    },
    note: analyse.note,
    criteres: analyse.criteres,
    pages: analyse.pages,
    ressources: analyse.ressources,
    blocs: analyse.blocs,
    historique: analyse.historique,
    enLigne: analyse.enLigne,
    langues: analyse.langues,
    alertes: alertes(analyse),
    nonMesurable: [...etapes, ...analyse.nonMesurable],
  };
  return { resultat, racineSite };
};
