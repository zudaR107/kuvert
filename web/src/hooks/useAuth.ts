// Thin wrapper around @zudar107/schloss-ui's config-driven auth hook -
// preserves kuvert's own module shape (AuthContext/useAuth/useAuthProvider/
// AuthUser) so nothing else in the app needs to change.
import { AuthContext, useAuth, useAuthProvider as useSharedAuthProvider } from '@zudar107/schloss-ui'
import type { AuthUser, AuthState } from '@zudar107/schloss-ui'
import { apiClient } from '../lib/api'

export type { AuthUser }
export { AuthContext, useAuth }

export function useAuthProvider(): AuthState {
  return useSharedAuthProvider({ apiClient })
}
