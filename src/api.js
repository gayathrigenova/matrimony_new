const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
const API_ROOT = (configuredApiUrl || "https://matrimonynew-production.up.railway.app")
  .replace(/\/+$/, "")
  .replace(/\/api$/i, "");

export const API_URL = `${API_ROOT}/api`;

export async function readApiResponse(response) {
  try {
    return await response.json();
  } catch {
    return {
      detail: response.status === 404
        ? "The API route was not found (404). Deploy the latest backend version and try again."
        : `The API returned a non-JSON response (HTTP ${response.status}). Please try again later.`,
    };
  }
}
