/**
 * Base URL for the off-chain API (offchain/server.py).
 *
 * Empty string in dev, so requests stay same-origin relative paths and Vite's
 * `/api` proxy (vite.config.ts) forwards them to localhost:3001. In a deployed
 * build the frontend and API are separate origins, so VITE_API_URL is baked in
 * at build time and requests go cross-origin — server.py already sends
 * Access-Control-Allow-Origin.
 */
const RAW_BASE = import.meta.env.VITE_API_URL ?? "";

// Tolerate a trailing slash in the configured value so we never emit `//api`.
export const API_BASE = RAW_BASE.replace(/\/+$/, "");

/** Builds a full URL for an API path such as `/api/offers`. */
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}
