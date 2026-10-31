/**
 * Portfolio S3 (lot 3) : ce que le dépôt dit du projet. Fichiers déclaratifs, historique,
 * traces d'IA, stack et niveau candidat, thème récupéré, fichiers sensibles.
 * Ce sont des informations pour le jury (statut I) : la note reste la sienne.
 */
import thresholds from "../../config/thresholds.js";
import { respecte, nonRespecte, partiel, nonMesurable, parAbsence, aJuger } from "./mesure.js";
import { declaratif, semainesDuJournal, outilsDeclares, indicesStack, indicesTemplate, elementsSensibles } from "../source/depotPortfolio.js";
import { pagesLues } from "./qualiteWeb.js";

const { declaratifs, stack } = thresholds.portfolio;

const occ = (fichier, ligne, extrait) => ({ fichier, ligne, colonne: null, extrait });

/** Chaque analyseur demande le dépôt ; sans lui, « Non mesurable » */
const avecDepot = (analyser) => (ctx) => (ctx.depot ? analyser(ctx) : nonMesurable(ctx.raisonDepot ?? "Le dépôt n'a pas pu être lu"));

const pagesEnLigne = (ctx) => (ctx.parcours ? pagesLues(ctx) : []);

/** Un fichier déclaratif ailleurs qu'à la racine : trouvé, mais signalé */
const horsRacine = (fichier) => (fichier.racine ? [] : [occ(fichier.chemin, null, "Le sujet le demande à la racine du dépôt")]);

/** PC2 : un travail étalé sur le projet (mêmes règles que M10, seuils du portfolio) */
const PC2 = (ctx) => {
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
  const ratees = conditions.filter((c) => !c.ok).map((c) => occ("historique Git", null, c.texte));
  const detailValeur = `${i.commits} commits, ${i.sessions} sessions sur ${i.joursActifs} jours · ${Math.round(i.partDernieres48h * 100)} % dans les 48 h`;
  if (ratees.length === 0) return respecte(i.sessions, { detailValeur });
  return ratees.length === 1 ? partiel(i.sessions, ratees, { detailValeur }) : nonRespecte(i.sessions, ratees, { detailValeur });
};

/** PC3 : JOURNAL.md, une entrée par semaine du projet */
const PC3 = (ctx) => {
  const journal = declaratif(ctx.depot.dossier, ctx.depot.fichiers, declaratifs.journal);
  if (!journal) return nonRespecte(0, [occ("JOURNAL.md", null, "JOURNAL.md absent")]);
  const semaines = semainesDuJournal(journal.texte, ctx.periode);
  const attendues = Math.max(1, Math.round((ctx.periode.fin - ctx.periode.debut) / (7 * 864e5)));
  const lignes = journal.texte.split("\n").filter((l) => l.trim()).length;
  const detailValeur = `${semaines} semaine(s) datée(s) sur ${attendues} · ${lignes} lignes`;
  const occurrences = horsRacine(journal);
  if (semaines / attendues >= declaratifs.semainesRatio) return { ...respecte(semaines, { detailValeur }), occurrences };
  occurrences.push(occ(journal.chemin, null, `Entrées datées sur ${semaines} semaine(s) seulement ; le projet en compte ${attendues}`));
  return semaines > 0 ? partiel(semaines, occurrences, { detailValeur }) : nonRespecte(semaines, occurrences, { detailValeur });
};

/** PC4 : IA.md présent ; pour chaque outil, l'étape et ce qui a été retouché */
const PC4 = (ctx) => {
  const ia = declaratif(ctx.depot.dossier, ctx.depot.fichiers, declaratifs.ia);
  if (!ia) return nonRespecte(0, [occ("IA.md", null, "IA.md absent : le sujet le traite comme une déclaration mensongère")]);
  const outils = outilsDeclares(ia);
  const occurrences = horsRacine(ia);
  if (outils.length === 0) {
    // « Aucun outil utilisé » est une déclaration possible : au jury de la confronter au code
    occurrences.push(occ(ia.chemin, null, "Aucun outil d'IA nommé"));
    return partiel(0, occurrences, { detailValeur: "aucun outil nommé" });
  }
  for (const o of outils) {
    const manques = [!o.etape && "l'étape", !o.retouche && "ce qui a été modifié, corrigé ou rejeté"].filter(Boolean);
    if (manques.length) occurrences.push(occ(ia.chemin, o.ligne, `${o.nom} : ne dit pas ${manques.join(" ni ")} · ${o.extrait}`));
  }
  const detailValeur = outils.map((o) => o.nom).join(", ");
  const incomplets = occurrences.filter((o) => o.ligne).length;
  return incomplets === 0 && ia.racine ? { ...respecte(outils.length, { detailValeur }), occurrences } : partiel(outils.length, occurrences, { detailValeur });
};

/** PC5 : les outils dont l'historique porte la trace sont déclarés dans IA.md */
const PC5 = (ctx) => {
  const traces = ctx.depot.tracesIa;
  if (traces.length === 0) return respecte(0, { detailValeur: "aucune trace d'outil dans les commits" });
  const ia = declaratif(ctx.depot.dossier, ctx.depot.fichiers, declaratifs.ia);
  const declares = new Set(ia ? outilsDeclares(ia).map((o) => o.nom) : []);
  const occurrences = traces.map((t) => occ(`commit ${t.sha}`, null, `${t.outil}${declares.has(t.outil) ? " (déclaré)" : " (non déclaré dans IA.md)"} · ${t.message}`));
  const nonDeclares = traces.filter((t) => !declares.has(t.outil));
  const detailValeur = `${traces.length} commit(s) : ${[...new Set(traces.map((t) => t.outil))].join(", ")}`;
  return nonDeclares.length ? nonRespecte(nonDeclares.length, occurrences, { detailValeur }) : { ...respecte(0, { detailValeur }), occurrences };
};

/** Q12 : QUALITE.md présent, qui couvre les quatre domaines du sujet */
const Q12 = (ctx) => {
  const qualite = declaratif(ctx.depot.dossier, ctx.depot.fichiers, declaratifs.qualite);
  if (!qualite) return nonRespecte(0, [occ("QUALITE.md", null, "QUALITE.md absent")]);
  const lignes = qualite.texte.split("\n");
  // Un critère : une ligne de tableau (hors en-tête et séparateur) ou un élément de liste
  const separateur = (l) => /^\s*\|[\s:|-]+\|\s*$/.test(l ?? "");
  const criteres = lignes.filter(
    (l, i) => (/^\s*\|/.test(l) && !separateur(l) && !separateur(lignes[i + 1])) || /^\s*([-*+]|\d+\.)\s+\S/.test(l)
  ).length;
  const manquants = declaratifs.domainesQualite.filter((d) => !d.motif.test(qualite.texte));
  const occurrences = [...horsRacine(qualite), ...manquants.map((d) => occ(qualite.chemin, null, `Domaine absent : ${d.nom}`))];
  const detailValeur = `${criteres} ligne(s) de critères · ${4 - manquants.length} domaine(s) sur 4`;
  return occurrences.length ? partiel(criteres, occurrences, { detailValeur }) : respecte(criteres, { detailValeur });
};

/** TE2 : la stack, et le niveau candidat sur l'échelle du sujet (à confirmer en soutenance) */
const TE2 = (ctx) => {
  const { indices, niveau, raison } = indicesStack(ctx.depot.dossier, ctx.depot.fichiers, pagesEnLigne(ctx));
  const LIBELLES = {
    frameworks: "Framework",
    donnees: "Source de données",
    wordpress: "WordPress",
    pageBuilder: "Page-builder",
    generateur: "Outil de création",
    typesContenus: "Type de contenus",
    champs: "Champs personnalisés",
    boucles: "Boucle personnalisée",
    menus: "Menu dynamique",
    contenus: "Contenus en fichiers",
    appelsApi: "Appel à une source de données",
    backOffice: "Back-office",
    bibliotheques: "Bibliothèque",
  };
  const occurrences = Object.entries(LIBELLES).flatMap(([cle, libelle]) => indices[cle].map((o) => ({ ...o, extrait: `${libelle} · ${o.extrait}` })));
  if (indices.composants.length) occurrences.push(occ(indices.composants[0].fichier, null, `${indices.composants.length} composants (seuil du niveau 4 : ${stack.composantsMin})`));
  if (indices.interactions.length) occurrences.push(occ(indices.interactions[0].fichier, indices.interactions[0].ligne, `${indices.interactions.length} écouteurs d'événements ou plus`));
  // Pas de verdict : le niveau se défend en soutenance, le jury le juge
  return aJuger(occurrences, { valeur: niveau, detailValeur: `niveau ${niveau} candidat : ${raison}` });
};

/** TE3 : aucun indice d'un thème ou d'un template récupéré */
const TE3 = (ctx) => parAbsence(indicesTemplate(ctx.depot.dossier, ctx.depot.fichiers, pagesEnLigne(ctx)));

/** TE4 : ni fichier sensible ni secret dans le dépôt public */
const TE4 = (ctx) => parAbsence(ctx.depot.sensibles);

/** TE5 : les bibliothèques et frameworks sont déclarés (README, IA.md, QUALITE.md ou JOURNAL.md) */
const TE5 = (ctx) => {
  const { indices } = indicesStack(ctx.depot.dossier, ctx.depot.fichiers, pagesEnLigne(ctx));
  const outils = [...indices.frameworks, ...indices.bibliotheques];
  if (outils.length === 0) return respecte(0, { detailValeur: "aucune bibliothèque dans package.json" });
  const textes = ["readme", "ia", "qualite", "journal"]
    .map((cle) => declaratif(ctx.depot.dossier, ctx.depot.fichiers, cle === "readme" ? /^readme\.md$/i : declaratifs[cle])?.texte ?? "")
    .join("\n")
    .toLowerCase();
  const nom = (o) => o.extrait.match(/"([^"]+)"/)?.[1] ?? o.extrait;
  // « tailwindcss » se déclare « Tailwind », « @barba/core » « barba »
  const racine = (o) => nom(o).replace(/^@([^/]+)\/.*$/, "$1").replace(/[-.]?(js|css)$/i, "").toLowerCase();
  const absents = outils.filter((o) => !textes.includes(racine(o)));
  const detailValeur = `${outils.length - absents.length} déclaré(s) sur ${outils.length}`;
  return absents.length ? nonRespecte(absents.length, absents.map((o) => ({ ...o, extrait: `${nom(o)} n'est nommé dans aucun document` })), { detailValeur }) : respecte(0, { detailValeur });
};

export default Object.fromEntries(Object.entries({ PC3, PC4, PC5, Q12, TE2, TE3, TE4, TE5 }).map(([id, f]) => [id, avecDepot(f)]).concat([["PC2", PC2]]));
