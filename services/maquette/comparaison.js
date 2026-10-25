/**
 * Comparaison d'un écran de la maquette avec la page relevée en navigateur, à la même largeur.
 *
 * Chaque texte de la maquette est cherché sur la page (sans tenir compte de la casse ni des espaces),
 * parmi les éléments affichés d'abord (un menu fermé vient après) ; trouvé, on compare sa police,
 * sa taille, sa graisse et sa couleur calculées. Un texte absent (contenu réel à la place d'un texte
 * de remplissage, par exemple) est relevé mais ne juge pas le style.
 * Un écart qui corrige l'accessibilité de la maquette est « justifié » : un texte trop petit agrandi
 * jusqu'à la taille lisible, une couleur sans contraste suffisant remplacée par une couleur qui l'atteint.
 * Les couleurs du site absentes de la palette de la maquette sont relevées à part.
 */
import thresholds from "../../config/thresholds.js";

const M = thresholds.sae105.graphique.maquette;

export const normaliserTexte = (texte) =>
  String(texte)
    .normalize("NFC")
    .replace(/[’‘ʼ]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    // « Date: » dans la maquette, « Date » sur le site : la ponctuation finale ne compte pas
    .replace(/\s*[:;,.!?…]+$/, "")
    .toLowerCase();

const rvb = (couleur) => {
  const h = couleur.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};

/** Distance euclidienne en RVB, de 0 (identiques) à 441 (noir et blanc) */
export const distanceCouleur = (a, b) => Math.hypot(...rvb(a).map((v, i) => v - rvb(b)[i]));

const memeCouleur = (a, b) => distanceCouleur(a, b) <= M.couleurDistanceMax;

/** Première famille d'une pile font-family, sans guillemets */
const famille = (pile) => String(pile ?? "").split(",")[0].replace(/["']/g, "").trim().toLowerCase();

/** Rapport de contraste WCAG entre deux couleurs hexadécimales */
const luminance = (couleur) =>
  rvb(couleur)
    .map((v) => v / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
export const contraste = (a, b) => {
  const [clair, sombre] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (clair + 0.05) / (sombre + 0.05);
};

/** L'écart rend le texte plus accessible que dans la maquette */
const justifie = (ecart, maquette, site) => {
  if (ecart.propriete === "taille") return maquette.taille < M.tailleLisiblePx && site.taille > maquette.taille && Math.round(site.taille) <= M.tailleLisiblePx + M.tailleTolerancePx;
  if (ecart.propriete === "couleur" && site.fond) {
    const grand = site.taille >= 24 || (site.taille >= 18.66 && site.graisse >= 700);
    const requis = grand ? 3 : 4.5;
    return contraste(maquette.couleur, site.fond) < requis && contraste(site.couleur, site.fond) >= requis;
  }
  return false;
};

const ecartsDeStyle = (maquette, site) => {
  const ecarts = [];
  if (maquette.police && famille(site.police) !== famille(maquette.police)) {
    ecarts.push({ propriete: "police", maquette: maquette.police, site: famille(site.police) ? String(site.police).split(",")[0].replace(/["']/g, "").trim() : "—" });
  }
  if (maquette.taille && Math.abs(Math.round(site.taille) - Math.round(maquette.taille)) > M.tailleTolerancePx) {
    ecarts.push({ propriete: "taille", maquette: `${Math.round(maquette.taille)} px`, site: `${Math.round(site.taille)} px` });
  }
  if (maquette.graisse && Math.abs(site.graisse - maquette.graisse) > M.graisseTolerance) {
    ecarts.push({ propriete: "graisse", maquette: String(maquette.graisse), site: String(site.graisse) });
  }
  if (maquette.couleur && site.couleur && !memeCouleur(maquette.couleur, site.couleur)) {
    ecarts.push({ propriete: "couleur", maquette: maquette.couleur, site: site.couleur });
  }
  return ecarts;
};

/**
 * @param {{ textes: Array<object> }} ecran - Un écran de extraireEcrans
 * @param {{ textes: Array<object>, couleurs: Array<{ couleur: string, extrait: string }> }} releve - La page à la largeur de l'écran
 * @param {string[]} palette - Couleurs de toute la maquette
 */
export const comparerEcran = (ecran, releve, palette) => {
  // Les textes du site, par contenu ; un exemplaire ne sert qu'une fois, dans l'ordre de la page
  const disponibles = new Map();
  for (const t of [...releve.textes].sort((a, b) => (b.affiche !== false) - (a.affiche !== false))) {
    const cle = normaliserTexte(t.texte);
    disponibles.set(cle, [...(disponibles.get(cle) ?? []), t]);
  }

  const textes = ecran.textes
    .filter((t) => normaliserTexte(t.texte).length >= M.texteMinCaracteres)
    .map((t) => {
      const site = disponibles.get(normaliserTexte(t.texte))?.shift();
      if (!site) return { texte: t.texte, statut: "absent", ecarts: [], justifies: [], extrait: null };
      const tous = ecartsDeStyle(t, site);
      const ecarts = tous.filter((e) => !justifie(e, t, site));
      const justifies = tous.filter((e) => justifie(e, t, site));
      const statut = ecarts.length ? "ecart" : justifies.length ? "justifie" : "conforme";
      return { texte: t.texte, statut, ecarts, justifies, extrait: site.extrait };
    });

  const vues = new Set();
  const couleursHorsMaquette = releve.couleurs.filter(({ couleur }) => {
    if (vues.has(couleur) || palette.some((p) => memeCouleur(p, couleur))) return false;
    vues.add(couleur);
    return true;
  });

  return {
    total: textes.length,
    trouves: textes.filter((t) => t.statut !== "absent").length,
    // Un texte aux écarts justifiés compte comme conforme
    conformes: textes.filter((t) => t.statut === "conforme" || t.statut === "justifie").length,
    justifies: textes.filter((t) => t.statut === "justifie").length,
    textes,
    couleursHorsMaquette,
  };
};
