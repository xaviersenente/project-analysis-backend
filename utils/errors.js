/**
 * Classes d'erreurs personnalisées pour une meilleure gestion des erreurs
 * Remplace les erreurs génériques par des erreurs typées et traçables
 */

/**
 * Erreur de base pour toutes les erreurs métier de l'application
 */
class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true; // Erreur opérationnelle (vs erreur de programmation)
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: this.name,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp,
      ...(process.env.NODE_ENV === "development" ? { stack: this.stack } : {}),
    };
  }
}

/**
 * Erreur de validation (400)
 * Utilisée quand les données d'entrée sont invalides
 */
class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, details);
  }
}

/**
 * Erreur d'analyse de fichier (422)
 * Utilisée quand un fichier ne peut pas être analysé
 */
class AnalysisError extends AppError {
  constructor(message, details = null) {
    super(message, 422, details);
  }
}

/**
 * Erreur de fichier non trouvé (404)
 */
class FileNotFoundError extends AppError {
  constructor(filePath) {
    super(`File not found: ${filePath}`, 404, { filePath });
  }
}

/**
 * Erreur de parsing (422)
 * Utilisée quand le parsing CSS/HTML échoue
 */
class ParsingError extends AppError {
  constructor(type, message, details = null) {
    super(`${type} parsing failed: ${message}`, 422, details);
    this.parserType = type;
  }
}

/**
 * Erreur de timeout (408)
 */
class TimeoutError extends AppError {
  constructor(operation, timeout) {
    super(`Operation timeout: ${operation} exceeded ${timeout}ms`, 408, {
      operation,
      timeout,
    });
  }
}

/**
 * Erreur de service externe (502)
 * Utilisée quand un service externe (Lighthouse, validator) échoue
 */
class ExternalServiceError extends AppError {
  constructor(serviceName, message, details = null) {
    super(`External service error (${serviceName}): ${message}`, 502, {
      serviceName,
      ...details,
    });
  }
}

/**
 * Erreur de configuration (500)
 */
class ConfigurationError extends AppError {
  constructor(message, details = null) {
    super(`Configuration error: ${message}`, 500, details);
  }
}

/**
 * Middleware Express de gestion globale des erreurs
 * À placer en dernière position dans l'application Express
 */
function errorHandler(err, req, res, next) {
  // Log l'erreur
  console.error("Error caught by error handler:", {
    name: err.name,
    message: err.message,
    statusCode: err.statusCode,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === "development" ? { stack: err.stack } : {}),
  });

  // Si c'est une erreur opérationnelle connue
  if (err.isOperational) {
    return res.status(err.statusCode).json(err.toJSON());
  }

  // Erreur non gérée (erreur de programmation)
  // Ne pas exposer les détails en production
  if (process.env.NODE_ENV === "production") {
    return res.status(500).json({
      error: "InternalServerError",
      message: "An unexpected error occurred",
      timestamp: new Date().toISOString(),
    });
  }

  // En développement, renvoyer tous les détails
  return res.status(500).json({
    error: err.name || "InternalServerError",
    message: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Wrapper pour les fonctions async dans Express
 * Évite les try-catch répétitifs
 *
 * @example
 * router.get('/analyze', asyncHandler(async (req, res) => {
 *   const result = await analyzeProject(req.body);
 *   res.json(result);
 * }));
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Helper pour créer une erreur avec contexte
 * @param {Error} originalError - Erreur originale
 * @param {string} context - Contexte de l'erreur
 * @param {Object} additionalData - Données supplémentaires
 * @returns {AppError}
 */
function wrapError(originalError, context, additionalData = {}) {
  if (originalError instanceof AppError) {
    return originalError;
  }

  return new AppError(`${context}: ${originalError.message}`, 500, {
    originalError: originalError.message,
    originalStack: originalError.stack,
    ...additionalData,
  });
}

export {
  // Classes d'erreurs
  AppError,
  ValidationError,
  AnalysisError,
  FileNotFoundError,
  ParsingError,
  TimeoutError,
  ExternalServiceError,
  ConfigurationError,

  // Middleware et helpers
  errorHandler,
  asyncHandler,
  wrapError,
};
