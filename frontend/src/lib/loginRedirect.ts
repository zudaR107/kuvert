import { buildSchluesselLoginUrl } from './authRedirect'

let loginRedirect: Promise<void> | null = null

export function redirectToLogin(): Promise<void> {
  if (loginRedirect) return loginRedirect

  const returnTo = window.location.pathname + window.location.search
  const attempt = buildSchluesselLoginUrl(returnTo).then((url) => {
    window.location.href = url
  })
  loginRedirect = attempt
  void attempt.catch(() => {
    if (loginRedirect === attempt) loginRedirect = null
  })
  return attempt
}
