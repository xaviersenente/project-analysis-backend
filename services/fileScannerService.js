import Crawler from "simplecrawler";

export const HtmlCrawler = (baseUrl) => {
  return new Promise((resolve, reject) => {
    const crawler = new Crawler(baseUrl);
    crawler.maxDepth = 3; // Limite de profondeur de l'exploration
    crawler.filterByDomain = true; // Limite l'exploration au domaine de base

    const foundUrls = new Set(); // Utiliser un Set pour éviter les doublons

    // Éviter les ressources non-HTML
    crawler.addFetchCondition((queueItem) => {
      return queueItem.url.match(/\.html$/) || queueItem.path.endsWith("/");
    });

    crawler.on("fetchcomplete", (queueItem) => {
      // Normaliser les URLs : convertir les URLs de type / et /index.html en /
      let url = queueItem.url;
      if (url.endsWith("/index.html")) {
        url = url.replace(/\/index\.html$/, "/");
      }
      foundUrls.add(url);
    });

    crawler.on("complete", () => {
      console.log("Exploration terminée.");
      resolve([...foundUrls]); // Résout la promesse avec les URLs uniques trouvées
    });

    crawler.on("fetcherror", (queueItem, response) => {
      console.warn(`Erreur de récupération pour ${queueItem.url}:`, response);
    });

    crawler.on("fetchclienterror", (queueItem, error) => {
      console.warn(`Erreur client pour ${queueItem.url}:`, error);
    });

    crawler.on("crawlerror", (error) => {
      reject(error); // Rejette la promesse en cas d'erreur majeure
    });

    crawler.start(); // Démarre le crawler
  });
};
