// Kuvert has no login form of its own — an unauthenticated visitor is sent
// to schlussel's hosted login page via a full browser navigation (not a
// client-side route change, since we're leaving the app entirely). This
// builds that URL: schlussel redirects back to return_to with the token in
// the hash once the user has signed in.
const DEFAULT_SCHLUSSEL_URL = 'http://localhost:4001'

export function buildSchluesselLoginUrl(currentPath: string, origin: string = window.location.origin): string {
  const schluesselUrl = import.meta.env.VITE_SCHLUSSEL_URL ?? DEFAULT_SCHLUSSEL_URL
  const returnTo = `${origin}/auth/callback?next=${encodeURIComponent(currentPath)}`
  return `${schluesselUrl}/login?return_to=${encodeURIComponent(returnTo)}`
}
