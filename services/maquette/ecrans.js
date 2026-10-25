/**
 * Les écrans de la maquette Figma, et leur association aux pages du site.
 *
 * Un écran : un cadre de premier niveau (ou rangé dans une section) d'une page de maquette,
 * de largeur mobile. Les pages « guide de style » donnent leurs couleurs à la palette ;
 * les pages moodboard, brouillons… sont ignorées.
 */
import thresholds from "../../config/thresholds.js";

const M = thresholds.sae105.graphique.maquette;

const hex = ({ r, g, b }) => `#${[r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")}`;

/** Couleur pleine visible d'un calque ; null pour une image, un dégradé ou rien */
const couleurPleine = (noeud) => {
  const peinture = (noeud.fills ?? []).filter((f) => f.visible !== false).at(-1);
  return peinture?.type === "SOLID" ? hex(peinture.color) : null;
};

const visible = (noeud) => noeud.visible !== false && (noeud.opacity ?? 1) > 0;

/** Parcourt les calques visibles d'un sous-arbre */
const parcourir = (noeud, rappel) => {
  if (!visible(noeud)) return;
  rappel(noeud);
  for (const enfant of noeud.children ?? []) parcourir(enfant, rappel);
};

const role = (nom) => (M.pagesGuide.test(nom) ? "guide" : M.pagesIgnorees.test(nom) ? "ignoree" : "maquette");

/** Les cadres d'une page, en descendant dans les sections */
const cadres = (page) =>
  (page.children ?? []).flatMap((n) => (n.type === "SECTION" ? cadres(n) : ["FRAME", "COMPONENT"].includes(n.type) && visible(n) ? [n] : []));

/**
 * @param {object} fichier - Réponse de l'API Figma (GET /files/:cle)
 * @returns {{ ecrans: Array<object>, palette: string[] }}
 */
export const extraireEcrans = (fichier) => {
  const ecrans = [];
  const palette = new Set();
  for (const page of fichier.document.children ?? []) {
    const r = role(page.name);
    if (r === "ignoree") continue;
    for (const cadre of cadres(page)) {
      parcourir(cadre, (n) => {
        const c = couleurPleine(n);
        if (c) palette.add(c);
      });
      const boite = cadre.absoluteBoundingBox;
      if (r !== "maquette" || !boite || boite.width > M.largeurEcranMaxPx) continue;
      const textes = [];
      parcourir(cadre, (n) => {
        if (n.type !== "TEXT" || !n.characters?.trim()) return;
        textes.push({
          texte: n.characters,
          police: n.style?.fontFamily ?? null,
          taille: n.style?.fontSize ?? null,
          graisse: n.style?.fontWeight ?? null,
          couleur: couleurPleine(n),
          y: Math.round(n.absoluteBoundingBox.y - boite.y),
        });
      });
      textes.sort((a, b) => a.y - b.y);
      ecrans.push({ id: cadre.id, nom: cadre.name, largeur: Math.round(boite.width), hauteur: Math.round(boite.height), textes });
    }
  }
  return { ecrans, palette: [...palette] };
};

// Mots qui ne désignent pas la page : appareil, langue, mots de liaison
const IGNORES = new Set(["mobile", "desktop", "tablette", "tablet", "smartphone", "iphone", "android", "fr", "en", "page", "de", "d", "du", "la", "le", "les", "l", "ecran", "screen", "version", "maquette", "final", "finale"]);
const ACCUEIL = new Set(["home", "homepage", "accueil", "index", "landing"]);
const LISTE = new Set(["list", "liste", "all", "archive", "tous", "toutes"]);
const FICHE = new Set(["single", "detail", "fiche", "item"]);

const mots = (texte) =>
  texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((m) => m && !IGNORES.has(m) && !/^v?\d+$/.test(m));

const compact = (texte) => mots(texte).join("");

/** Noms de fichier possibles pour un écran, du plus probable au moins probable */
const candidats = (nom) => {
  const tous = mots(nom);
  if (tous.some((m) => ACCUEIL.has(m))) return ["index"];
  const base = tous.filter((m) => !LISTE.has(m) && !FICHE.has(m)).join("");
  if (!base) return [];
  if (tous.some((m) => LISTE.has(m))) return [`${base}s`, base];
  if (tous.some((m) => FICHE.has(m))) return [base.replace(/s$/, ""), base];
  return [base, `${base}s`, base.replace(/s$/, "")];
};

/**
 * @param {Array<{ nom: string }>} ecrans
 * @param {Array<{ fichier: string, titre: string }>} pages
 * @param {Object<string, string|null>} [forcage] - Nom d'écran → page (null : écran ignoré), du fichier de promo
 * @param {{ analysee: string, autres: string[] } | null} [langues] - Site bilingue : seuls les écrans
 *   de la langue analysée (ou sans langue dans leur nom) sont associés, et seulement aux pages de cette langue
 */
export const apparier = (ecrans, pages, forcage = {}, langues = null) => {
  const prises = new Set();
  const paires = [];
  const ecransSansPage = [];
  if (langues) {
    // « Page d'accueil EN » : l'écran d'une autre langue n'est comparé à rien
    const autreLangue = (nom) => nom.toLowerCase().split(/[^a-z0-9]+/).some((m) => langues.autres.includes(m));
    ecrans = ecrans.filter((e) => Object.hasOwn(forcage, e.nom) || !autreLangue(e.nom));
    pages = pages.filter((p) => p.fichier.startsWith(`${langues.analysee}/`));
  }
  for (const ecran of ecrans) {
    let fichier;
    if (Object.hasOwn(forcage, ecran.nom)) {
      fichier = forcage[ecran.nom];
      if (fichier === null) continue;
    } else {
      const libres = pages.filter((p) => !prises.has(p.fichier));
      const parNom = (c) => libres.find((p) => compact(p.fichier.replace(/\.html?$/i, "").split("/").pop()) === c);
      fichier = candidats(ecran.nom).map(parNom).find(Boolean)?.fichier;
      // Sinon, une page dont le titre contient tous les mots de l'écran
      fichier ??= mots(ecran.nom).length ? libres.find((p) => mots(ecran.nom).every((m) => mots(p.titre ?? "").includes(m)))?.fichier : undefined;
    }
    if (fichier && pages.some((p) => p.fichier === fichier) && !prises.has(fichier)) {
      prises.add(fichier);
      paires.push({ ecran, fichier });
    } else {
      ecransSansPage.push(ecran.nom);
    }
  }
  return { paires, ecransSansPage, pagesSansEcran: pages.map((p) => p.fichier).filter((f) => !prises.has(f)) };
};
