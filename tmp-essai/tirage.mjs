import { tirerPortions } from "../services/soutenance/tirage.js";
import { fichiersDuDepot } from "../services/source/depotPortfolio.js";
const [dossier, sha, slug, graine] = process.argv.slice(2);
const r = tirerPortions({ dossier, sha, fichiers: fichiersDuDepot(dossier), slug, graine: Number(graine ?? 1) });
console.log(r.graine, r.candidats, "candidats");
for (const t of r.tirages) console.log("---", t.fichier, t.debut + "-" + t.fin, t.langage, "\n" + t.code.split("\n").slice(0, 6).join("\n"));
