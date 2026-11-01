/**
 * Les fonctions exécutées dans la page parcourue (onglet.evaluate, evaluateOnNewDocument).
 * Puppeteer les envoie au navigateur par leur texte : chacune se suffit à elle-même, sans rien
 * importer ni appeler hors d'elle. Utilisées par le parcours du site (parcours.js).
 */

/** Exécuté dans la page : ce qu'il faut pour le référencement, les liens et le texte (mentions légales) */
export function lirePage() {
  const meta = (nom) => document.querySelector(`meta[name="${nom}"], meta[property="${nom}"]`)?.getAttribute("content")?.trim() || null;
  return {
    titre: document.title.trim() || null,
    description: meta("description"),
    lang: document.documentElement.getAttribute("lang") || null,
    h1: document.querySelectorAll("h1").length,
    canonical: document.querySelector('link[rel="canonical"]')?.href ?? null,
    ogTitre: meta("og:title"),
    ogImage: meta("og:image"),
    dom: document.getElementsByTagName("*").length,
    // Ce que le site en ligne dit de l'outil qui l'a produit (TE2, TE3)
    generateur: meta("generator"),
    wordpress: document.documentElement.innerHTML.includes("/wp-content/"),
    pageBuilder: Boolean(document.querySelector('[class*="elementor"], [class*="et_pb_"], [class*="fusion-builder"], [class*="vc_row"]')),
    liens: [...document.querySelectorAll("a[href]")].map((a) => ({ href: a.href, texte: (a.innerText || a.getAttribute("aria-label") || "").trim().slice(0, 80) })),
    texte: document.body?.innerText.slice(0, 30000) ?? "",
  };
}

/** Exécuté dans la page : les polices déclarées (@font-face), préchargées, et la pile du texte courant */
export function lirePolices() {
  return {
    declarees: [...document.fonts]
      .filter((f) => f.status !== "unloaded")
      .map((f) => ({ famille: f.family.replace(/^["']|["']$/g, ""), graisse: f.weight, style: f.style, display: f.display, statut: f.status })),
    prechargees: [...document.querySelectorAll('link[rel~="preload"][as="font"][href]')].map((l) => l.href),
    pile: getComputedStyle(document.body).fontFamily,
  };
}

/** Exécuté dans la page : les tailles de texte affichées (G8), sur les éléments qui portent du texte visible */
export function lireTailles() {
  const tailles = new Map();
  for (const el of document.body.querySelectorAll("*")) {
    const texte = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!texte || !el.getClientRects().length || getComputedStyle(el).visibility === "hidden") continue;
    const taille = Math.round(parseFloat(getComputedStyle(el).fontSize) * 2) / 2;
    if (!tailles.has(taille)) tailles.set(taille, el.outerHTML.slice(0, el.outerHTML.indexOf(">") + 1));
  }
  return [...tailles].sort((a, b) => a[0] - b[0]).map(([px, extrait]) => ({ px, extrait }));
}

/** Exécuté dans la page : la longueur des lignes des paragraphes (G9), en caractères « 0 » de leur police */
export function lireLignes(minCaracteres) {
  const contexte = document.createElement("canvas").getContext("2d");
  return [...document.querySelectorAll("p, li, dd, blockquote")]
    .filter((el) => el.innerText.trim().length >= minCaracteres && el.getClientRects().length)
    .map((el) => {
      const style = getComputedStyle(el);
      contexte.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const ch = contexte.measureText("0").width || parseFloat(style.fontSize) / 2;
      const largeur = el.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      return { ch: Math.round(largeur / ch), extrait: el.outerHTML.slice(0, el.outerHTML.indexOf(">") + 1) };
    })
    .sort((a, b) => b.ch - a.ch)
    .slice(0, 5);
}

/** Exécuté dans la page : l'apparence des commandes au repos, pour la comparer une fois atteintes au clavier (A10) */
export function memoriserRepos() {
  const PROPRIETES = ["outlineStyle", "outlineWidth", "outlineColor", "boxShadow", "backgroundColor", "borderTopColor", "borderBottomColor", "color", "textDecorationLine", "transform"];
  window.__webscopeProprietes = PROPRIETES;
  window.__webscopeRepos = new Map();
  for (const el of document.querySelectorAll("a[href], button, input, select, textarea, summary, [tabindex]")) {
    const style = getComputedStyle(el);
    window.__webscopeRepos.set(el, Object.fromEntries(PROPRIETES.map((p) => [p, style[p]])));
  }
}

/** Exécuté dans la page : l'élément atteint au clavier change-t-il d'apparence ? null : rien n'a le focus */
export function lireFocus() {
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return null;
  const style = getComputedStyle(el);
  const repos = window.__webscopeRepos.get(el);
  const contour = style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0 && !/rgba\(.*,\s*0\)$|transparent/.test(style.outlineColor);
  const change = repos ? window.__webscopeProprietes.some((p) => p !== "outlineStyle" && p !== "outlineWidth" && p !== "outlineColor" && style[p] !== repos[p]) : false;
  return { extrait: el.outerHTML.slice(0, el.outerHTML.indexOf(">") + 1).slice(0, 200), visible: contour || change };
}

/**
 * Injecté avant les scripts de la page : garde la trace des IntersectionObserver et de ce qu'ils
 * observent, sans rien changer à leur comportement (les mesures au chargement restent celles d'un visiteur)
 */
export function suivreObservateurs() {
  const Natif = window.IntersectionObserver;
  if (!Natif) return;
  const observateurs = [];
  window.__webscopeObservateurs = observateurs;
  window.IntersectionObserver = class extends Natif {
    constructor(rappel, options) {
      super(rappel, options);
      this.__rappel = rappel;
      this.__cibles = new Set();
      observateurs.push(this);
    }
    observe(cible) {
      this.__cibles.add(cible);
      return super.observe(cible);
    }
    unobserve(cible) {
      this.__cibles.delete(cible);
      return super.unobserve(cible);
    }
    disconnect() {
      this.__cibles.clear();
      return super.disconnect();
    }
  };
}

/**
 * Exécuté dans la page, sans la faire défiler (un défilement peut déclencher un écran, un verrou…) :
 * chaque observateur apprend que ses cibles sont visibles, comme si le visiteur avait tout parcouru ;
 * les images chargées à l'approche sont chargées. Rend le nombre de cibles révélées.
 */
export async function revelerPage({ imagesMs }) {
  let revelees = 0;
  for (const observateur of window.__webscopeObservateurs ?? []) {
    const cibles = [...observateur.__cibles];
    if (!cibles.length) continue;
    const entrees = cibles.map((target) => {
      const rect = target.getBoundingClientRect();
      return { target, isIntersecting: true, intersectionRatio: 1, boundingClientRect: rect, intersectionRect: rect, rootBounds: null, time: performance.now() };
    });
    try {
      observateur.__rappel(entrees, observateur);
      revelees += cibles.length;
    } catch {
      // Le script de la page n'attendait pas ce rappel : la page reste telle quelle
    }
  }
  const images = [...document.images].filter((img) => img.loading === "lazy" || !img.complete);
  for (const img of images) img.loading = "eager";
  await Promise.race([
    Promise.all(images.map((img) => (img.complete ? null : new Promise((r) => img.addEventListener("load", r, { once: true }) || img.addEventListener("error", r, { once: true }))))),
    new Promise((r) => setTimeout(r, imagesMs)),
  ]);
  return revelees;
}

/**
 * Exécuté dans la page : un fond fixe qui couvre l'écran (ciel étoilé, dégradé) suit le visiteur
 * sur toute la page ; dans une capture d'un seul tenant, il ne couvrirait que le premier écran.
 * Il est étiré sur toute la hauteur. Seulement un fond : derrière le contenu ou sans clic
 * (un écran d'avertissement ou une modale visible reste tel quel). Rend le nombre de fonds étirés.
 */
export function etirerFondsFixes() {
  const hauteur = document.documentElement.scrollHeight;
  let etires = 0;
  for (const el of document.querySelectorAll("body *")) {
    const c = getComputedStyle(el);
    if (c.position !== "fixed" || c.visibility === "hidden" || Number(c.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    const couvre = r.width >= window.innerWidth * 0.9 && r.height >= window.innerHeight * 0.9;
    const fond = c.zIndex === "auto" || Number(c.zIndex) <= 0 || c.pointerEvents === "none";
    if (!couvre || !fond) continue;
    // Le style d'origine, rétabli après la photo (restaurerFondsFixes)
    el.dataset.webscopeStyle = el.getAttribute("style") ?? "";
    el.style.setProperty("position", "absolute", "important");
    el.style.setProperty("top", "0", "important");
    el.style.setProperty("bottom", "auto", "important");
    el.style.setProperty("height", `${hauteur}px`, "important");
    etires++;
  }
  return etires;
}

/** Exécuté dans la page : les fonds étirés reprennent leur style d'origine */
export function restaurerFondsFixes() {
  for (const el of document.querySelectorAll("[data-webscope-style]")) {
    const origine = el.dataset.webscopeStyle;
    if (origine) el.setAttribute("style", origine);
    else el.removeAttribute("style");
    delete el.dataset.webscopeStyle;
  }
}
