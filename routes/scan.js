import { Router } from "express";
// import { scanRepository } from "../controllers/analysisControllerGithub.js";
import { scanUrl } from "../controllers/analysisControllerServer.js";
import fs from "fs";
import {
  chargerPromo,
  cheminResultat,
  trouverProjet,
} from "../services/promo/promoService.js";
import { asyncHandler, FileNotFoundError } from "../utils/errors.js";

const router = Router();

// Route pour scanner un repository
//router.get("/:repoOwner/:repoName", scanRepository);

// Route pour analyser un projet de la promo : POST { slug } (S3)
router.post("/", asyncHandler(scanUrl));

// Route pour obtenir la liste des projets de la promo
router.get(
  "/projects",
  asyncHandler(async (req, res) => {
    const projets = chargerPromo().projets.map(({ slug, nom, groupe }) => ({
      slug,
      nom,
      groupe,
      analyse: fs.existsSync(cheminResultat(slug)),
    }));
    res.json(projets);
  })
);

// Route pour récupérer les données d'un projet spécifique
router.get(
  "/project/:slug",
  asyncHandler(async (req, res) => {
    const { slug } = req.params;
    const filePath = cheminResultat(slug);

    if (!trouverProjet(slug) || !fs.existsSync(filePath)) {
      throw new FileNotFoundError(slug);
    }

    res.json(JSON.parse(fs.readFileSync(filePath, "utf-8")));
  })
);

export default router;
