import { Router } from "express";
// import { scanRepository } from "../controllers/analysisControllerGithub.js";
import { scanUrl } from "../controllers/analysisControllerServer.js";
import fs from "fs";
import path from "path";

const router = Router();

// Route pour scanner un repository
//router.get("/:repoOwner/:repoName", scanRepository);

// Route pour scanner un répertoire en ligne
router.get("/", scanUrl);

// Route pour obtenir la liste des projets scannés
router.get("/projects", (req, res) => {
  const dataPath = path.join("data");
  const files = fs
    .readdirSync(dataPath)
    .filter((file) => file.endsWith(".json"));
  const projects = files.map((file) => file.replace(".json", ""));
  res.json(projects);
});

// Route pour récupérer les données d'un projet spécifique
router.get("/project/:projectName", (req, res) => {
  const { projectName } = req.params;
  const filePath = path.join("data", `${projectName}.json`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Project not found" });
  }

  const data = fs.readFileSync(filePath);
  res.json(JSON.parse(data));
});

export default router;
