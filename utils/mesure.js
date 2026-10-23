/**
 * Suivi des étapes d'une analyse (F4)
 * Une étape qui échoue ne fait pas tout échouer : elle rend null,
 * et sa raison est inscrite dans la liste « nonMesurable » du résultat.
 */
export const creerSuivi = () => {
  const nonMesurable = [];

  /**
   * Exécute une étape ; en cas d'échec, la note « Non mesurable »
   * @param {string} etape - Nom de l'étape, affiché dans le résultat
   * @param {Function} fn - Fonction de l'étape (synchrone ou asynchrone)
   * @returns {Promise<*|null>} - Le résultat de l'étape, ou null
   */
  const mesurer = async (etape, fn) => {
    try {
      return await fn();
    } catch (error) {
      console.error(`⚠️ ${etape} : non mesurable (${error.message})`);
      nonMesurable.push({ etape, raison: error.message });
      return null;
    }
  };

  /**
   * Note une étape non mesurable sans l'exécuter
   */
  const noter = (etape, raison) => {
    nonMesurable.push({ etape, raison });
  };

  return { nonMesurable, mesurer, noter };
};
