/**
 * Contexte commun aux analyseurs : pages lues (cheerio, positions conservées),
 * CSS fusionné (étape 3), variables de :root, et fabrique d'occurrences.
 */
import * as cheerio from "cheerio";

/** Une règle de :root (ou :root dans un @media) */
export const dansRoot = (noeud) => noeud.parent?.type === "rule" && /(^|,)\s*:root\b/.test(noeud.parent.selector);

/** Une déclaration située dans une règle @font-face */
export const dansFontFace = (noeud) => noeud.parent?.type === "atrule" && noeud.parent.name === "font-face";

export const creerContexte = ({ racine, inventaire, css, promo = {}, git = null }) => {
  const pages = inventaire.pages.map((page) => ({
    ...page,
    $: cheerio.load(page.html, { sourceCodeLocationInfo: true }),
  }));

  /** Occurrence d'un élément HTML : la balise ouvrante, la partie fautive surlignée */
  const occHtml = (page, el, fautif) => {
    const loc = el.sourceCodeLocation?.startTag ?? el.sourceCodeLocation;
    const extrait = loc ? page.html.slice(loc.startOffset, loc.endOffset) : "";
    const debut = fautif ? extrait.indexOf(fautif) : -1;
    return {
      fichier: page.fichier,
      ligne: loc?.startLine ?? null,
      colonne: loc?.startCol ?? null,
      extrait,
      surligne: debut >= 0 ? [debut, debut + fautif.length] : null,
    };
  };

  /** Occurrence à l'échelle d'une page entière (un élément manquant) */
  const occPage = (page, extrait) => ({ fichier: page.fichier, ligne: null, colonne: null, extrait, surligne: null });

  /** Toutes les déclarations CSS, filtrées */
  const declarations = (filtre = () => true) => {
    const liste = [];
    css.arbre.walkDecls((d) => {
      if (filtre(d)) liste.push(d);
    });
    return liste;
  };

  /** Toutes les règles CSS (sélecteurs), filtrées */
  const regles = (filtre = () => true) => {
    const liste = [];
    css.arbre.walkRules((r) => {
      if (filtre(r)) liste.push(r);
    });
    return liste;
  };

  // Variables de :root : nom → valeur (la dernière l'emporte, comme dans la cascade)
  const variables = new Map();
  for (const d of declarations((d) => d.prop.startsWith("--") && dansRoot(d))) variables.set(d.prop, { valeur: d.value, decl: d });

  /** Remplace les var(--x) par leur valeur de :root (et leur valeur de repli) */
  const resoudre = (valeur, profondeur = 0) => {
    if (profondeur > 6 || !valeur.includes("var(")) return valeur;
    const remplacee = valeur.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, (tout, nom, repli) =>
      variables.has(nom) ? variables.get(nom).valeur : (repli ?? tout)
    );
    return resoudre(remplacee, profondeur + 1);
  };

  return { racine, inventaire, css, promo, git, pages, occHtml, occPage, declarations, regles, variables, resoudre };
};
