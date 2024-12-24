import axios from "axios";

export const getRepositoryFiles = async (repoOwner, repoName) => {
  try {
    const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents`;
    const response = await axios.get(apiUrl);
    return response.data;
  } catch (error) {
    console.error("Error fetching repository files:", error);
    return [];
  }
};
