// Kuvert has no login form of its own — an unauthenticated visitor is sent
// to schlussel's hosted login page via a full browser navigation (not a
// client-side route change, since we're leaving the app entirely). This
// builds that URL: schlussel redirects back to return_to with a one-time
// authorization code (PKCE) once the user has signed in, and /auth/callback
// exchanges it for the real token, so the token itself never travels
// through a URL.
import { generateCodeVerifier, generateCodeChallenge } from './pkce'

const DEFAULT_SCHLUSSEL_URL = 'http://localhost:4001'
export const CODE_VERIFIER_STORAGE_KEY = 'pkce_code_verifier'

export async function buildSchluesselLoginUrl(currentPath: string, origin: string = window.location.origin): Promise<string> {
  const schluesselUrl = import.meta.env.VITE_SCHLUSSEL_URL ?? DEFAULT_SCHLUSSEL_URL
  const returnTo = `${origin}/auth/callback?next=${encodeURIComponent(currentPath)}`

  const verifier = generateCodeVerifier()
  sessionStorage.setItem(CODE_VERIFIER_STORAGE_KEY, verifier)
  const challenge = await generateCodeChallenge(verifier)

  const params = new URLSearchParams({
    return_to: returnTo,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })
  return `${schluesselUrl}/login?${params.toString()}`
}
