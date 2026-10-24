/**
 * Étape 7 : l'historique Git de la version évaluée, et la timeline (M10).
 *
 * `git log --numstat` sur le clone donne chaque commit ; l'outil en déduit les sessions,
 * les indicateurs et les drapeaux. La timeline suit la date d'auteur (le moment où le
 * travail a été fait) : une date de commit très différente signale un historique retouché.
 * Un commit ne mesure pas du temps : ce sont des estimations.
 */
import { execFileSync } from "child_process";
import thresholds from "../../config/thresholds.js";

const T = thresholds.sae105.methodologie.timeline;
const GENERIQUES = thresholds.sae105.methodologie.messagesGeneriques;
const SEP = "\x1f";
const DEBUT = "\x1e";

const git = (dossier, args) =>
  execFileSync("git", ["-C", dossier, ...args], { maxBuffer: 50 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }).toString();

/** Jour calendaire à Paris, pour compter les jours actifs */
const jourParis = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" });

/** Les commits jusqu'à la version évaluée, du plus ancien au plus récent */
const lireCommits = (dossier, sha) => {
  const format = `${DEBUT}%H${SEP}%an${SEP}%ae${SEP}%aI${SEP}%cI${SEP}%s`;
  return git(dossier, ["log", "--reverse", "--numstat", `--format=${format}`, sha])
    .split(DEBUT)
    .filter((bloc) => bloc.trim())
    .map((bloc) => {
      const [entete, ...stats] = bloc.split("\n");
      const [sha, auteur, email, dateAuteur, dateCommit, message] = entete.split(SEP);
      let ajouts = 0;
      let suppressions = 0;
      let fichiers = 0;
      for (const ligne of stats.filter(Boolean)) {
        const [a, s] = ligne.split("\t");
        fichiers++;
        // « - » : fichier binaire, sans lignes
        ajouts += Number(a) || 0;
        suppressions += Number(s) || 0;
      }
      return { sha, auteur, email: email.toLowerCase(), dateAuteur, dateCommit, message, ajouts, suppressions, fichiers };
    });
};

/** Les tags, avec le commit qu'ils désignent (tags annotés compris) */
const lireTags = (dossier) =>
  git(dossier, ["for-each-ref", "refs/tags", `--format=%(refname:short)${SEP}%(objectname)${SEP}%(*objectname)${SEP}%(creatordate:iso-strict)`])
    .split("\n")
    .filter(Boolean)
    .map((ligne) => {
      const [nom, objet, cible, date] = ligne.split(SEP);
      return { nom, sha: cible || objet, date };
    });

const temps = (date) => new Date(date).getTime();

/**
 * @param {object} options
 * @param {string} options.dossier - Clone du dépôt (avec son historique)
 * @param {string} options.sha - Version évaluée
 * @param {string} options.dateRendu - Date ISO
 * @param {string} [options.emailEtudiant] - Adresse de l'étudiant (fichier de promo) ;
 *   sinon, l'auteur principal est celui qui a fait le plus de commits
 */
export const lireHistorique = ({ dossier, sha, dateRendu, emailEtudiant = null }) => {
  const bruts = lireCommits(dossier, sha);
  if (bruts.length === 0) throw new Error("Aucun commit dans l'historique");

  const parEmail = new Map();
  for (const c of bruts) parEmail.set(c.email, (parEmail.get(c.email) ?? 0) + 1);
  const principal = emailEtudiant?.toLowerCase() ?? [...parEmail.entries()].sort((a, b) => b[1] - a[1])[0][0];

  const commits = bruts.map(({ email, ...c }) => {
    const drapeaux = [];
    if (GENERIQUES.test(c.message.trim())) drapeaux.push("message-generique");
    if (Math.abs(temps(c.dateCommit) - temps(c.dateAuteur)) > T.datesDivergentesH * 3600e3) drapeaux.push("dates-divergentes");
    if (email !== principal) drapeaux.push("autre-auteur");
    return { ...c, drapeaux };
  });

  // Sessions : dans l'ordre du travail (date d'auteur) ; une pause de plus de 2 h en ouvre une nouvelle
  const chronologie = [...commits].sort((a, b) => temps(a.dateAuteur) - temps(b.dateAuteur));
  const sessions = [];
  for (const c of chronologie) {
    const derniere = sessions.at(-1);
    if (derniere && temps(c.dateAuteur) - temps(derniere.fin) <= T.pauseSessionH * 3600e3) {
      derniere.fin = c.dateAuteur;
      derniere.commits++;
    } else {
      sessions.push({ debut: c.dateAuteur, fin: c.dateAuteur, commits: 1 });
    }
  }

  const lignes = (c) => c.ajouts + c.suppressions;
  const total = commits.reduce((s, c) => s + lignes(c), 0);
  const limite = temps(dateRendu) - 48 * 3600e3;
  const dernieres48h = commits.filter((c) => temps(c.dateAuteur) > limite && temps(c.dateAuteur) <= temps(dateRendu)).reduce((s, c) => s + lignes(c), 0);
  const premier = temps(chronologie[0].dateAuteur);
  const dernier = temps(chronologie.at(-1).dateAuteur);

  return {
    dateRendu,
    seuils: { sessionsMin: T.sessionsMin, joursMin: T.joursMin, partDernieres48hMax: T.partDernieres48hMax },
    indicateurs: {
      commits: commits.length,
      sessions: sessions.length,
      joursActifs: new Set(commits.map((c) => jourParis.format(new Date(c.dateAuteur)))).size,
      dureeProjetJours: Math.round(((dernier - premier) / 864e5) * 10) / 10,
      dureeEstimeeMinutes: Math.round(
        sessions.reduce((s, x) => s + (temps(x.fin) - temps(x.debut)) / 60e3 + T.forfaitSessionMin, 0)
      ),
      partDernieres48h: total ? Math.round((dernieres48h / total) * 100) / 100 : 0,
      plusGrosCommit: Math.max(...commits.map(lignes)),
      commitsAutreAuteur: commits.filter((c) => c.drapeaux.includes("autre-auteur")).length,
    },
    sessions,
    commits,
    tags: lireTags(dossier),
  };
};
