// Thin wrapper around @zudar107/schloss-ui's config-driven API client -
// preserves kuvert's own module shape (setAccessToken/getAccessToken/api/
// ApiError) so nothing else in the app needs to change. `apiClient` (the
// raw instance) is also exported so hooks/useAuth.ts can share the exact
// same token state via useAuthProvider's `apiClient` config.
import { createApiClient, ApiError } from '@zudar107/schloss-ui'
import { redirectToLogin } from './loginRedirect'

export { ApiError }

export const apiClient = createApiClient({
  base: '/backend',
  onUnauthorized: () => {
    void redirectToLogin().catch(() => undefined)
  },
})

export const setAccessToken = apiClient.setAccessToken
export const getAccessToken = apiClient.getAccessToken

export const api = {
  get: apiClient.get,
  post: apiClient.post,
  put: apiClient.put,
  delete: apiClient.delete,
}
