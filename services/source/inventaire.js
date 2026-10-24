/**
 * Étape 2 : inventorier les pages et les ressources du site.
 *
 * Chaque fichier .html est lu avec cheerio (positions dans le source conservées),
 * puis chaque chemin est résolu sur le disque depuis la page qui le cite.
 * Le dépôt est lu sous macOS comme sous Linux : la casse est vérifiée à la main,
 * comme le ferait GitHub Pages.
 */
import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";

const IGNORES = new Set([".git", "node_modules"]);
// Fichiers de travail : jamais des ressources orphelines
const FICHIERS_DE_TRAVAIL = /^(readme|notes|license|licence)(\.md|\.txt)?$|^\.|\.md$/i;

/** Tous les fichiers sous la racine, en chemins relatifs avec « / » */
const listerFichiers = (racine, dossier = "") =>
  fs.readdirSync(path.join(racine, dossier), { withFileTypes: true }).flatMap((e) => {
    if (IGNORES.has(e.name)) return [];
    const relatif = dossier ? `${dossier}/${e.name}` : e.name;
    return e.isDirectory() ? listerFichiers(racine, relatif) : [relatif];
  });

/** Un chemin qui ne désigne pas un fichier du site */
const estExterne = (valeur) =>
  !valeur || /^(https?:|\/\/|mailto:|tel:|data:|javascript:|#)/i.test(valeur.trim());

const nettoyer = (valeur) => {
  const sansAncre = valeur.trim().split(/[?#]/)[0];
  try {
    return decodeURIComponent(sansAncre);
  } catch {
    return sansAncre;
  }
};

/**
 * Résout un chemin cité par un fichier ; vérifie la casse segment par segment
 * @returns {{ chemin: string, existe: boolean, cause?: "absent" | "casse" }}
 */
const resoudre = (racine, fichierSource, valeur, fichiersMinuscules) => {
  const chemin = path.posix.normalize(path.posix.join(path.posix.dirname(fichierSource), nettoyer(valeur)));
  if (chemin.startsWith("..")) return { chemin, existe: false, cause: "absent" };
  const cible = chemin.endsWith("/") || chemin === "." ? `${chemin.replace(/\/?$/, "/")}index.html`.replace(/^\.\//, "") : chemin;
  if (fichiersMinuscules.exact.has(cible)) return { chemin: cible, existe: true };
  if (fichiersMinuscules.parMinuscules.has(cible.toLowerCase())) return { chemin: cible, existe: false, cause: "casse" };
  return { chemin: cible, existe: false, cause: "absent" };
};

/** Position et extrait (la balise ouvrante) d'un élément */
const position = (html, element) => {
  const loc = element.sourceCodeLocation;
  if (!loc) return { ligne: null, colonne: null, extrait: "" };
  const debut = loc.startTag ?? loc;
  return {
    ligne: debut.startLine,
    colonne: debut.startCol,
    extrait: html.slice(debut.startOffset, debut.endOffset),
  };
};

/** Les url() et @import d'une feuille, pour repérer les fichiers qu'elle cite */
const referencesCss = (contenu) => [
  ...[...contenu.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)].map((m) => m[2]),
  ...[...contenu.matchAll(/@import\s+(['"])([^'"]+)\1/g)].map((m) => m[2]),
];

/**
 * @param {string} racine - Racine du site sur le disque
 * @returns {object} - { racine, fichiers, pages, introuvables, cheminsRacine, orphelins }
 */
export const inventorier = (racine) => {
  const fichiers = listerFichiers(racine).sort();
  const index = {
    exact: new Set(fichiers),
    parMinuscules: new Set(fichiers.map((f) => f.toLowerCase())),
  };
  const cites = new Set();
  const introuvables = [];
  const cheminsRacine = [];

  /** Enregistre un chemin cité ; renvoie sa résolution, ou null s'il est externe */
  const citer = (fichierSource, valeur, pos) => {
    if (estExterne(valeur)) return null;
    if (valeur.trim().startsWith("/")) {
      cheminsRacine.push({ page: fichierSource, chemin: valeur.trim(), ...pos });
      return null;
    }
    const r = resoudre(racine, fichierSource, valeur, index);
    if (r.existe) cites.add(r.chemin);
    else introuvables.push({ page: fichierSource, chemin: r.chemin, cause: r.cause, ...pos });
    return r;
  };

  const pages = fichiers
    .filter((f) => /\.html?$/i.test(f))
    .map((fichier) => {
      const html = fs.readFileSync(path.join(racine, fichier), "utf-8");
      const $ = cheerio.load(html, { sourceCodeLocationInfo: true });
      const pos = (el) => position(html, el);

      const feuilles = $('link[rel~="stylesheet"][href]')
        .toArray()
        .map((el) => citer(fichier, $(el).attr("href"), pos(el)))
        .filter((r) => r?.existe)
        .map((r) => r.chemin);

      const policesPrechargees = $('link[rel~="preload"][as="font"][href]')
        .toArray()
        .map((el) => citer(fichier, $(el).attr("href"), pos(el)))
        .filter((r) => r?.existe)
        .map((r) => r.chemin);

      // Autres liens d'en-tête (icônes, manifeste) : seulement pour les chemins cassés
      $('link[href]:not([rel~="stylesheet"]):not([rel~="preload"])').each((_, el) => {
        citer(fichier, $(el).attr("href"), pos(el));
      });

      const scripts = $("script")
        .toArray()
        .map((el) => {
          const src = $(el).attr("src");
          const r = src ? citer(fichier, src, pos(el)) : null;
          return { chemin: r?.existe ? r.chemin : null, src: src ?? null, enLigne: src ? null : $(el).text(), ...pos(el) };
        });

      const images = $("img")
        .toArray()
        .map((el) => {
          const $el = $(el);
          const src = $el.attr("src") ?? "";
          const r = citer(fichier, src, pos(el));
          const entier = (v) => (/^\d+$/.test(v ?? "") ? Number(v) : null);
          // srcset : chaque candidat est une ressource citée
          ($el.attr("srcset") ?? "").split(",").forEach((c) => {
            const url = c.trim().split(/\s+/)[0];
            if (url) citer(fichier, url, pos(el));
          });
          return {
            src,
            chemin: r?.existe ? r.chemin : null,
            alt: $el.attr("alt") ?? null,
            largeur: entier($el.attr("width")),
            hauteur: entier($el.attr("height")),
            loading: $el.attr("loading") ?? null,
            ...pos(el),
          };
        });

      // Sources des balises <picture>, <video>, <audio>, <source>, <track>
      $("source[src], source[srcset], video[src], video[poster], audio[src], track[src]").each((_, el) => {
        const $el = $(el);
        for (const attribut of ["src", "poster"]) if ($el.attr(attribut)) citer(fichier, $el.attr(attribut), pos(el));
        ($el.attr("srcset") ?? "").split(",").forEach((c) => {
          const url = c.trim().split(/\s+/)[0];
          if (url) citer(fichier, url, pos(el));
        });
      });

      const liens = $("a[href]")
        .toArray()
        .map((el) => ({ href: $(el).attr("href"), resolution: citer(fichier, $(el).attr("href"), pos(el)), ...pos(el) }))
        .filter((l) => l.resolution)
        .map(({ href, resolution, ...reste }) => ({ href, chemin: resolution.chemin, existe: resolution.existe, ...reste }));

      const stylesEnLigne = $("style")
        .toArray()
        .map((el, i) => ({ source: `${fichier}#style-${i + 1}`, contenu: $(el).text(), ligne: pos(el).ligne }));

      return {
        fichier,
        html,
        feuilles,
        stylesEnLigne,
        attributsStyle: $("[style]").length,
        scripts,
        images,
        policesPrechargees,
        liens,
      };
    });

  // Les feuilles citées citent à leur tour polices, images et autres feuilles
  const aLire = [...cites].filter((f) => f.endsWith(".css"));
  const lues = new Set();
  while (aLire.length) {
    const feuille = aLire.pop();
    if (lues.has(feuille)) continue;
    lues.add(feuille);
    const contenu = fs.readFileSync(path.join(racine, feuille), "utf-8");
    for (const ref of referencesCss(contenu)) {
      const r = citer(feuille, ref, { ligne: null, colonne: null, extrait: ref });
      if (r?.existe && r.chemin.endsWith(".css")) aLire.push(r.chemin);
    }
  }

  const orphelins = fichiers.filter(
    (f) => !cites.has(f) && !/\.html?$/i.test(f) && !FICHIERS_DE_TRAVAIL.test(path.posix.basename(f))
  );

  return { racine, fichiers, pages, introuvables, cheminsRacine, orphelins };
};
