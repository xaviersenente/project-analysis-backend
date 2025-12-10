// Re-export des services modulaires
export {
  analyzeHTML,
  extractTitleAndImagesFromHTML,
  getCssLinksFromHtml,
} from "./html/htmlAnalyzer.js";
export { analyzeAllPages } from "./html/htmlTagsAnalyzer.js";
export { runLighthouse } from "./html/lighthouseService.js";
export {
  analyzeImages,
  synthesizeImagesAnalysis,
} from "./html/htmlImagesAnalyzer.js";
