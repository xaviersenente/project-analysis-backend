/**
 * Axe Ergonomie (E1 à E15). Les mesures en navigateur arrivent avec le lot 2.
 */
import fs from "fs";
import path from "path";
import thresholds from "../../config/thresholds.js";
import { occurrenceDeclaration } from "../css/sources.js";
import { respecte, nonRespecte, partiel, parRatio, parAbsence } from "./mesure.js";

const S = thresholds.sae105.ergonomie;

const PHOTO = /\.(jpe?g|png|webp|avif|gif)$/i;
const IMAGE = /\.(jpe?g|png|webp|avif|gif|svg)$/i;
// Les icônes d'application (favicons, manifeste) ne sont pas des images de contenu
const HORS_CONTENU = /(^|\/)(favicons?|icons?\/app)\//i;

const normaliserTexte = (t) =>
  t.replace(/\s+/g, " ").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[.…!?:]+$/, "");

/** Images du site citées (hors favicons), avec leur poids en Ko */
export const imagesDuSite = (ctx) =>
  ctx.inventaire.fichiers
    .filter((f) => IMAGE.test(f) && !HORS_CONTENU.test(f) && !ctx.inventaire.orphelins.includes(f))
    .map((f) => ({ fichier: f, poidsKo: Math.round(fs.statSync(path.join(ctx.racine, f)).size / 1024) }));

/** Le lien de la navigation qui mène à la page elle-même, s'il existe */
export const lienVersSoi = (page) =>
  page.$("nav a[href]")
    .toArray()
    .find((el) => {
      const href = page.$(el).attr("href").split(/[?#]/)[0];
      if (/^(https?:|mailto:|tel:|\/\/)/.test(href)) return false;
      let cible = path.posix.normalize(path.posix.join(path.posix.dirname(page.fichier), href || "."));
      // Un lien vers un dossier mène à son index.html
      if (cible === "." || cible.endsWith("/")) cible = `${cible === "." ? "" : cible}index.html`;
      return cible === page.fichier;
    });

/** Contrôle à faire sur chaque page : rend les pages en échec */
const surChaquePage = (ctx, verifier) => {
  const occurrences = ctx.pages.flatMap((page) => verifier(page) ?? []);
  return occurrences.length === 0
    ? respecte(null, { detailValeur: `${ctx.pages.length} pages sur ${ctx.pages.length}` })
    : nonRespecte(null, occurrences, {
        detailValeur: `${ctx.pages.length - new Set(occurrences.map((o) => o.fichier)).size} pages sur ${ctx.pages.length}`,
      });
};

export default {
  E1: (ctx) =>
    surChaquePage(ctx, (page) => {
      const { $ } = page;
      if ($("[popover]").length && $("[popovertarget]").length) return null;
      const nav = $("nav").get(0) ?? $("header").get(0) ?? $("body").get(0);
      return [nav ? { ...ctx.occHtml(page, nav), extrait: `${ctx.occHtml(page, nav).extrait} : pas de popover piloté par popovertarget` } : ctx.occPage(page, "pas de popover")];
    }),

  E2: (ctx) =>
    surChaquePage(ctx, (page) => {
      const { $ } = page;
      // Une page que le menu ne cite pas n'a pas de lien à marquer
      const lien = lienVersSoi(page);
      if (!lien || $(lien).attr("aria-current") === "page") return null;
      return [ctx.occHtml(page, lien)];
    }),

  E3: (ctx) => {
    const selecteurs = ctx.regles().map((r) => r.selector).join(" ");
    const etats = [":hover", ":focus-visible", ":active"];
    const presents = etats.filter((e) => selecteurs.includes(e));
    const manquants = etats.filter((e) => !presents.includes(e));
    const detailValeur = manquants.length ? `manque ${manquants.join(", ")}` : "les trois";
    if (manquants.length === 0) return respecte(3, { detailValeur });
    return presents.length ? partiel(presents.length, [], { detailValeur }) : nonRespecte(0, [], { detailValeur });
  },

  E6: (ctx) => {
    const fautives = ctx
      .declarations((d) => d.prop === "transition" || d.prop === "transition-property")
      .map((d) => {
        const valeur = ctx.resoudre(d.value);
        // Le premier mot de chaque transition est la propriété animée
        const proprietes = valeur.split(",").map((t) => t.trim().split(/\s+/)[0]);
        const interdite = proprietes.find((p) => S.transitionsInterdites.test(p));
        return interdite ? occurrenceDeclaration(d, ctx.css, interdite) : null;
      })
      .filter(Boolean);
    return parAbsence(fautives);
  },

  E7: (ctx) => {
    const vagues = new Set(S.liensVagues.map(normaliserTexte));
    const occurrences = ctx.pages.flatMap((page) =>
      page.$("a")
        .toArray()
        .filter((el) => {
          const texte = normaliserTexte(page.$(el).text());
          return vagues.has(texte) && !page.$(el).attr("aria-label");
        })
        .map((el) => ctx.occHtml(page, el))
    );
    return parAbsence(occurrences);
  },

  E8: (ctx) => {
    const occurrences = [];
    let champs = 0;
    for (const page of ctx.pages) {
      page.$("input, textarea, select").each((_, el) => {
        const $el = page.$(el);
        const type = ($el.attr("type") ?? "text").toLowerCase();
        if (["hidden", "submit", "button", "reset", "checkbox", "radio", "file", "image"].includes(type)) return;
        const nom = `${$el.attr("name") ?? ""} ${$el.attr("id") ?? ""}`.toLowerCase();
        champs++;
        if (/mail|courriel/.test(nom) && type !== "email") occurrences.push(ctx.occHtml(page, el, `type="${type}"`));
        else if (/t[eé]l|phone/.test(nom) && type !== "tel") occurrences.push(ctx.occHtml(page, el, `type="${type}"`));
        else if (/mail|courriel|t[eé]l|phone|^\s*(nom|name|prenom|firstname|lastname)\b|\b(nom|name|prenom)\b/.test(nom) && !$el.attr("autocomplete")) {
          occurrences.push(ctx.occHtml(page, el));
        }
      });
    }
    if (champs === 0) return respecte(null, { detailValeur: "aucun formulaire" });
    return parAbsence(occurrences);
  },

  E9: (ctx) => {
    const liens = ctx.pages.flatMap((p) => p.$('a[href^="mailto:"], a[href^="tel:"]').toArray());
    return liens.length > 0 ? respecte(liens.length) : nonRespecte(0);
  },

  E10: (ctx) => {
    const images = imagesDuSite(ctx);
    const lourdes = images.filter((i) => i.poidsKo > S.imageMaxKo);
    const occurrences = lourdes.map((i) => ({ fichier: i.fichier, ligne: null, colonne: null, extrait: `${path.posix.basename(i.fichier)} · ${i.poidsKo} Ko`, surligne: null }));
    const max = images.reduce((m, i) => Math.max(m, i.poidsKo), 0);
    return lourdes.length === 0 ? respecte(max) : nonRespecte(max, occurrences);
  },

  E12: (ctx) => {
    const photos = imagesDuSite(ctx).filter((i) => PHOTO.test(i.fichier));
    const anciennes = photos.filter((i) => !S.formatsPhoto.includes(path.extname(i.fichier).slice(1).toLowerCase()));
    return parRatio(
      photos.length - anciennes.length,
      photos.length,
      S.formatsPhotoRatio,
      anciennes.map((i) => ({ fichier: i.fichier, ligne: null, colonne: null, extrait: path.posix.basename(i.fichier), surligne: null }))
    );
  },

  E13: (ctx) => {
    const images = ctx.pages.flatMap((page) => page.images.map((img) => ({ page, img })));
    const sansDimensions = images.filter(({ img }) => !(img.largeur && img.hauteur));
    return parRatio(
      images.length - sansDimensions.length,
      images.length,
      S.imagesDimensionneesRatio,
      sansDimensions.map(({ page, img }) => ({ fichier: page.fichier, ligne: img.ligne, colonne: img.colonne, extrait: img.extrait, surligne: null }))
    );
  },

  E14: (ctx) => {
    const videos = ctx.pages.flatMap((page) => page.$("video").toArray().map((el) => ({ page, el })));
    if (videos.length === 0) return respecte(null, { detailValeur: "aucune vidéo" });
    const incompletes = videos.filter(({ page, el }) => {
      const $el = page.$(el);
      return $el.attr("controls") === undefined || !$el.attr("poster") || $el.attr("preload") !== "none";
    });
    return parAbsence(incompletes.map(({ page, el }) => ctx.occHtml(page, el)));
  },
};
