/**
 * API origin for assets and fetches. Empty string = same-origin `/api/*`
 * (proxied to the backend via `next.config.ts` rewrites).
 * Set `NEXT_PUBLIC_API_URL` when frontend and API are served separately without a proxy.
 */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');
