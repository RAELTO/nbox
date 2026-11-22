import { useEffect, useRef } from 'react'
import { useAuth } from '../../features/auth/AuthContext'
import { useProfile } from '../../features/profile/useProfile'
import { applyThemeToDocument, DEFAULT_THEME_CONFIG, loadLocalThemeConfig, saveLocalThemeConfig } from '../../lib/theme'

export function TweakPanel() {
  const { user } = useAuth()
  const userId = user?.id
  const { data: profile } = useProfile(userId)
  const prevUserIdRef = useRef<string | undefined>(undefined)
  const lastSynced = useRef<string | null>(null)

  useEffect(() => {
    const local = loadLocalThemeConfig()
    applyThemeToDocument(local)
  }, [])

  useEffect(() => {
    if (prevUserIdRef.current && prevUserIdRef.current !== userId) {
      saveLocalThemeConfig(DEFAULT_THEME_CONFIG)
      lastSynced.current = null
    }
    prevUserIdRef.current = userId
    if (!userId || profile?.id !== userId) return

    const theme = profile.theme_config
    const signature = theme ? JSON.stringify(theme) : null
    if (signature === lastSynced.current) return
    lastSynced.current = signature
    saveLocalThemeConfig(theme ?? DEFAULT_THEME_CONFIG)
  }, [profile, userId])

  return null
}
