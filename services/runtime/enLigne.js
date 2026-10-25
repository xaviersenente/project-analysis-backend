/**
 * Étape 6 : le contrôle léger du site en ligne.
 *
 * Une requête par page de l'inventaire et par ressource citée : le site répond-il, quelles
 * adresses sont en erreur, et pourquoi quand le dépôt l'explique (casse, chemin en « / »,
 * fichier absent du dépôt). Puis, par l'API GitHub, le dernier déploiement GitHub Pages
 * est comparé à la version évaluée. Rien de tout cela n'est noté : l'analyse porte sur le dépôt.
 */
import thresholds from "../../config/thresholds.js";

const DELAI = thresholds.performance.timeouts.http;
const { requetesSimultanees, requetesMax } = thresholds.enLigne;

/** Code HTTP d'une adresse ; 0 si rien ne répond. HEAD d'abord, GET si le serveur le refuse */
const statutDe = async (url) => {
  for (const method of ["HEAD", "GET"]) {
    try {
      const res = await fetch(url, { method, redirect: "follow", signal: AbortSignal.timeout(DELAI) });
      await res.body?.cancel();
      if (method === "HEAD" && [405, 501].includes(res.status)) continue;
      return res.status;
    } catch {
      if (method === "GET") return 0;
    }
  }
  return 0;
};

/** Exécute les tâches avec au plus `n` requêtes en cours */
const enParallele = async (taches, n) => {
  const resultats = new Array(taches.length);
  let suivante = 0;
  const travailleur = async () => {
    while (suivante < taches.length) {
      const i = suivante++;
      resultats[i] = await taches[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, taches.length) }, travailleur));
  return resultats;
};

/** Dernier déploiement GitHub Pages du dépôt ; null si l'API ne le donne pas */
const deploiementPages = async (depot, sha, apiGithub) => {
  if (!depot) return null;
  try {
    const headers = { Accept: "application/vnd.github+json" };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const res = await fetch(`${apiGithub}/repos/${depot}/deployments?environment=github-pages&per_page=1`, { headers, signal: AbortSignal.timeout(DELAI) });
    if (!res.ok) return null;
    const [dernier] = await res.json();
    return dernier ? { sha: dernier.sha, date: dernier.created_at, versionEvaluee: Boolean(sha) && dernier.sha === sha } : null;
  } catch {
    return null;
  }
};

/**
 * @param {object} options
 * @param {string} options.url - Adresse du site en ligne (dossier du site, avec « / » final)
 * @param {object} options.inventaire - Inventaire de l'étape 2
 * @param {string|null} options.depot - « propriétaire/dépôt », pour le déploiement GitHub Pages
 * @param {string|null} options.sha - Version évaluée
 * @param {string} [options.apiGithub]
 */
export const verifierEnLigne = async ({ url, inventaire, depot, sha, apiGithub = "https://api.github.com" }) => {
  const base = url.endsWith("/") ? url : `${url}/`;
  const vide = { url, verifieLe: new Date().toISOString(), pages: { total: 0, enErreur: 0 }, ressources: { total: 0, enErreur: 0, nonVerifiees: 0 }, erreurs: [], deploiement: null };

  const accueil = await statutDe(base);
  if (accueil === 0 || accueil >= 400) {
    return { ...vide, repond: false, raison: accueil ? `L'accueil répond ${accueil}` : "Le site ne répond pas" };
  }

  // Ce qu'on vérifie : chaque page, chaque fichier cité, et les chemins cassés dans le dépôt
  const citations = (filtre) =>
    [...inventaire.introuvables, ...inventaire.cheminsRacine].filter(filtre).map((i) => ({ page: i.page, ligne: i.ligne }));
  const cibles = [
    ...inventaire.pages.map((p) => ({ type: "page", chemin: p.fichier, cause: null })),
    ...inventaire.citees.filter((f) => !/\.html?$/i.test(f)).map((chemin) => ({ type: "ressource", chemin, cause: null })),
    ...[...new Set(inventaire.introuvables.map((i) => `${i.chemin}|${i.cause}`))].map((cle) => {
      const [chemin, cause] = cle.split("|");
      return { type: "ressource", chemin, cause: cause === "casse" ? "casse" : "absent-du-depot" };
    }),
    ...[...new Set(inventaire.cheminsRacine.map((i) => i.chemin))].map((chemin) => ({ type: "ressource", chemin, cause: "chemin-racine" })),
  ];
  const verifiees = cibles.slice(0, requetesMax);
  const statuts = await enParallele(
    verifiees.map((c) => () => statutDe(new URL(c.chemin.startsWith("/") ? c.chemin : encodeURI(c.chemin), base).href)),
    requetesSimultanees
  );

  const erreurs = verifiees
    .map((c, i) => ({ ...c, statut: statuts[i] }))
    .filter((c) => c.statut === 0 || c.statut >= 400)
    .map((c) => ({
      type: c.type,
      chemin: c.chemin,
      url: new URL(c.chemin.startsWith("/") ? c.chemin : encodeURI(c.chemin), base).href,
      statut: c.statut,
      cause: c.cause,
      citePar: c.cause ? citations((i) => i.chemin === c.chemin) : [],
    }));
  const compter = (type) => ({
    total: cibles.filter((c) => c.type === type).length,
    enErreur: erreurs.filter((e) => e.type === type).length,
  });

  return {
    ...vide,
    repond: true,
    pages: compter("page"),
    ressources: { ...compter("ressource"), nonVerifiees: cibles.length - verifiees.length },
    erreurs,
    deploiement: await deploiementPages(depot, sha, apiGithub),
  };
};
