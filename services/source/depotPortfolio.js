/**
 * Portfolio S3 (lot 3) : ce que le dépôt dit du projet, sans rien exécuter.
 * Fichiers déclaratifs (JOURNAL.md, IA.md, QUALITE.md), traces d'IA dans l'historique,
 * stack et indices de niveau, thème ou template récupéré, fichiers sensibles.
 * Chaque fait garde où il a été trouvé : { fichier, ligne, colonne, extrait }.
 */
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import thresholds from "../../config/thresholds.js";

const { declaratifs, outilsIa, tracesIa, stack, template, sensibles } = thresholds.portfolio;
const IGNORES = /(^|\/)(node_modules|vendor|dist|build|\.astro|\.next|\.nuxt|\.svelte-kit|\.output|\.git)\//;
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

const git = (dossier, args) => execFileSync("git", ["-C", dossier, ...args], { maxBuffer: 50 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }).toString();

const occ = (fichier, ligne, extrait) => ({ fichier, ligne, colonne: null, extrait: extrait.trim().slice(0, 200) });

/** Les fichiers suivis par Git dans la version évaluée */
export const fichiersDuDepot = (dossier) => git(dossier, ["ls-files", "-z"]).split("\0").filter(Boolean);

const lire = (dossier, fichier) => {
  try {
    const chemin = path.join(dossier, fichier);
    if (fs.statSync(chemin).size > sensibles.tailleMaxKo * 1024) return null;
    return fs.readFileSync(chemin, "utf-8");
  } catch {
    return null;
  }
};

/** Les lignes d'un ensemble de fichiers qui correspondent à un motif */
export const chercher = (dossier, fichiers, motif, max = 5) => {
  const trouvees = [];
  for (const fichier of fichiers) {
    const texte = lire(dossier, fichier);
    if (texte === null) continue;
    const lignes = texte.split("\n");
    for (let i = 0; i < lignes.length && trouvees.length < max; i++) {
      if (motif.test(lignes[i])) trouvees.push(occ(fichier, i + 1, lignes[i]));
    }
    if (trouvees.length >= max) break;
  }
  return trouvees;
};

/**
 * Un fichier déclaratif : à la racine, sinon ailleurs (signalé)
 * @returns {{ chemin: string, racine: boolean, texte: string } | null}
 */
export const declaratif = (dossier, fichiers, motif) => {
  const candidats = fichiers.filter((f) => motif.test(path.posix.basename(f)) && !IGNORES.test(f));
  const choisi = candidats.find((f) => !f.includes("/")) ?? candidats[0];
  if (!choisi) return null;
  return { chemin: choisi, racine: !choisi.includes("/"), texte: lire(dossier, choisi) ?? "" };
};

// ---------- JOURNAL.md ----------

/** Semaine ISO (« 2026-W41 ») d'une date */
export const semaineIso = (date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const jour = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - jour);
  const debutAnnee = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const numero = Math.ceil(((d - debutAnnee) / 864e5 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(numero).padStart(2, "0")}`;
};

/**
 * Les semaines qu'un journal couvre : dates (12/10, 2026-10-12, 12 octobre) dans la période
 * du projet, ou titres « Semaine 3 ». L'année manquante est celle qui place la date dans la période.
 * @param {string} texte
 * @param {{ debut: Date, fin: Date }} periode
 */
export const semainesDuJournal = (texte, { debut, fin }) => {
  const marge = 7 * 864e5;
  const dansPeriode = (d) => !Number.isNaN(d.getTime()) && d >= new Date(debut - marge) && d <= new Date(+fin + marge);
  const annees = [...new Set([debut.getFullYear(), fin.getFullYear()])];
  const candidates = (jour, mois, annee) => (annee ? [annee] : annees).map((a) => new Date(a < 100 ? 2000 + a : a, mois - 1, jour));
  const semaines = new Set();
  const ajouter = (dates) => {
    const d = dates.find(dansPeriode);
    if (d) semaines.add(semaineIso(d));
  };
  for (const m of texte.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) ajouter([new Date(+m[1], +m[2] - 1, +m[3])]);
  for (const m of texte.matchAll(/\b(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?\b/g)) ajouter(candidates(+m[1], +m[2], m[3] ? +m[3] : null));
  const mois = new RegExp(`\\b(\\d{1,2})(?:er)?\\s+(${MOIS.join("|")}|fevrier|aout|decembre)(?:\\s+(\\d{4}))?`, "gi");
  for (const m of texte.matchAll(mois)) {
    const nom = m[2].toLowerCase().replace("fevrier", "février").replace("aout", "août").replace("decembre", "décembre");
    ajouter(candidates(+m[1], MOIS.indexOf(nom) + 1, m[3] ? +m[3] : null));
  }
  // « Semaine 3 », « S3 » en titre : un numéro de semaine du projet
  const numeros = new Set([...texte.matchAll(/^#{1,6}\s*(?:semaine|sem\.?|s)\s*(\d{1,2})\b/gim)].map((m) => +m[1]));
  return Math.max(semaines.size, numeros.size);
};

// ---------- IA.md ----------

/** Le passage d'IA.md qui parle d'un outil : sa ligne de tableau, sinon sa section */
const passageOutil = (texte, motif) => {
  const lignes = texte.split("\n");
  const index = lignes.findIndex((l) => motif.test(l));
  if (index < 0) return null;
  if (lignes[index].trim().startsWith("|")) return { ligne: index + 1, texte: lignes[index] };
  // La section : du titre précédent (ou de la ligne) jusqu'au titre suivant
  let debut = index;
  while (debut > 0 && !/^#{1,6}\s/.test(lignes[debut])) debut--;
  let fin = index + 1;
  while (fin < lignes.length && !/^#{1,6}\s/.test(lignes[fin])) fin++;
  return { ligne: index + 1, texte: lignes.slice(debut, fin).join("\n") };
};

/** Les outils déclarés dans IA.md, et pour chacun : l'étape, et ce qui a été retouché */
export const outilsDeclares = (ia) =>
  outilsIa
    .map((outil) => {
      const passage = passageOutil(ia.texte, outil.motif);
      if (!passage) return null;
      return {
        nom: outil.nom,
        ligne: passage.ligne,
        extrait: passage.texte.split("\n").find((l) => outil.motif.test(l)) ?? "",
        etape: declaratifs.iaEtape.test(passage.texte),
        retouche: declaratifs.iaRetouche.test(passage.texte),
      };
    })
    .filter(Boolean);

/** Les commits qui portent la trace d'un outil d'IA (co-auteur, signature, auteur robot) */
export const tracesIaDansHistorique = (dossier, sha) =>
  git(dossier, ["log", "--format=%h%x1f%an%x1f%B%x1e", sha])
    .split("\x1e")
    .map((bloc) => bloc.trim())
    .filter(Boolean)
    .map((bloc) => {
      const [court, auteur, corps] = bloc.split("\x1f");
      const texte = `${auteur}\n${corps}`;
      const robot = /(copilot|claude|cursor|devin|codex)/i.test(auteur) && /bot|agent|\[/i.test(auteur);
      if (!tracesIa.test(texte) && !robot) return null;
      const outil = outilsIa.find((o) => o.motif.test(texte))?.nom ?? "outil d'IA";
      return { sha: court, outil, message: corps.split("\n")[0] };
    })
    .filter(Boolean);

// ---------- Stack et niveau ----------

const dependances = (dossier, fichiers) =>
  fichiers
    .filter((f) => path.posix.basename(f) === "package.json" && !IGNORES.test(f))
    .flatMap((f) => {
      const texte = lire(dossier, f);
      if (!texte) return [];
      try {
        const json = JSON.parse(texte);
        const lignes = texte.split("\n");
        return Object.keys({ ...json.dependencies, ...json.devDependencies }).map((nom) => {
          const i = lignes.findIndex((l) => l.includes(`"${nom}"`));
          return { nom, fichier: f, ligne: i + 1, extrait: lignes[i] ?? nom };
        });
      } catch {
        return [];
      }
    });

/**
 * Les indices de la stack, avec leurs preuves, et le niveau candidat sur l'échelle du sujet
 * (1, 2, 4 ou 5). Un niveau candidat se confirme en soutenance : il n'est pas noté.
 * @param {string} dossier
 * @param {string[]} fichiers
 * @param {Array} [pagesEnLigne] - Pages du parcours (générateur, WordPress, page-builder vus en ligne)
 */
export const indicesStack = (dossier, fichiers, pagesEnLigne = []) => {
  const sources = fichiers.filter((f) => !IGNORES.test(f) && !/\.min\.(js|css)$/.test(f));
  const deps = dependances(dossier, sources);
  const parListe = (liste) => deps.filter((d) => liste.includes(d.nom));
  const php = sources.filter((f) => f.endsWith(".php"));
  const preuve = (d) => occ(d.fichier, d.ligne, d.extrait);

  const themeWp = sources.find((f) => path.posix.basename(f) === "style.css" && /Theme Name\s*:/i.test(lire(dossier, f) ?? ""));
  const enLigne = (cle) => pagesEnLigne.find((p) => p[cle]);
  const wordpress = Boolean(themeWp || php.some((f) => path.posix.basename(f) === "functions.php") || enLigne("wordpress"));
  const pageBuilder = chercher(dossier, sources, /elementor|et_pb_|fusion_builder|vc_row|wpbakery/i, 1)[0] ?? (enLigne("pageBuilder") ? occ(enLigne("pageBuilder").chemin, null, "page-builder vu sur le site en ligne") : null);
  const generateur = pagesEnLigne.find((p) => p.generateur && template.generateurs.test(p.generateur));

  const indices = {
    frameworks: parListe(stack.frameworks).map(preuve),
    bibliotheques: parListe(stack.bibliotheques).map(preuve),
    donnees: parListe(stack.donnees).map(preuve),
    wordpress: wordpress ? [themeWp ? occ(themeWp, 1, "Thème WordPress (style.css)") : occ(enLigne("wordpress")?.chemin ?? "functions.php", null, "WordPress")] : [],
    pageBuilder: pageBuilder ? [pageBuilder] : [],
    generateur: generateur ? [occ(generateur.chemin, null, `Généré par ${generateur.generateur}`)] : [],
    typesContenus: chercher(dossier, php, /register_post_type\s*\(/),
    champs: chercher(dossier, php, /acf_add_local_field_group|\bget_field\s*\(|\bthe_field\s*\(|register_meta\s*\(|add_meta_box\s*\(/),
    boucles: chercher(dossier, php, /new\s+WP_Query|get_posts\s*\(|query_posts\s*\(/),
    menus: chercher(dossier, php, /register_nav_menus?\s*\(/),
    contenus: sources.filter((f) => /(^|\/)src\/content\/[^/]+\//.test(f)).slice(0, 3).map((f) => occ(f, null, "Collection de contenus")),
    appelsApi: chercher(dossier, sources.filter((f) => /\.(js|ts|jsx|tsx|vue|svelte|astro)$/.test(f)), /fetch\s*\(\s*[`'"]https?:|axios\.(get|post)|\.collection\s*\(\s*["']/, 3),
    backOffice: sources.filter((f) => stack.backOffice.test(f.replace(/^src\/(pages|app|routes)\//, "/"))).slice(0, 3).map((f) => occ(f, null, "Route ou dossier d'administration")),
    composants: sources.filter((f) => /(^|\/)components?\//i.test(f) && /\.(astro|vue|jsx|tsx|svelte)$/.test(f)).map((f) => occ(f, null, "Composant")),
    interactions: chercher(dossier, sources.filter((f) => /\.(js|ts)$/.test(f)), /addEventListener\s*\(/, 20),
  };

  const sourceDeDonnees = indices.donnees.length + indices.contenus.length + indices.appelsApi.length > 0;
  let niveau;
  let raison;
  if (indices.generateur.length && !wordpress) [niveau, raison] = [1, "site produit par un outil de création en ligne"];
  else if (wordpress && indices.pageBuilder.length) {
    [niveau, raison] = indices.typesContenus.length || indices.champs.length ? [2, "WordPress, page-builder et contenus dynamiques"] : [1, "WordPress et page-builder, contenus statiques"];
  } else if (wordpress) {
    const complet = indices.typesContenus.length && indices.champs.length && indices.boucles.length && indices.menus.length;
    [niveau, raison] = complet
      ? [5, "thème sur mesure : types de contenus, champs, boucles et menus"]
      : indices.typesContenus.length && indices.champs.length
        ? [4, "thème sur mesure avec types de contenus et champs personnalisés"]
        : [2, "thème WordPress sans types de contenus ni champs personnalisés"];
  } else if (indices.frameworks.length) {
    if (indices.backOffice.length && sourceDeDonnees) [niveau, raison] = [5, "framework avec back-office et source de données"];
    else if (sourceDeDonnees && indices.composants.length >= stack.composantsMin) [niveau, raison] = [4, "framework, source de données et composants"];
    else [niveau, raison] = [2, "framework, contenus statiques"];
  } else {
    [niveau, raison] = indices.interactions.length >= stack.interactionsMin ? [2, "HTML/CSS avec interactions JavaScript"] : [1, "intégration HTML/CSS statique"];
  }
  return { indices, niveau, raison };
};

// ---------- Template et fichiers sensibles ----------

/** Indices d'un thème ou d'un template récupéré : crédits dans le code, en-tête de thème, générateur */
export const indicesTemplate = (dossier, fichiers, pagesEnLigne = []) => {
  const sources = fichiers.filter((f) => !IGNORES.test(f) && /\.(html|css|scss|php|js|astro|vue|md)$/.test(f) && !/readme\.md$/i.test(f));
  const credits = chercher(dossier, sources, template.code, 10);
  const themes = sources
    .filter((f) => path.posix.basename(f) === "style.css")
    .flatMap((f) => chercher(dossier, [f], template.themeWordpress, 3));
  const generateurs = pagesEnLigne.filter((p) => p.generateur && template.generateurs.test(p.generateur)).slice(0, 1).map((p) => occ(p.chemin, null, `meta generator : ${p.generateur}`));
  return [...credits, ...themes, ...generateurs];
};

/** Ce qui n'a rien à faire dans un dépôt public : fichiers et secrets (valeurs masquées) */
export const elementsSensibles = (dossier, fichiers) => {
  const occurrences = [];
  const modules = fichiers.filter((f) => /(^|\/)node_modules\//.test(f));
  if (modules.length) occurrences.push(occ("node_modules/", null, `node_modules versionné (${modules.length} fichiers)`));
  for (const f of fichiers.filter((f) => !/(^|\/)node_modules\//.test(f) && sensibles.fichiers.test(f) && !/\.example$/i.test(f))) {
    occurrences.push(occ(f, null, /\.(sqlite3?|db)$/i.test(f) ? "Base de données versionnée" : /\.(exe|dll)$/i.test(f) ? "Exécutable versionné" : "Fichier de configuration ou de clés versionné"));
  }
  const lisibles = fichiers.filter((f) => !IGNORES.test(f) && sensibles.lisibles.test(f) && !/(package-lock|yarn\.lock|pnpm-lock)/.test(f) && !/\.example$/i.test(f));
  for (const f of lisibles) {
    const texte = lire(dossier, f);
    if (!texte) continue;
    texte.split("\n").forEach((ligne, i) => {
      for (const s of sensibles.secrets) {
        const m = ligne.match(s.motif);
        // Une valeur d'exemple ou lue dans l'environnement n'est pas un secret
        if (!m || /process\.env|import\.meta\.env|your|xxx|changeme|example|<|\$\{/i.test(m[0])) continue;
        const cle = s.nom === "clé ou mot de passe en dur" ? m[1] : s.nom;
        occurrences.push(occ(f, i + 1, `${s.nom} : ${cle} = « … » (valeur masquée)`));
        break;
      }
    });
  }
  return occurrences;
};
