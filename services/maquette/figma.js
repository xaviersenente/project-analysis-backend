/**
 * Lecture de la maquette Figma par l'API REST, à la version enregistrée avant la date de rendu.
 *
 * Le jeton vient de FIGMA_TOKEN (scopes « File content » et « File versions » en lecture).
 * Le contenu d'une version ne change jamais : il est gardé dans <cache>/figma/ pour ne pas
 * consommer le quota de l'API à chaque analyse (même logique que figma-sessions).
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";
import thresholds from "../../config/thresholds.js";

const API = "https://api.figma.com/v1";
const DELAI = thresholds.performance.timeouts.default;

/** Clé du fichier dans un lien Figma (design, file, proto) ; null sinon */
export const cleFigma = (url) => String(url ?? "").match(/figma\.com\/(?:file|design|proto)\/([a-zA-Z0-9]{10,})/)?.[1] ?? null;

/** La dernière version enregistrée avant la date de rendu ; null si le fichier est plus récent */
export const choisirVersion = (versions, dateRendu) => {
  const limite = new Date(dateRendu).getTime();
  return (
    versions
      .filter((v) => new Date(v.created_at).getTime() <= limite)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] ?? null
  );
};

const appeler = async (url, reponse = "json") => {
  const jeton = process.env.FIGMA_TOKEN;
  if (!jeton) throw new Error("Jeton Figma absent (FIGMA_TOKEN dans .env)");
  const res = await fetch(url, { headers: { "X-Figma-Token": jeton }, signal: AbortSignal.timeout(DELAI * 4) });
  if (res.status === 403 || res.status === 404) throw new Error(`Maquette Figma inaccessible (${res.status}) : le fichier doit être partagé avec le compte du jeton`);
  if (res.status === 429) throw new Error("Quota de l'API Figma atteint, à réessayer plus tard");
  if (!res.ok) throw new Error(`API Figma : ${res.status} ${res.statusText}`);
  return reponse === "json" ? res.json() : Buffer.from(await res.arrayBuffer());
};

const lireVersions = async (cle) => {
  const versions = [];
  // Les versions arrivent de la plus récente à la plus ancienne, par pages de 50
  let url = `${API}/files/${cle}/versions?page_size=50`;
  for (let page = 0; url && page < 100; page++) {
    const donnees = await appeler(url);
    const nouvelles = (donnees.versions ?? []).filter((v) => !versions.some((x) => x.id === v.id));
    if (!nouvelles.length) break;
    versions.push(...nouvelles);
    url = donnees.pagination?.next_page;
  }
  return versions;
};

/** Contenu JSON d'une version, ou image PNG d'un écran : lu dans le cache s'il y est */
const enCache = async (fichier, lire) => {
  if (fs.existsSync(fichier)) return fs.readFileSync(fichier);
  const contenu = await lire();
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  fs.writeFileSync(fichier, contenu);
  return contenu;
};

/**
 * @param {object} options
 * @param {string} options.url - Lien vers le fichier Figma
 * @param {string} options.dateRendu - Date ISO
 * @param {string} options.cache - Dossier du cache
 * @returns {Promise<{ cle: string, url: string, version: { id: string, date: string }, fichier: object }>}
 */
export const lireMaquette = async ({ url, dateRendu, cache }) => {
  const cle = cleFigma(url);
  if (!cle) throw new Error("Le lien de la maquette n'est pas un lien vers un fichier Figma");
  const version = choisirVersion(await lireVersions(cle), dateRendu);
  if (!version) throw new Error("Aucune version de la maquette enregistrée avant la date de rendu");
  const brut = await enCache(path.join(cache, "figma", `${cle}-${version.id}.json`), async () =>
    JSON.stringify(await appeler(`${API}/files/${cle}?version=${version.id}`))
  );
  return { cle, url, version: { id: version.id, date: version.created_at }, fichier: JSON.parse(brut) };
};

/**
 * Images des écrans, exportées par Figma à la même version, en WebP
 * @param {{ cle: string, version: { id: string } }} maquette
 * @param {string[]} ids - Identifiants des cadres
 * @param {string} cache
 * @returns {Promise<Map<string, Buffer>>} - Une image WebP par cadre exporté
 */
export const exporterEcrans = async (maquette, ids, cache) => {
  const { qualite, hauteurMaxPx } = thresholds.sae105.graphique.maquette.captures;
  const images = new Map();
  if (!ids.length) return images;
  const manquants = ids.filter((id) => !fs.existsSync(cheminImage(maquette, id, cache)));
  if (manquants.length) {
    const { images: liens } = await appeler(`${API}/images/${maquette.cle}?ids=${encodeURIComponent(manquants.join(","))}&format=png&scale=1&version=${maquette.version.id}`);
    for (const id of manquants) if (liens?.[id]) await enCache(cheminImage(maquette, id, cache), () => appeler(liens[id], "image"));
  }
  for (const id of ids) {
    const png = cheminImage(maquette, id, cache);
    if (!fs.existsSync(png)) continue;
    const { width, height } = await sharp(png).metadata();
    images.set(id, await sharp(png).extract({ left: 0, top: 0, width, height: Math.min(height, hauteurMaxPx) }).webp({ quality: qualite }).toBuffer());
  }
  return images;
};

const cheminImage = (maquette, id, cache) => path.join(cache, "figma", `${maquette.cle}-${maquette.version.id}-${id.replace(/[^\w-]/g, "-")}.png`);
