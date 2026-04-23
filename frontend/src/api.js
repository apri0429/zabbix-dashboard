const envBase = import.meta.env.VITE_API_BASE;
const envPort = import.meta.env.VITE_API_PORT || "8095";

const browserHost =
  typeof window !== "undefined" && window.location?.hostname
    ? window.location.hostname
    : "localhost";

export const API_BASE =
  envBase && envBase.trim()
    ? envBase.trim().replace(/\/$/, "")
    : `http://${browserHost}:${envPort}`;

export function buildApiUrl(path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
}
