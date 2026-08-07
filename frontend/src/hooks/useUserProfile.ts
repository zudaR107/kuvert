import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export interface UserProfile {
  id: string
  email: string
  name: string
  currency: string
  weekStart: 'monday' | 'sunday' | null
  dateFormat: 'dmy' | 'mdy' | 'ymd' | null
  timezone: string | null
}

export interface DateFieldPreferences {
  dateFormat: NonNullable<UserProfile['dateFormat']> | undefined
  weekStartsOn: 0 | 1 | undefined
}

export function getDateFieldPreferences(profile: UserProfile | undefined): DateFieldPreferences {
  return {
    dateFormat: profile?.dateFormat ?? undefined,
    weekStartsOn: profile?.weekStart === 'sunday'
      ? 0
      : profile?.weekStart === 'monday' ? 1 : undefined,
  }
}

// Same ['userProfile'] cache key the /settings route's own loader already
// prefetches with - calling this elsewhere in the app shares that one
// cached fetch rather than issuing a second request, and works fine
// even on a page that never visited /settings first (React Query just
// fetches on first use here too).
export function useUserProfile(enabled = true) {
  return useQuery<UserProfile>({
    queryKey: ['userProfile'],
    queryFn: () => api.get('/users/me'),
    enabled,
  })
}
