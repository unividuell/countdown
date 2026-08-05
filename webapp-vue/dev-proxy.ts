/**
 * Paths the dev server hands to the backend instead of serving the SPA, as plain prefixes
 * (Vite matches a string proxy key with `url.startsWith(key)`).
 *
 * `/login/` keeps its trailing slash on purpose: `/login` itself is the SPA's sign-in PAGE,
 * only its sub-paths (/login/github, /login/oauth2/code/*) are backend. Without the slash a
 * direct load of http://localhost:5173/login is proxied away and never reaches the router.
 * The prod edge draws the same line with `path /login/*` — see deploy/Caddyfile.
 */
export const backendPathPrefixes = ['/api', '/oauth2', '/login/', '/logout']
