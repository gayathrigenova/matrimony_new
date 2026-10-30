const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
const API_ROOT = (configuredApiUrl || "https://matrimonynew-production.up.railway.app")
  .replace(/\/+$/, "")
  .replace(/\/api$/i, "");

export const API_URL = `${API_ROOT}/api`;

export function hasAuthenticatedSession() {
  if (!localStorage.getItem("access_token")) return false;
  try {
    const user = JSON.parse(localStorage.getItem("user") || "null");
    return Boolean(user && typeof user === "object" && user.role);
  } catch {
    return false;
  }
}

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

export async function fetchWithTokenRefresh(url, options = {}) {
  const { authRedirect = "/login", ...requestOptions } = options;
  const sendRequest = (token) => fetch(url, {
    ...requestOptions,
    headers: {
      ...requestOptions.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const response = await sendRequest(localStorage.getItem("access_token"));
  if (response.status !== 401) return response;

  const refreshToken = localStorage.getItem("refresh_token");
  if (!refreshToken) {
    clearAuthentication(authRedirect);
    return response;
  }

  try {
    const refreshResponse = await fetch(`${API_URL}/accounts/token/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh: refreshToken }),
    });
    const refreshed = await readApiResponse(refreshResponse);
    if (!refreshResponse.ok || !refreshed?.access) {
      clearAuthentication(authRedirect);
      return response;
    }

    localStorage.setItem("access_token", refreshed.access);
    return sendRequest(refreshed.access);
  } catch (error) {
    clearAuthentication(authRedirect);
    throw error;
  }
}

function clearAuthentication(redirectPath) {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("user");
  localStorage.removeItem("admin_user");
  window.dispatchEvent(new Event("auth-change"));
  if (window.location.pathname !== redirectPath) {
    window.location.assign(redirectPath);
  }
}
