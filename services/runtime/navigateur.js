/**
 * Étape 5 : les contrôles en navigateur, sur le dépôt servi en local sous /<nom-du-dépôt>/.
 *
 * Une seule instance de Chrome, partagée par Lighthouse et Puppeteer, pour toutes les pages.
 * Mesures à 360 px : Lighthouse (quatre catégories, contraste), débordement horizontal,
 * cibles tactiles des commandes (boutons, liens sans texte), requêtes en échec ; puis débordement à 180 px (zoom 200 %).
 * Pour une page associée à un écran de la maquette : relevé des textes et capture à la largeur de l'écran (G11).
 */
import puppeteer from "puppeteer-core";
import thresholds from "../../config/thresholds.js";
import { obtenirChrome, auditerPage, fermerChrome } from "../html/lighthouseService.js";
import { servir } from "./serveurLocal.js";

const { ergonomie, accessibilite, graphique } = thresholds.sae105;
const DELAI_PAGE = thresholds.performance.timeouts.default;

/** Exécuté dans la page : les éléments qui dépassent à droite du viewport */
function mesurerDebordement() {
  const largeur = document.documentElement.clientWidth;
  const coupables = [...document.body.querySelectorAll("*")]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.right > largeur + 1 && getComputedStyle(el).position !== "fixed";
    })
    // Le plus extérieur seulement : ses enfants dépassent avec lui
    .filter((el, _, tous) => !tous.includes(el.parentElement))
    .slice(0, 5)
    .map((el) => ({ extrait: el.outerHTML.slice(0, el.outerHTML.indexOf(">") + 1), droite: Math.round(el.getBoundingClientRect().right) }));
  return { largeur: document.documentElement.scrollWidth, viewport: largeur, coupables };
}

/**
 * Exécuté dans la page : les commandes de moins de `minimum` px.
 * Une commande : un bouton, ou un lien sans texte visible (logo, icône).
 * Un lien texte n'est pas compté : sa cible, c'est le texte qu'on lit.
 */
function mesurerCibles(minimum) {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && style.visibility !== "hidden" && !el.closest("[popover]:not(:popover-open)");
  };
  const commande = (el) => el.tagName === "BUTTON" || el.innerText.replace(/\s+/g, "").length === 0;
  return [...document.querySelectorAll("a[href], button")]
    .filter((el) => visible(el) && commande(el))
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { extrait: el.outerHTML.slice(0, el.outerHTML.indexOf(">") + 1), largeur: Math.round(r.width), hauteur: Math.round(r.height) };
    })
    .filter((c) => c.largeur < minimum || c.hauteur < minimum);
}

/**
 * Exécuté dans la page : chaque élément qui porte du texte, avec son style calculé,
 * et les couleurs employées (texte et fonds). Les éléments masqués (menu fermé) comptent aussi.
 */
function releverMaquette() {
  const hex = (couleur) => {
    const [r, g, b, a = 1] = (couleur.match(/[\d.]+/g) ?? []).map(Number);
    if (r === undefined || a < 0.5) return null;
    return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
  };
  const balise = (el) => el.outerHTML.slice(0, el.outerHTML.indexOf(">") + 1);
  // Le fond derrière un texte : le premier ancêtre qui a une couleur de fond (blanc par défaut)
  const fondDe = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const f = hex(getComputedStyle(n).backgroundColor);
      if (f) return f;
    }
    return "#ffffff";
  };
  const textes = [];
  const couleurs = [];
  for (const el of document.body.querySelectorAll("*:not(script, style, noscript, template, svg *)")) {
    const style = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const affiche = r.width > 0 && r.height > 0 && style.visibility !== "hidden";
    const fond = hex(style.backgroundColor);
    if (affiche && fond) couleurs.push({ couleur: fond, extrait: balise(el) });
    const porteTexte = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
    if (!porteTexte) continue;
    textes.push({
      texte: (affiche ? el.innerText : el.textContent).trim(),
      police: style.fontFamily,
      taille: parseFloat(style.fontSize),
      graisse: Number(style.fontWeight),
      couleur: hex(style.color),
      extrait: balise(el),
      affiche,
      fond: fondDe(el),
    });
    if (affiche && hex(style.color)) couleurs.push({ couleur: hex(style.color), extrait: balise(el) });
  }
  return { textes, couleurs, hauteur: document.documentElement.scrollHeight };
}

/** La page à la largeur d'un écran de la maquette : textes, couleurs et capture pleine page */
const releverALargeur = async (onglet, largeur) => {
  const { qualite, hauteurMaxPx } = graphique.maquette.captures;
  await onglet.setViewport({ width: largeur, height: 800, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const releve = await onglet.evaluate(releverMaquette);
  const capture = await onglet.screenshot({
    type: "webp",
    quality: qualite,
    clip: { x: 0, y: 0, width: largeur, height: Math.min(releve.hauteur, hauteurMaxPx) },
    captureBeyondViewport: true,
  });
  return { textes: releve.textes, couleurs: releve.couleurs, capture: Buffer.from(capture) };
};

/**
 * @param {object} options
 * @param {string} options.racine - Racine du site
 * @param {string} options.nom - Nom du dépôt (préfixe /<nom>/)
 * @param {string[]} options.fichiers - Fichiers du site (casse exacte)
 * @param {string[]} options.pages - Pages à mesurer
 * @param {Map<string, number>} [options.largeursMaquette] - Page → largeur de l'écran Figma associé
 * @returns {Promise<Array<object>>} - Une mesure par page ; une page en échec porte son erreur
 */
export const mesurerNavigateur = async ({ racine, nom, fichiers, pages, largeursMaquette = new Map() }) => {
  const serveur = await servir(racine, nom, fichiers);
  let navigateur = null;
  try {
    const chrome = await obtenirChrome();
    navigateur = await puppeteer.connect({ browserURL: `http://127.0.0.1:${chrome.port}`, defaultViewport: null });
    const mesures = [];
    for (const fichier of pages) {
      const url = new URL(fichier, serveur.url).href;
      try {
        const lighthouse = await auditerPage(url);
        const onglet = await navigateur.newPage();
        const echecs = [];
        onglet.on("response", (r) => {
          if (r.status() >= 400) echecs.push({ url: r.url(), statut: r.status() });
        });
        onglet.on("requestfailed", (r) => echecs.push({ url: r.url(), statut: 0 }));
        await onglet.setViewport({ width: ergonomie.viewportPx, height: 800, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
        await onglet.goto(url, { waitUntil: "networkidle0", timeout: DELAI_PAGE });
        const debordement = await onglet.evaluate(mesurerDebordement);
        const cibles = await onglet.evaluate(mesurerCibles, ergonomie.cibleTactilePx);
        // Zoom 200 % : la même page dans une fenêtre deux fois plus étroite
        await onglet.setViewport({ width: accessibilite.zoomViewportPx, height: 400, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
        const zoom = await onglet.evaluate(mesurerDebordement);
        const maquette = largeursMaquette.has(fichier) ? await releverALargeur(onglet, largeursMaquette.get(fichier)) : undefined;
        await onglet.close();
        mesures.push({ fichier, lighthouse, debordement, zoom, cibles, echecs: [...lighthouse.echecs, ...echecs], maquette });
      } catch (error) {
        mesures.push({ fichier, erreur: error.message.split("\n")[0] });
      }
    }
    return mesures;
  } finally {
    await navigateur?.disconnect();
    await fermerChrome();
    await serveur.fermer();
  }
};
