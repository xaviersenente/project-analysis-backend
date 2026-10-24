/**
 * Étape 3 : le CSS fichier par fichier.
 *
 * Chaque feuille est lue avec postcss.parse(contenu, { from }) : chaque nœud garde
 * son fichier et sa ligne. Les @import sont résolus depuis le disque, à leur place,
 * et les nœuds importés gardent leur fichier d'origine. Les arbres sont fusionnés
 * dans l'ordre de liaison pour les mesures globales.
 */
import fs from "fs";
import path from "path";
import postcss from "postcss";

const urlImport = (params) => params.match(/^\s*(?:url\(\s*)?(['"]?)([^'")\s]+)\1/)?.[2] ?? null;

/**
 * @param {object} inventaire - Résultat de l'étape 2
 * @returns {{ arbre: postcss.Root, feuilles: string[], imports: Array, enLigne: string[], erreurs: Array, fichierDe: Function }}
 */
export const chargerCss = (inventaire) => {
  const { racine } = inventaire;
  const arbre = postcss.root();
  const feuilles = [];
  const imports = [];
  const erreurs = [];
  const enLigne = [];
  // Source d'un nœud → fichier relatif (ou « page.html#style-1 ») et décalage de ligne
  const origines = new Map();

  const lire = (fichier) => {
    if (feuilles.includes(fichier)) return null;
    const absolu = path.join(racine, fichier);
    try {
      const racineFeuille = postcss.parse(fs.readFileSync(absolu, "utf-8"), { from: absolu });
      origines.set(racineFeuille.source.input.file, { fichier, decalage: 0 });
      feuilles.push(fichier);
      // Les @import sont remplacés par la feuille importée, à leur place
      racineFeuille.walkAtRules("import", (regle) => {
        const url = urlImport(regle.params);
        if (!url || /^(https?:)?\/\//.test(url)) return;
        const cible = path.posix.normalize(path.posix.join(path.posix.dirname(fichier), url));
        imports.push({ fichier, ligne: regle.source.start.line, cible });
        const importee = lire(cible);
        if (importee) regle.replaceWith(importee.nodes);
        else regle.remove();
      });
      return racineFeuille;
    } catch (error) {
      erreurs.push({ fichier, raison: error.code === "ENOENT" ? "feuille introuvable" : error.message.split("\n")[0] });
      return null;
    }
  };

  for (const page of inventaire.pages) {
    for (const fichier of page.feuilles) {
      const racineFeuille = lire(fichier);
      if (racineFeuille) arbre.append(racineFeuille.nodes);
    }
    for (const style of page.stylesEnLigne) {
      try {
        const racineStyle = postcss.parse(style.contenu, { from: style.source });
        // Les lignes d'un <style> se comptent depuis la balise, dans la page
        origines.set(racineStyle.source.input.file, { fichier: style.source, decalage: (style.ligne ?? 1) - 1 });
        enLigne.push(style.source);
        arbre.append(racineStyle.nodes);
      } catch (error) {
        erreurs.push({ fichier: style.source, raison: error.message.split("\n")[0] });
      }
    }
  }

  /** Fichier et ligne d'un nœud, dans le dépôt */
  const fichierDe = (noeud) => {
    const origine = origines.get(noeud.source?.input?.file) ?? { fichier: "?", decalage: 0 };
    return {
      fichier: origine.fichier,
      ligne: noeud.source?.start ? noeud.source.start.line + origine.decalage : null,
      colonne: noeud.source?.start?.column ?? null,
    };
  };

  return { arbre, feuilles, imports, enLigne, erreurs, fichierDe };
};

/** Le contexte d'une déclaration : son sélecteur ou sa règle @ */
const contexte = (noeud) =>
  noeud.parent?.type === "rule"
    ? noeud.parent.selector.replace(/\s*\n\s*/g, " ")
    : noeud.parent?.type === "atrule"
      ? `@${noeud.parent.name} ${noeud.parent.params}`
      : "";

/**
 * Occurrence d'une déclaration : « .carte { color: #7b7b7b; } », la partie fautive surlignée
 * @param {postcss.Declaration} decl
 * @param {{ fichierDe: Function }} css
 * @param {string} [fautif] - Partie à surligner (la valeur par défaut)
 */
export const occurrenceDeclaration = (decl, css, fautif = decl.value) => {
  const extrait = `${contexte(decl)} { ${decl.toString()}; }`;
  const debut = extrait.lastIndexOf(fautif);
  return {
    ...css.fichierDe(decl),
    extrait,
    surligne: debut >= 0 ? [debut, debut + fautif.length] : null,
  };
};

/** Occurrence d'une règle ou d'une règle @ : « .menu__lien:focus { … } » */
export const occurrenceRegle = (noeud, css, fautif) => {
  const tete = noeud.type === "rule" ? noeud.selector.replace(/\s*\n\s*/g, " ") : `@${noeud.name} ${noeud.params}`;
  const extrait = `${tete} { … }`;
  const debut = fautif ? extrait.indexOf(fautif) : -1;
  return { ...css.fichierDe(noeud), extrait, surligne: debut >= 0 ? [debut, debut + fautif.length] : null };
};
