/**
 * Étape 1 : récupérer le dépôt d'un étudiant à une version figée.
 *
 * Un clone partiel (--filter=blob:none) par dépôt, gardé en cache : il donne les fichiers,
 * l'historique complet et les tags sans consommer le quota de l'API GitHub.
 * Chaque version analysée est extraite dans son propre dossier (git worktree),
 * ce qui rend une nouvelle analyse de la même version instantanée.
 */
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { createHash } from "crypto";
import { fileURLToPath } from "url";
import thresholds from "../../config/thresholds.js";

const LANGUES = thresholds.sae105.langues;

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Dossier du cache des clones (hors de Git), surchargeable par CACHE_DIR */
export const dossierCache = () =>
  path.resolve(process.env.CACHE_DIR || path.join(__dirname, "../../cache"));

/**
 * Adresse à cloner : un chemin local (tests, dépôt déjà présent), une URL,
 * ou « propriétaire/dépôt » sur GitHub
 */
const adresse = (depot) => {
  if (fs.existsSync(depot)) return `file://${path.resolve(depot)}`;
  if (/^(https?:\/\/|git@)/.test(depot)) return depot;
  if (/^[\w.-]+\/[\w.-]+$/.test(depot)) return `https://github.com/${depot}.git`;
  throw new Error(`Dépôt inaccessible : adresse non reconnue (${depot})`);
};

/** Options de Git ; un jeton GitHub (dépôts privés) ne passe jamais par la ligne de commande affichée */
const optionsGit = () => {
  const jeton = process.env.GITHUB_TOKEN;
  if (!jeton) return [];
  const identifiant = Buffer.from(`x-access-token:${jeton}`).toString("base64");
  return ["-c", `http.https://github.com/.extraHeader=Authorization: Basic ${identifiant}`];
};

const git = async (args, cwd) => {
  const { stdout } = await execFileAsync("git", [...optionsGit(), ...args], {
    cwd,
    timeout: 5 * 60e3,
    maxBuffer: 50 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return stdout.trim();
};

/** Dossier du clone d'un dépôt dans le cache : un nom lisible et un court hachage */
const dossierClone = (depot, cache) => {
  const lisible = depot.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(-60);
  const hachage = createHash("sha1").update(depot).digest("hex").slice(0, 8);
  return path.join(cache, `${lisible}-${hachage}`, "clone");
};

/**
 * Clone partiel du dépôt, ou mise à jour du clone existant
 * @returns {Promise<string>} - Dossier du clone
 */
const cloner = async (depot, cache) => {
  const clone = dossierClone(depot, cache);
  try {
    if (fs.existsSync(path.join(clone, ".git"))) {
      await git(["fetch", "--quiet", "--tags", "--force", "--prune", "origin"], clone);
    } else {
      fs.mkdirSync(path.dirname(clone), { recursive: true });
      await git(["clone", "--quiet", "--filter=blob:none", "--no-checkout", adresse(depot), clone]);
    }
  } catch (error) {
    if (error.message.startsWith("Dépôt inaccessible")) throw error;
    // Le message de Git peut contenir l'adresse, jamais le jeton (passé en en-tête)
    throw new Error(`Dépôt inaccessible : ${error.stderr?.trim().split("\n").pop() || error.message}`);
  }
  return clone;
};

/**
 * La version évaluée : le tag v1 s'il existe, sinon le dernier commit avant la date de rendu
 * @param {string} depot - « propriétaire/dépôt », URL ou chemin local
 * @param {string} dateRendu - Date ISO
 * @returns {Promise<{ ref: string, sha: string, raison: string }>}
 */
export const resoudreVersion = async (depot, dateRendu, { cache = dossierCache() } = {}) => {
  const clone = await cloner(depot, cache);

  const tag = await git(["rev-parse", "-q", "--verify", "refs/tags/v1^{commit}"], clone).catch(() => "");
  if (tag) return { ref: "v1", sha: tag, raison: "tag v1" };

  const tete = await git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], clone).catch(() => "origin/main");
  const branche = tete.replace(/^origin\//, "");
  const sha = await git(["rev-list", "-1", `--before=${dateRendu}`, tete], clone).catch(() => "");
  if (!sha) throw new Error(`Aucun commit avant la date de rendu (${dateRendu}) sur ${branche}`);
  return { ref: branche, sha, raison: "dernier commit avant la date de rendu" };
};

/**
 * Extrait la version dans son propre dossier, réutilisé s'il existe déjà
 * @returns {Promise<string>} - Dossier de la version, avec l'historique Git
 */
export const recuperer = async (depot, sha, { cache = dossierCache() } = {}) => {
  if (!/^[0-9a-f]{7,40}$/.test(sha)) throw new Error(`Version invalide : ${sha}`);
  const clone = dossierClone(depot, cache);
  if (!fs.existsSync(path.join(clone, ".git"))) await cloner(depot, cache);

  const copie = path.join(path.dirname(clone), sha);
  if (!fs.existsSync(copie)) {
    // Les fichiers de cette version sont téléchargés à ce moment (clone partiel)
    await git(["worktree", "add", "--quiet", "--detach", copie, sha], clone);
  }
  return copie;
};

const IGNORES = new Set([".git", "node_modules"]);

/**
 * Racine du site : le dossier contenant index.html le plus proche de la racine du dépôt
 * (les dépôts 2025 ont un dossier src/)
 * @returns {string} - Chemin relatif, « . » pour la racine
 */
export const trouverRacineSite = (dossier) => {
  let niveau = ["."];
  while (niveau.length) {
    const trouve = niveau.find((d) => fs.existsSync(path.join(dossier, d, "index.html")));
    if (trouve) {
      // Site bilingue sans page à la racine (fr/index.html, en/index.html) : la racine est leur parent
      const parent = path.posix.dirname(trouve);
      const langues = [LANGUES.analysee, ...LANGUES.autres];
      const dossiersLangue = langues.filter((l) => fs.existsSync(path.join(dossier, parent, l, "index.html")));
      return langues.includes(path.posix.basename(trouve)) && dossiersLangue.length >= 2 ? parent : trouve;
    }
    niveau = niveau.flatMap((d) =>
      fs
        .readdirSync(path.join(dossier, d), { withFileTypes: true })
        .filter((e) => e.isDirectory() && !IGNORES.has(e.name))
        .map((e) => (d === "." ? e.name : `${d}/${e.name}`))
        .sort()
    );
  }
  throw new Error("Aucune page index.html dans le dépôt");
};
