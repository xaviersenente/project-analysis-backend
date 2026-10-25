/**
 * Axe Méthodologie (M1 à M14). JavaScript (M4) au lot 2, timeline (M10) au lot 3.
 */
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import thresholds from "../../config/thresholds.js";
import { validateHTML, validateCSS } from "../html/validationService.js";
import { occurrenceDeclaration, occurrenceRegle } from "../css/sources.js";
import { chercherMotifs, volume } from "../js/motifs.js";
import { respecte, nonRespecte, partiel, nonMesurable, parRatio, parAbsence } from "./mesure.js";

const S = thresholds.sae105.methodologie;

const BEM = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:__[a-z0-9]+(?:-[a-z0-9]+)*)?(?:--[a-z0-9]+(?:-[a-z0-9]+)*)?$/;
const SECTION = /={2,}|-{4,}|\b(partie|section|variables|bases?|blocs?|utilitaires|composants|reset|mise en page)\b/i;
// Fichiers de travail, en capitales par convention : hors du contrôle de nommage
const NOMS_CONVENTIONNELS = /^(README|NOTES|LICENSE|LICENCE|CHANGELOG)(\.\w+)?$/;

const sansAccents = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Les problèmes d'un chemin de fichier : majuscule, espace, accent, caractère spécial */
export const problemesNom = (chemin) => {
  if (chemin.split("/").some((s) => s.startsWith("."))) return [];
  if (NOMS_CONVENTIONNELS.test(path.posix.basename(chemin))) return [];
  const problemes = [];
  if (/[A-Z]/.test(chemin)) problemes.push("majuscule");
  if (/\s/.test(chemin)) problemes.push("espace");
  if (/[^\x00-\x7F]/.test(chemin)) problemes.push("accent");
  if (/[^a-zA-Z0-9._\-/\s\u0080-￿]/.test(chemin)) problemes.push("caractere");
  return problemes;
};

/** Classes CSS employées dans le HTML (et nommées dans le JavaScript, qui peut les ajouter) */
export const classesHtml = (ctx) => {
  const classes = new Set();
  for (const page of ctx.pages) {
    page.$("[class]").each((_, el) => {
      for (const c of (page.$(el).attr("class") ?? "").split(/\s+/)) if (c) classes.add(c);
    });
  }
  return classes;
};

const motsDuJavascript = (ctx) => {
  const mots = new Set();
  for (const f of ctx.inventaire.fichiers.filter((f) => f.endsWith(".js"))) {
    for (const m of fs.readFileSync(path.join(ctx.racine, f), "utf-8").matchAll(/["'`]([\w-]+)["'`]/g)) mots.add(m[1]);
  }
  for (const page of ctx.pages) for (const s of page.scripts) for (const m of (s.enLigne ?? "").matchAll(/["'`]([\w-]+)["'`]/g)) mots.add(m[1]);
  return mots;
};

/** Classes déclarées dans le CSS, avec la première règle qui les cite */
export const classesCss = (ctx) => {
  const classes = new Map();
  for (const regle of ctx.regles((r) => r.parent?.type !== "atrule" || r.parent.name !== "keyframes")) {
    for (const m of regle.selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) if (!classes.has(m[1])) classes.set(m[1], regle);
  }
  return classes;
};

/** Ratio BEM des classes du HTML, et celles hors convention */
export const mesureBem = (ctx) => {
  const classes = [...classesHtml(ctx)];
  const horsConvention = classes.filter((c) => !BEM.test(c));
  const ratio = classes.length ? (classes.length - horsConvention.length) / classes.length : 0;
  const palier = thresholds.sae105.bonus.bem.find((p) => ratio >= p.ratio);
  return { ratio, points: palier?.points ?? 0, totalClasses: classes.length, horsConvention };
};

/** Le JavaScript du site : fichiers cités par les pages et scripts en ligne */
export const fichiersJavascript = (ctx) => {
  const externes = [...new Set(ctx.pages.flatMap((p) => p.scripts.map((s) => s.chemin).filter(Boolean)))];
  return [
    ...externes.map((chemin) => ({ chemin, contenu: fs.readFileSync(path.join(ctx.racine, chemin), "utf-8"), ligneDepart: 1 })),
    ...ctx.pages.flatMap((page) =>
      page.scripts
        .filter((s) => s.enLigne?.trim() && !/json|template/i.test(s.extrait.match(/type=["']([^"']+)/)?.[1] ?? ""))
        .map((s) => ({ chemin: page.fichier, contenu: s.enLigne, ligneDepart: s.ligne }))
    ),
  ];
};

/** Motifs et volume du JavaScript (critère M4 et bloc de l'axe) */
export const analyseJavascript = (ctx) => {
  ctx.javascript ??= (() => {
    const fichiers = fichiersJavascript(ctx);
    return { ...volume(fichiers), motifs: chercherMotifs(fichiers) };
  })();
  return ctx.javascript;
};

/** Commande Git sur la version analysée ; null sans historique */
const git = (ctx, args) => {
  if (!ctx.git) return null;
  try {
    return execFileSync("git", ["-C", ctx.git.dossier, ...args], { stdio: ["ignore", "pipe", "ignore"] }).toString();
  } catch {
    return null;
  }
};

export default {
  M1: async (ctx) => {
    if (ctx.sansValidationW3c) return nonMesurable("Validation W3C désactivée pour cette analyse");
    const occurrences = [];
    const nonMesurees = [];
    ctx.erreursW3cParPage = {};
    for (const page of ctx.pages) {
      const { mesurable, erreurs, raison } = await validateHTML(page.html);
      if (!mesurable) {
        nonMesurees.push(raison);
        continue;
      }
      ctx.erreursW3cParPage[page.fichier] = erreurs.length;
      for (const e of erreurs) {
        const extrait = `${(e.extract ?? "").replace(/\n/g, " ").trim()}  ← ${e.message}`;
        const debut = typeof e.hiliteStart === "number" ? e.hiliteStart - ((e.extract ?? "").length - (e.extract ?? "").trimStart().length) : -1;
        occurrences.push({
          fichier: page.fichier,
          ligne: e.lastLine ?? null,
          colonne: e.firstColumn ?? null,
          extrait,
          surligne: debut >= 0 && e.hiliteLength ? [debut, debut + e.hiliteLength] : null,
        });
      }
    }
    if (nonMesurees.length === ctx.pages.length) return nonMesurable(nonMesurees[0]);
    return parAbsence(occurrences);
  },

  M2: async (ctx) => {
    if (ctx.sansValidationW3c) return nonMesurable("Validation W3C désactivée pour cette analyse");
    const feuilles = ctx.css.feuilles;
    if (feuilles.length === 0) return respecte(null, { detailValeur: "aucune feuille de style" });
    const { mesurable, erreurs, raison } = await validateCSS(feuilles.map((f) => path.join(ctx.racine, f)));
    if (!mesurable) return nonMesurable(raison);
    const ignorees = erreurs.filter((e) => S.validationCssIgnorer.some((motif) => motif.test(e.message)));
    const occurrences = erreurs
      .filter((e) => !ignorees.includes(e))
      .map((e) => {
        const fichier = path.relative(ctx.racine, e.fichier).split(path.sep).join("/");
        // La ligne fautive du source : plus lisible que l'extrait du validateur, coupé au milieu
        const ligne = e.ligne ? fs.readFileSync(e.fichier, "utf-8").split("\n")[e.ligne - 1]?.trim() : null;
        return { fichier, ligne: e.ligne, colonne: e.colonne, extrait: `${ligne ?? e.extrait.replace(/\n/g, " ").trim()}  ← ${e.message}`, surligne: null };
      });
    const extra = ignorees.length
      ? { detailValeur: `${ignorees.length} message${ignorees.length > 1 ? "s" : ""} ignoré${ignorees.length > 1 ? "s" : ""} : CSS récent inconnu du validateur` }
      : {};
    return parAbsence(occurrences, extra);
  },

  M3: (ctx) => {
    const importants = ctx.declarations((d) => d.important).map((d) => occurrenceDeclaration(d, ctx.css, "!important"));
    const ids = ctx
      .regles((r) => /#[_a-zA-Z][\w-]*/.test(r.selector.replace(/\[[^\]]*\]/g, "")))
      .map((r) => occurrenceRegle(r, ctx.css, r.selector.match(/#[_a-zA-Z][\w-]*/)[0]));
    return parAbsence([...importants, ...ids]);
  },

  M4: (ctx) => {
    const { fichiers, lignes, motifs } = analyseJavascript(ctx);
    const detailValeur = fichiers || lignes ? `${fichiers} fichier${fichiers > 1 ? "s" : ""}, ${lignes} lignes` : "aucun JavaScript";
    return parAbsence(motifs.map((m) => m.occurrence), { detailValeur });
  },

  M5: (ctx) => {
    const declarees = classesCss(ctx);
    const employees = new Set([...classesHtml(ctx), ...motsDuJavascript(ctx)]);
    const mortes = [...declarees.entries()].filter(([c]) => !employees.has(c));
    const resultat = parRatio(
      declarees.size - mortes.length,
      declarees.size,
      1 - S.cssMortMax,
      mortes.map(([c, regle]) => occurrenceRegle(regle, ctx.css, `.${c}`))
    );
    // La valeur affichée est la part de CSS mort, face au seuil « ≤ 5 % »
    return { ...resultat, valeur: declarees.size ? Math.round((mortes.length / declarees.size) * 1000) / 10 : 0 };
  },

  M6: (ctx) => {
    const occurrences = ctx.css.imports.map((i) => ({ fichier: i.fichier, ligne: i.ligne, colonne: 1, extrait: `@import → ${i.cible}`, surligne: [0, 7] }));
    // Une feuille liée à certaines pages seulement
    const toutes = ctx.pages.map((p) => new Set(p.feuilles));
    for (const page of ctx.pages) {
      for (const feuille of page.feuilles) {
        if (toutes.every((s) => s.has(feuille))) continue;
        const lien = page.$(`link[rel~="stylesheet"]`).toArray().find((el) => page.$(el).attr("href")?.endsWith(path.posix.basename(feuille)));
        if (lien) occurrences.push(ctx.occHtml(page, lien, path.posix.basename(feuille)));
      }
    }
    let sections = 0;
    ctx.css.arbre.walkComments((c) => {
      if (SECTION.test(c.text)) sections++;
    });
    const fichiers = ctx.css.feuilles.length;
    const detailValeur = `${fichiers} feuille${fichiers > 1 ? "s" : ""} · ${sections} commentaire${sections > 1 ? "s" : ""} de section`;
    return fichiers === 1 && sections >= S.commentairesSectionMin
      ? respecte(sections, { detailValeur })
      : nonRespecte(sections, occurrences, { detailValeur });
  },

  M7: (ctx) => {
    const { ratio, points, totalClasses, horsConvention } = mesureBem(ctx);
    const valeur = Math.round(ratio * 1000) / 10;
    const detailValeur = `${valeur} % des ${totalClasses} classes`;
    const extra = { detailValeur, bonusPoints: points };
    return points > 0 ? respecte(valeur, extra) : nonRespecte(valeur, [], { ...extra, horsConvention });
  },

  M8: (ctx) => {
    const fichiers = ctx.inventaire.fichiers.filter((f) => !f.split("/").some((s) => s.startsWith(".")));
    const fautifs = fichiers.map((f) => ({ f, problemes: problemesNom(f) })).filter((x) => x.problemes.length);
    return parRatio(
      fichiers.length - fautifs.length,
      fichiers.length,
      1,
      fautifs.map(({ f, problemes }) => ({ fichier: f, ligne: null, colonne: null, extrait: `${f} : ${problemes.join(", ")}`, surligne: [0, f.length] }))
    );
  },

  M9: (ctx) => {
    const { introuvables, cheminsRacine } = ctx.inventaire;
    const occurrence = (x, cause) => {
      const debut = x.extrait.indexOf(x.chemin.split("/").pop());
      return {
        fichier: x.page,
        ligne: x.ligne,
        colonne: x.colonne,
        extrait: x.extrait ? `${x.extrait}  ← ${cause}` : `${x.chemin} ← ${cause}`,
        surligne: debut >= 0 ? [debut, debut + x.chemin.split("/").pop().length] : null,
      };
    };
    return parAbsence([
      ...introuvables.map((x) => occurrence(x, x.cause === "casse" ? "erreur de casse" : "fichier absent")),
      ...cheminsRacine.map((x) => occurrence(x, "chemin en / : 404 sur GitHub Pages")),
    ]);
  },

  M10: (ctx) => {
    if (!ctx.historique) return nonMesurable(ctx.raisonHistorique ?? "Historique Git indisponible");
    const { indicateurs: i, seuils } = ctx.historique;
    const conditions = [
      { ok: i.sessions >= seuils.sessionsMin, texte: `${i.sessions} sessions (seuil ≥ ${seuils.sessionsMin})` },
      { ok: i.joursActifs >= seuils.joursMin, texte: `${i.joursActifs} jours actifs (seuil ≥ ${seuils.joursMin})` },
      {
        ok: i.partDernieres48h < seuils.partDernieres48hMax,
        texte: `${Math.round(i.partDernieres48h * 100)} % des lignes dans les 48 dernières heures (seuil < ${Math.round(seuils.partDernieres48hMax * 100)} %)`,
      },
    ];
    const ratees = conditions.filter((c) => !c.ok);
    const occurrences = ratees.map((c) => ({ fichier: "historique Git", ligne: null, colonne: null, extrait: c.texte, surligne: null }));
    const detailValeur = `${i.sessions} sessions sur ${i.joursActifs} jours · ${Math.round(i.partDernieres48h * 100)} % dans les 48 h`;
    if (ratees.length === 0) return respecte(i.sessions, { detailValeur });
    return ratees.length === 1 ? partiel(i.sessions, occurrences, { detailValeur }) : nonRespecte(i.sessions, occurrences, { detailValeur });
  },

  M11: (ctx) => {
    const sortie = git(ctx, ["log", "--format=%h%x09%s", ctx.git?.sha ?? "HEAD"]);
    if (sortie === null) return nonMesurable("Historique Git indisponible");
    const commits = sortie.trim().split("\n").filter(Boolean).map((l) => l.split("\t"));
    const generiques = commits.filter(([, message]) => S.messagesGeneriques.test(message.trim()));
    const valeur = commits.length ? Math.round((generiques.length / commits.length) * 1000) / 10 : 0;
    const occurrences = generiques.map(([sha, message]) => ({ fichier: `commit ${sha}`, ligne: null, colonne: null, extrait: message, surligne: [0, message.length] }));
    return valeur / 100 <= S.messagesGeneriquesMax ? { ...respecte(valeur), occurrences } : nonRespecte(valeur, occurrences);
  },

  M12: (ctx) => {
    const fichier = ctx.inventaire.fichiers.find((f) => /^readme\.md$/i.test(path.posix.basename(f)) && !f.includes("/"));
    if (!fichier) return nonRespecte(S.readme.length, [{ fichier: "README.md", ligne: null, colonne: null, extrait: "README absent", surligne: null }]);
    const lignes = fs.readFileSync(path.join(ctx.racine, fichier), "utf-8").split("\n");
    const occurrences = [];
    for (const champ of S.readme) {
      const motif = new RegExp(`^\\s*[-*]?\\s*\\**\\s*${champ}\\s*\\**\\s*:\\s*(.*)$`, "i");
      const index = lignes.findIndex((l) => motif.test(sansAccents(l)));
      if (index === -1) {
        occurrences.push({ fichier, ligne: null, colonne: null, extrait: `champ « ${champ} » absent`, surligne: null });
      } else if (!sansAccents(lignes[index]).match(motif)[1].replace(/[*_`<>]/g, "").trim()) {
        occurrences.push({ fichier, ligne: index + 1, colonne: 1, extrait: lignes[index], surligne: null });
      }
    }
    return parAbsence(occurrences);
  },

  M13: (ctx) => {
    const fichier = ctx.inventaire.fichiers.find((f) => /^notes\.md$/i.test(f));
    if (!fichier) return nonRespecte(0, [{ fichier: "NOTES.md", ligne: null, colonne: null, extrait: "NOTES.md absent", surligne: null }]);
    const lignes = fs.readFileSync(path.join(ctx.racine, fichier), "utf-8").split("\n");
    const sections = [];
    lignes.forEach((ligne, i) => {
      if (/^#{2,3}\s/.test(ligne)) sections.push({ titre: ligne, ligne: i + 1, contenu: 0 });
      else if (sections.length && ligne.trim() && !/^#/.test(ligne)) sections.at(-1).contenu++;
    });
    const vides = sections.filter((s) => s.contenu === 0);
    const resultat = parRatio(
      sections.length - vides.length,
      sections.length,
      1,
      vides.map((s) => ({ fichier, ligne: s.ligne, colonne: 1, extrait: `${s.titre} (section vide)`, surligne: null }))
    );
    return sections.length === 0 ? nonRespecte(0, [], { detailValeur: "aucune section" }) : resultat;
  },

  M14: (ctx) => {
    const tags = git(ctx, ["tag", "--list"]);
    if (tags === null) return nonMesurable("Historique Git indisponible");
    const liste = tags.split("\n").filter(Boolean);
    return liste.includes("v1")
      ? respecte(null, { detailValeur: "tag v1 posé" })
      : nonRespecte(null, [], { detailValeur: liste.length ? `tags : ${liste.join(", ")}` : "aucun tag" });
  },
};
