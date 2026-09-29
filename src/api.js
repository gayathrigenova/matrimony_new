const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
const API_ROOT = (configuredApiUrl || "https://matrimonynew-production.up.railway.app")
  .replace(/\/+$/, "")
  .replace(/\/api$/i, "");

export const API_URL = `${API_ROOT}/api`;
