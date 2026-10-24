/**
 * Étape 5 : les contrôles en navigateur, sur le dépôt servi en local sous /<nom-du-dépôt>/.
 *
 * Une seule instance de Chrome, partagée par Lighthouse et Puppeteer, pour toutes les pages.
 * Mesures à 360 px : Lighthouse (quatre catégories, contraste), débordement horizontal,
 * cibles tactiles, requêtes en échec ; puis débordement à 180 px (zoom 200 %).
 */
import puppeteer from "puppeteer-core";
import thresholds from "../../config/thresholds.js";
import { obtenirChrome, auditerPage, fermerChrome } from "../html/lighthouseService.js";
import { servir } from "./serveurLocal.js";

const { ergonomie, accessibilite } = thresholds.sae105;
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

/** Exécuté dans la page : liens et boutons isolés de moins de `minimum` px */
function mesurerCibles(minimum) {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && style.visibility !== "hidden" && !el.closest("[popover]:not(:popover-open)");
  };
  // Un lien dans une phrase n'est pas une cible isolée (exception de WCAG 2.5.8)
  const dansLeTexte = (el) => {
    const parent = el.parentElement;
    const texteParent = parent?.textContent.replace(/\s+/g, " ").trim() ?? "";
    const texteLien = el.textContent.replace(/\s+/g, " ").trim();
    return getComputedStyle(el).display === "inline" && texteParent.length > texteLien.length + 15;
  };
  return [...document.querySelectorAll("a[href], button")]
    .filter((el) => visible(el) && !dansLeTexte(el))
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { extrait: el.outerHTML.slice(0, el.outerHTML.indexOf(">") + 1), largeur: Math.round(r.width), hauteur: Math.round(r.height) };
    })
    .filter((c) => c.largeur < minimum || c.hauteur < minimum);
}

/**
 * @param {object} options
 * @param {string} options.racine - Racine du site
 * @param {string} options.nom - Nom du dépôt (préfixe /<nom>/)
 * @param {string[]} options.fichiers - Fichiers du site (casse exacte)
 * @param {string[]} options.pages - Pages à mesurer
 * @returns {Promise<Array<object>>} - Une mesure par page ; une page en échec porte son erreur
 */
export const mesurerNavigateur = async ({ racine, nom, fichiers, pages }) => {
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
        await onglet.close();
        mesures.push({ fichier, lighthouse, debordement, zoom, cibles, echecs: [...lighthouse.echecs, ...echecs] });
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
