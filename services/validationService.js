import axios from "axios";

export const validateHTML = async (htmlContent) => {
  try {
    const response = await axios.post(
      "https://validator.w3.org/nu/?out=json",
      htmlContent,
      {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "User-Agent": "W3C-Validator-Request",
        },
      }
    );

    const { messages } = response.data;

    // Filtrer pour ne garder que les erreurs
    const errors = messages.filter((msg) => msg.type === "error");

    return errors; // Retourne les erreurs et avertissements
  } catch (error) {
    console.error("Error validating HTML:", error);
    return [{ type: "error", message: "Failed to validate HTML" }];
  }
};
