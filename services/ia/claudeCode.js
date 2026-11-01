/**
 * La voie « Claude Code » : l'IA passe par l'abonnement de l'enseignant, sans clé d'API.
 *
 * Ce fournisseur se présente comme le client de l'API (beta.messages.parse) : les modules
 * evaluer.js et questions.js ne changent pas. Au lieu d'appeler l'API, il :
 * - rend la réponse déjà écrite par Claude Code pour cette demande, validée par le même schéma ;
 * - sinon, note la demande et signale qu'elle attend.
 * Les demandes vont dans <données>/ia/<slug>/demandes.json ; la commande /webscope-ia de Claude Code
 * y répond dans reponses.json ; l'analyse suivante les relit. Tout reste hors de Git.
 *
 * Une demande est identifiée par l'empreinte de ce qui est envoyé (prompt, documents, schéma) :
 * si le dossier de l'étudiant change, la réponse ne correspond plus et la demande revient.
 */
import fs from "fs";
import path from "path";
import { createHash } from "crypto";

export class EnAttenteClaudeCode extends Error {
  constructor() {
    super("En attente de Claude Code : lancez /webscope-ia, puis relancez l'analyse");
    this.name = "EnAttenteClaudeCode";
  }
}

const lireJson = (fichier, defaut) => {
  try {
    return JSON.parse(fs.readFileSync(fichier, "utf-8"));
  } catch {
    return defaut;
  }
};

/**
 * @param {{ dossier: string }} options - <données>/ia/<slug>
 * @returns {{ modele: string, beta: object, enregistrer: () => { enAttente: number } }}
 */
export const creerClientClaudeCode = ({ dossier }) => {
  const reponses = lireJson(path.join(dossier, "reponses.json"), {}).reponses ?? {};
  const demandes = [];
  return {
    modele: "Claude Code",
    beta: {
      messages: {
        parse: async (params) => {
          const format = params.output_config.format;
          const cle = createHash("sha256")
            .update(JSON.stringify({ systeme: params.system, consigne: params.messages, schema: format.schema }))
            .digest("hex")
            .slice(0, 16);
          const ecrite = reponses[cle];
          if (ecrite) {
            // Le même schéma que pour l'API : un niveau hors échelle, un champ manquant sont refusés
            const parsed_output = format.parse(JSON.stringify(ecrite.reponse));
            return { stop_reason: "end_turn", parsed_output, model: `Claude Code · ${ecrite.modele ?? "modèle non précisé"}` };
          }
          demandes.push({ cle, systeme: params.system, consigne: params.messages[0].content, schema: format.schema });
          throw new EnAttenteClaudeCode();
        },
      },
    },
    /** Écrit les demandes en attente (le fichier est vidé quand tout a sa réponse) */
    enregistrer: () => {
      fs.mkdirSync(dossier, { recursive: true });
      fs.writeFileSync(path.join(dossier, "demandes.json"), JSON.stringify({ genereLe: new Date().toISOString(), demandes }, null, 2));
      return { enAttente: demandes.length };
    },
  };
};
