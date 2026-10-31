/**
 * Lot 4 : la portion de code tirée au sort pour la soutenance (sujet §7).
 *
 * Le tirage porte sur le code écrit par l'étudiant (fichiers modifiés par ses commits, hors
 * bibliothèques, code généré et configuration), découpé en blocs de lignes consécutives.
 * Il est reproductible : la même graine sur la même version donne les mêmes portions,
 * et la graine figure dans le résultat pour que le jury, ou l'étudiant, puisse le vérifier.
 */
import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { execFileSync } from "child_process";
import thresholds from "../../config/thresholds.js";

const R = thresholds.portfolio.soutenance;

/** Générateur pseudo-aléatoire déterministe (mulberry32), à partir d'un texte */
export const generateur = (texte) => {
  let etat = createHash("sha256").update(texte).digest().readUInt32LE(0);
  return () => {
    etat = (etat + 0x6d2b79f5) >>> 0;
    let t = etat;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** L'adresse de l'auteur principal : celle qui a fait le plus de commits (hors robots) */
export const auteurPrincipal = (dossier, sha) => {
  const comptes = new Map();
  for (const email of execFileSync("git", ["-C", dossier, "log", "--format=%ae", sha], { stdio: ["ignore", "pipe", "ignore"] }).toString().split("\n").filter(Boolean)) {
    if (!/\[bot\]|noreply@github\.com$/i.test(email)) comptes.set(email, (comptes.get(email) ?? 0) + 1);
  }
  return [...comptes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

/** Les fichiers que l'étudiant a modifiés dans ses commits, jusqu'à la version évaluée */
export const fichiersDeLEtudiant = (dossier, sha, email) => {
  const args = ["-C", dossier, "log", "--format=", "--name-only", ...(email ? [`--author=${email}`] : []), sha];
  return new Set(execFileSync("git", args, { maxBuffer: 50 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }).toString().split("\n").filter(Boolean));
};

/**
 * Les blocs d'un fichier : des fenêtres de R.lignes lignes, qui commencent après une ligne vide
 * quand c'est possible (le début d'une règle, d'une fonction, d'un élément)
 */
export const blocs = (texte) => {
  const lignes = texte.split("\n");
  const trouves = [];
  let debut = 0;
  while (debut < lignes.length) {
    const fin = Math.min(debut + R.lignes, lignes.length);
    const contenu = lignes.slice(debut, fin);
    const utiles = contenu.filter((l) => !R.inutiles.test(l)).length;
    if (utiles >= R.lignesUtilesMin) trouves.push({ debut: debut + 1, fin, code: contenu.join("\n"), utiles });
    // Le bloc suivant commence à la première ligne vide de la seconde moitié, sinon juste après
    let suivant = fin;
    for (let i = fin - 1; i > debut + R.lignes / 2; i--) {
      if (lignes[i].trim() === "") {
        suivant = i + 1;
        break;
      }
    }
    debut = suivant;
  }
  return trouves;
};

const LANGAGES = { astro: "astro", vue: "vue", jsx: "jsx", tsx: "tsx", svelte: "svelte", js: "javascript", mjs: "javascript", ts: "typescript", php: "php", css: "css", scss: "scss", html: "html", twig: "twig" };

/**
 * @param {object} options
 * @param {string} options.dossier - La version évaluée du dépôt
 * @param {string} options.sha
 * @param {string[]} options.fichiers - Fichiers suivis par Git
 * @param {string} options.slug
 * @param {string|null} [options.email] - L'étudiant ; sans lui, l'auteur principal du dépôt
 * @param {number} [options.graine] - Numéro du tirage : en changer donne d'autres portions
 * @returns {{ graine: string, candidats: number, tirages: Array<{ fichier, debut, fin, langage, code }> }}
 */
export const tirerPortions = ({ dossier, sha, fichiers, slug, email = null, graine = 1 }) => {
  const auteur = email ?? auteurPrincipal(dossier, sha);
  const siens = auteur ? fichiersDeLEtudiant(dossier, sha, auteur) : null;
  const candidats = fichiers
    .filter((f) => R.sources.test(f) && !R.exclus.test(f) && (!siens || siens.has(f)))
    .sort()
    .flatMap((fichier) => {
      let texte;
      try {
        texte = fs.readFileSync(path.join(dossier, fichier), "utf-8");
      } catch {
        return [];
      }
      return blocs(texte).map((b) => ({ fichier, ...b }));
    });

  // La graine affichée : de quoi refaire le tirage à l'identique
  const texteGraine = `${slug}·${sha.slice(0, 7)}·${graine}`;
  const aleatoire = generateur(texteGraine);
  const restants = [...candidats];
  const tirages = [];
  const fichiersTires = new Set();
  while (tirages.length < R.tirages && restants.length) {
    // Des fichiers différents tant qu'il en reste
    const pool = restants.filter((c) => !fichiersTires.has(c.fichier));
    const source = pool.length ? pool : restants;
    const choisi = source[Math.floor(aleatoire() * source.length)];
    restants.splice(restants.indexOf(choisi), 1);
    fichiersTires.add(choisi.fichier);
    tirages.push({ fichier: choisi.fichier, debut: choisi.debut, fin: choisi.fin, langage: LANGAGES[path.extname(choisi.fichier).slice(1).toLowerCase()] ?? "texte", code: choisi.code });
  }
  return { graine: texteGraine, candidats: candidats.length, tirages };
};
