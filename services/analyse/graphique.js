/**
 * Axe Graphique : le système, pas le rendu (G1 à G10)
 */
import { parse as lireCouleur } from "culori";
import thresholds from "../../config/thresholds.js";
import { occurrenceDeclaration } from "../css/sources.js";
import { dansRoot, dansFontFace } from "./contexte.js";
import { respecte, nonRespecte, partiel, aJuger, parRatio } from "./mesure.js";

const S = thresholds.sae105.graphique;

const MOTS_NEUTRES = new Set(["transparent", "currentcolor", "inherit", "initial", "unset", "revert", "none"]);
const PROPRIETES_COULEUR =
  /^(color|background(-color)?|border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-color)?|outline(-color)?|fill|stroke|box-shadow|text-shadow|text-decoration(-color)?|caret-color|accent-color|column-rule(-color)?)$/;

/** Les couleurs écrites en dur dans une valeur (hex, fonctions, noms) */
export const couleursLitterales = (valeur) => {
  const sansVar = valeur.replace(/var\([^()]*\)/g, " ");
  const candidates = sansVar.match(/#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^)]*\)|\b[a-zA-Z]+\b/g) ?? [];
  return candidates.filter((c) => !MOTS_NEUTRES.has(c.toLowerCase()) && lireCouleur(c) !== undefined);
};

/** Rôle d'une variable de couleur, d'après son nom */
export const roleVariable = (nom) => {
  const mots = nom.replace(/^--/, "").toLowerCase().split(/[-_]/);
  for (const [role, cles] of Object.entries(S.roles)) if (mots.some((m) => cles.includes(m))) return role;
  return "autre";
};

/** Variables de :root dont la valeur est une couleur */
export const variablesCouleur = (ctx) =>
  [...ctx.variables.entries()]
    .filter(([, { valeur }]) => couleursLitterales(valeur).length > 0 || (valeur.includes("var(") && couleursLitterales(ctx.resoudre(valeur)).length > 0))
    .map(([nom, { valeur, decl }]) => ({ nom, valeur, decl, role: roleVariable(nom) }));

const PROPRIETES_ESPACEMENT = /^(margin|padding)(-(top|right|bottom|left|block|inline)(-(start|end))?)?$|^(gap|row-gap|column-gap)$/;
const MOT_LIBRE = /^(0|auto|inherit|initial|unset|none|-?0(\.0+)?[a-z%]*)$/i;

/** Taille en pixels d'une valeur de police (rem et px seulement, sinon null) */
export const enPixels = (valeur) => {
  const m = valeur.trim().match(/^(-?\d*\.?\d+)(rem|px|em)$/);
  if (!m) return null;
  return m[2] === "px" ? Number(m[1]) : Number(m[1]) * 16;
};

export default {
  G1: (ctx) => {
    const couleurs = variablesCouleur(ctx);
    const avecRole = couleurs.filter((c) => c.role !== "autre");
    const roles = new Set(avecRole.map((c) => c.role));
    const sansRole = couleurs.filter((c) => c.role === "autre").map((c) => occurrenceDeclaration(c.decl, ctx.css, c.nom));
    const detailValeur = `${avecRole.length} variables de rôle${roles.size ? ` (${[...roles].join(", ")})` : ""}`;
    if (avecRole.length >= S.variablesRolesMin && roles.has("surface") && roles.has("texte")) {
      return { ...respecte(avecRole.length, { detailValeur }), occurrences: sansRole };
    }
    return avecRole.length > 0
      ? partiel(avecRole.length, sansRole, { detailValeur })
      : nonRespecte(0, sansRole, { detailValeur });
  },

  G2: (ctx) => {
    const decls = ctx.declarations(
      (d) => PROPRIETES_COULEUR.test(d.prop) && !dansRoot(d) && !dansFontFace(d) && (d.value.includes("var(") || couleursLitterales(d.value).length > 0)
    );
    const enDur = decls.filter((d) => couleursLitterales(d.value).length > 0);
    return parRatio(
      decls.length - enDur.length,
      decls.length,
      S.couleursViaVar,
      enDur.map((d) => occurrenceDeclaration(d, ctx.css, couleursLitterales(d.value)[0]))
    );
  },

  G3: (ctx) => {
    const decls = ctx.declarations((d) => PROPRIETES_ESPACEMENT.test(d.prop) && !dansRoot(d));
    // Une déclaration ne compte que si elle porte une vraie longueur (0 et auto exclus)
    const mesurees = decls.filter((d) => !d.value.split(/\s+/).every((m) => MOT_LIBRE.test(m)));
    const enDur = mesurees.filter((d) => !d.value.includes("var("));
    return parRatio(
      mesurees.length - enDur.length,
      mesurees.length,
      S.espacementsViaVar,
      enDur.map((d) => occurrenceDeclaration(d, ctx.css))
    );
  },

  G4: (ctx) => {
    const woff2 = ctx.inventaire.fichiers.filter((f) => f.endsWith(".woff2"));
    const fontFaces = [];
    ctx.css.arbre.walkAtRules("font-face", (r) => fontFaces.push(r));
    const swap = fontFaces.length > 0 && fontFaces.every((r) => r.some((d) => d.prop === "font-display" && d.value === "swap"));
    const generiques = new RegExp(`(^|,)\\s*(${S.famillesGeneriques.join("|")})\\s*(,|$)`);
    const piles = ctx.declarations(
      (d) => !dansFontFace(d) && (d.prop === "font-family" || (d.prop.startsWith("--") && /["']/.test(d.value) && /font|police|famille/i.test(d.prop)))
    );
    const secours = piles.length > 0 && piles.some((d) => generiques.test(ctx.resoudre(d.value)));
    const reussis = [woff2.length > 0, swap, secours];
    const detailValeur = `woff2 ${reussis[0] ? "✓" : "✕"} · swap ${reussis[1] ? "✓" : "✕"} · pile de secours ${reussis[2] ? "✓" : "✕"}`;
    const occurrences = fontFaces
      .filter((r) => !r.some((d) => d.prop === "font-display" && d.value === "swap"))
      .map((r) => ({ ...ctx.css.fichierDe(r), extrait: "@font-face { … } sans font-display: swap", surligne: null }));
    const total = reussis.filter(Boolean).length;
    if (total === 3) return respecte(null, { detailValeur });
    return total === 0 ? nonRespecte(null, occurrences, { detailValeur }) : partiel(null, occurrences, { detailValeur });
  },

  G5: (ctx) => {
    const polices = ctx.inventaire.fichiers.filter((f) => /\.(woff2?|ttf|otf)$/i.test(f));
    const occurrences = polices.map((f) => ({ fichier: f, ligne: null, colonne: null, extrait: f, surligne: null }));
    return polices.length <= S.policesMax ? respecte(polices.length) : nonRespecte(polices.length, occurrences);
  },

  G6: (ctx) => {
    const polices = ctx.inventaire.fichiers.filter((f) => /\.(woff2?|ttf|otf)$/i.test(f));
    if (polices.length === 0) return respecte(null, { detailValeur: "aucune police auto-hébergée" });
    const prechargees = new Set(ctx.pages.flatMap((p) => p.policesPrechargees));
    return prechargees.size > 0
      ? respecte(null, { detailValeur: `${prechargees.size} police${prechargees.size > 1 ? "s" : ""} préchargée${prechargees.size > 1 ? "s" : ""}` })
      : nonRespecte(null, [], { detailValeur: "aucun preload" });
  },

  G7: (ctx) => {
    const tailles = ctx.declarations((d) => d.prop === "font-size" && !dansFontFace(d));
    const tailleOk = (d) => /rem\b|var\(|^(inherit|initial|unset|smaller|larger)$/.test(d.value) && !/\d(px|pt)\b/.test(ctx.resoudre(d.value));
    const interlignes = ctx.declarations((d) => d.prop === "line-height");
    const interligneOk = (d) => /^(normal|inherit|initial|unset)$/.test(d.value) || /^-?\d*\.?\d+$/.test(ctx.resoudre(d.value).trim());
    const ko = [...tailles.filter((d) => !tailleOk(d)), ...interlignes.filter((d) => !interligneOk(d))];
    const ratioTailles = tailles.length ? tailles.filter(tailleOk).length / tailles.length : 1;
    const ratioInterlignes = interlignes.length ? interlignes.filter(interligneOk).length / interlignes.length : 1;
    const occurrences = ko.map((d) => occurrenceDeclaration(d, ctx.css));
    const valeur = Math.round(Math.min(ratioTailles, ratioInterlignes) * 1000) / 10;
    const detailValeur = `${Math.round(ratioTailles * 100)} % en rem · ${Math.round(ratioInterlignes * 100)} % sans unité`;
    const okTailles = ratioTailles >= S.remRatio;
    const okInterlignes = ratioInterlignes >= S.lineHeightSansUnite;
    if (okTailles && okInterlignes) return { ...respecte(valeur, { detailValeur }), occurrences };
    return okTailles || okInterlignes ? partiel(valeur, occurrences, { detailValeur }) : nonRespecte(valeur, occurrences, { detailValeur });
  },

  G8: (ctx) => {
    const distinctes = new Set(
      ctx
        .declarations((d) => d.prop === "font-size" && !dansFontFace(d))
        .map((d) => ctx.resoudre(d.value).replace(/\s+/g, ""))
    );
    return distinctes.size <= S.taillesDistinctesMax ? respecte(distinctes.size) : nonRespecte(distinctes.size, [], { detailValeur: [...distinctes].join(", ") });
  },

  G9: (ctx) => {
    const bornes = ctx.declarations((d) => /^max-(width|inline-size)$/.test(d.prop) && /\dch\b/.test(ctx.resoudre(d.value)));
    return bornes.length > 0
      ? respecte(null, { detailValeur: `max-width: ${ctx.resoudre(bornes[0].value)}` })
      : nonRespecte(null, [], { detailValeur: "aucune max-width en ch" });
  },

  G10: () => aJuger(),
};
