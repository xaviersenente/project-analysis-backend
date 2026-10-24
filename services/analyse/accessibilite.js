/**
 * Axe Accessibilité (A1 à A16). Contraste, Lighthouse et zoom arrivent avec le lot 2.
 */
import thresholds from "../../config/thresholds.js";
import { occurrenceDeclaration } from "../css/sources.js";
import { respecte, nonRespecte, aJuger, parRatio, parAbsence } from "./mesure.js";

const S = thresholds.sae105.accessibilite;

/** Les contenus attendus : ceux du fichier de promo, sinon ceux de la configuration */
export const contenusAttendus = (ctx) => ctx.promo?.contenusAttendus ?? thresholds.tags.requiredTags;

/** Pages où figure chaque balise attendue */
export const pagesParBalise = (ctx) =>
  contenusAttendus(ctx).map((balise) => ({
    balise,
    pages: ctx.pages.filter((p) => p.$(balise).length > 0).map((p) => p.fichier),
  }));

/** Plan des titres d'une page : les écarts (h1 multiple ou absent, niveau sauté) */
export const ecartsTitres = (ctx, page) => {
  const titres = page.$("h1, h2, h3, h4, h5, h6").toArray();
  const ecarts = [];
  const h1 = titres.filter((t) => t.tagName === "h1");
  if (h1.length !== 1) ecarts.push(h1[1] ? ctx.occHtml(page, h1[1], "<h1") : ctx.occPage(page, "aucun h1"));
  let precedent = 0;
  for (const t of titres) {
    const niveau = Number(t.tagName[1]);
    if (precedent && niveau > precedent + 1) ecarts.push(ctx.occHtml(page, t, `<${t.tagName}`));
    precedent = niveau;
  }
  return ecarts;
};

/** Un champ de formulaire a-t-il une étiquette ? */
const estEtiquete = (page, el) => {
  const $el = page.$(el);
  const id = $el.attr("id");
  return (
    (id && page.$(`label[for="${id}"]`).length > 0) ||
    $el.closest("label").length > 0 ||
    Boolean($el.attr("aria-label") || $el.attr("aria-labelledby"))
  );
};

/** Nom accessible d'un bouton : texte, aria-label, title, ou alt d'une image */
const nomBouton = (page, el) => {
  const $el = page.$(el);
  return (
    $el.text().trim() ||
    $el.attr("aria-label") ||
    $el.attr("aria-labelledby") ||
    $el.attr("title") ||
    $el.find("img[alt]").attr("alt") ||
    ""
  ).trim();
};

export default {
  A1: (ctx) => {
    const occurrences = ctx.pages.flatMap((page) => {
      const manque = [];
      if (!page.$("html").attr("lang")) manque.push("lang");
      if (!page.$("meta[charset]").length) manque.push("charset");
      if (!page.$('meta[name="viewport"]').length) manque.push("viewport");
      return manque.length ? [ctx.occPage(page, `manque : ${manque.join(", ")}`)] : [];
    });
    return parAbsence(occurrences, { detailValeur: `${ctx.pages.length - occurrences.length} pages sur ${ctx.pages.length}` });
  },

  A2: (ctx) => {
    const occurrences = [];
    for (const [selecteur, lire, nom] of [
      ["title", (p) => p.$("title").first().text().trim(), "title"],
      ['meta[name="description"]', (p) => p.$('meta[name="description"]').attr("content")?.trim() ?? "", "description"],
    ]) {
      const vus = new Map();
      for (const page of ctx.pages) {
        const valeur = lire(page);
        const el = page.$(selecteur).get(0);
        if (!valeur) {
          occurrences.push(ctx.occPage(page, `${nom} absent`));
        } else if (vus.has(valeur)) {
          occurrences.push({ ...ctx.occHtml(page, el), extrait: `${ctx.occHtml(page, el).extrait} (même ${nom} que ${vus.get(valeur)})` });
        } else {
          vus.set(valeur, page.fichier);
        }
      }
    }
    return parAbsence(occurrences);
  },

  A3: (ctx) => {
    const occurrences = ctx.pages.flatMap((page) => {
      const { $ } = page;
      const manque = [];
      if (!$("header").length) manque.push("header");
      const navs = $("nav").toArray();
      if (!navs.length) manque.push("nav");
      else if (navs.some((n) => !$(n).attr("aria-label") && !$(n).attr("aria-labelledby"))) manque.push("nav sans aria-label");
      if ($("main").length !== 1) manque.push($("main").length ? "plusieurs main" : "main");
      if (!$("footer").length) manque.push("footer");
      return manque.length ? [ctx.occPage(page, `manque : ${manque.join(", ")}`)] : [];
    });
    return parAbsence(occurrences, { detailValeur: `${ctx.pages.length - occurrences.length} pages sur ${ctx.pages.length}` });
  },

  A4: (ctx) => parAbsence(ctx.pages.flatMap((page) => ecartsTitres(ctx, page))),

  A5: (ctx) => {
    const images = ctx.pages.flatMap((page) => page.images.map((img) => ({ page, img })));
    // alt="" est un choix valable (image décorative) : seul l'attribut absent est relevé
    const sansAlt = images.filter(({ img }) => img.alt === null);
    return parRatio(
      images.length - sansAlt.length,
      images.length,
      1,
      sansAlt.map(({ page, img }) => ({ fichier: page.fichier, ligne: img.ligne, colonne: img.colonne, extrait: img.extrait, surligne: null }))
    );
  },

  A6: (ctx) => {
    // La qualité se juge à la main : l'outil relève les alt suspects
    const suspects = ctx.pages.flatMap((page) =>
      page.images
        .filter((img) => img.alt && S.altSuspects.some((motif) => motif.test(img.alt.trim())))
        .map((img) => {
          const debut = img.extrait.indexOf(`alt="${img.alt}"`);
          return {
            fichier: page.fichier,
            ligne: img.ligne,
            colonne: img.colonne,
            extrait: img.extrait,
            surligne: debut >= 0 ? [debut, debut + img.alt.length + 6] : null,
          };
        })
    );
    return aJuger(suspects);
  },

  A7: (ctx) => {
    const champs = [];
    const formulairesSansEnvoi = [];
    for (const page of ctx.pages) {
      page.$("input, select, textarea").each((_, el) => {
        const type = (page.$(el).attr("type") ?? "text").toLowerCase();
        if (["hidden", "submit", "button", "reset", "image"].includes(type)) return;
        champs.push({ page, el });
      });
      page.$("form").each((_, form) => {
        const envoi = page.$(form).find('button:not([type]), button[type="submit"], input[type="submit"]').length;
        if (!envoi) formulairesSansEnvoi.push(ctx.occHtml(page, form));
      });
    }
    const nonEtiquetes = champs.filter(({ page, el }) => !estEtiquete(page, el));
    const occurrences = [...nonEtiquetes.map(({ page, el }) => ctx.occHtml(page, el)), ...formulairesSansEnvoi];
    if (champs.length === 0 && formulairesSansEnvoi.length === 0) return respecte(null, { detailValeur: "aucun formulaire" });
    const resultat = parRatio(champs.length - nonEtiquetes.length, champs.length, 1, occurrences);
    return formulairesSansEnvoi.length ? { ...resultat, verdict: "non-respecte" } : resultat;
  },

  A8: (ctx) => {
    const boutons = ctx.pages.flatMap((page) => page.$("button").toArray().map((el) => ({ page, el })));
    const anonymes = boutons.filter(({ page, el }) => !nomBouton(page, el));
    return parRatio(
      boutons.length - anonymes.length,
      boutons.length,
      1,
      anonymes.map(({ page, el }) => ctx.occHtml(page, el))
    );
  },

  A9: (ctx) => {
    const popovers = ctx.pages.flatMap((p) => p.$("[popover]").toArray().map((el) => ({ page: p, el })));
    if (popovers.length === 0) return respecte(null, { detailValeur: "aucun menu en popover" });
    const sansAutofocus = popovers.filter(({ page, el }) => !page.$(el).find("button[autofocus]").length);
    return parAbsence(sansAutofocus.map(({ page, el }) => ctx.occHtml(page, el)));
  },

  A10: (ctx) => {
    const suppressions = ctx.declarations((d) => d.prop === "outline" && /^(none|0(px)?)$/.test(d.value.trim()));
    // Remplacé si une règle :focus-visible redonne un contour visible
    const remplacement = ctx
      .declarations((d) => /^outline/.test(d.prop) && d.parent?.selector?.includes(":focus-visible"))
      .some((d) => !/^(none|0(px)?)$/.test(d.value.trim()));
    const nues = remplacement ? [] : suppressions;
    return parAbsence(nues.map((d) => occurrenceDeclaration(d, ctx.css, d.value)));
  },

  A11: (ctx) => {
    const mouvements = ctx.declarations((d) => /^(transition|animation)(-name|-property)?$/.test(d.prop) && !/^(none|0s?)$/.test(d.value.trim()));
    if (mouvements.length === 0) return respecte(null, { detailValeur: "aucun mouvement" });
    let reduit = false;
    ctx.css.arbre.walkAtRules("media", (r) => {
      if (/prefers-reduced-motion/.test(r.params)) reduit = true;
    });
    return reduit
      ? respecte(null, { detailValeur: "présent" })
      : nonRespecte(null, mouvements.slice(0, 5).map((d) => occurrenceDeclaration(d, ctx.css, d.prop)), { detailValeur: "absent" });
  },

  A15: (ctx) => {
    const balises = pagesParBalise(ctx);
    const absentes = balises.filter((b) => b.pages.length === 0);
    return parRatio(
      balises.length - absentes.length,
      balises.length,
      1,
      absentes.map((b) => ({ fichier: "(site)", ligne: null, colonne: null, extrait: `<${b.balise}> : absente de toutes les pages`, surligne: [1, 1 + b.balise.length] }))
    );
  },

  A16: (ctx) => {
    // Relevés pour juger le bon usage : time sans datetime, figure sans figcaption
    const releves = ctx.pages.flatMap((page) => [
      ...page.$("time:not([datetime])").toArray().map((el) => ctx.occHtml(page, el, "<time")),
      ...page.$("figure").toArray().filter((el) => !page.$(el).find("figcaption").length).map((el) => ctx.occHtml(page, el, "<figure")),
    ]);
    return aJuger(releves);
  },
};
