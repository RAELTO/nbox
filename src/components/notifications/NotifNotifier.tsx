import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../features/auth/AuthContext'

/**
 * Single owner of the Realtime notifications channel.
 * Mounted once in App.tsx to avoid duplicate channel conflicts.
 */
export default function NotifNotifier() {
  const { user } = useAuth()
  const qc = useQueryClient()

  useEffect(() => {
    if (!user?.id) return
    const channel = supabase
      .channel(`notif-notifier:${user.id}:${crypto.randomUUID()}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `recipient_id=eq.${user.id}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['notifications', user.id] })
        qc.invalidateQueries({ queryKey: ['notif-count', user.id] })
      })
      .subscribe()
    return () => {
      void channel.unsubscribe()
      void supabase.removeChannel(channel)
    }
  }, [user?.id, qc])

  return null
}
