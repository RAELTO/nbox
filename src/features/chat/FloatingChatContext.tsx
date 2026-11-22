import { createContext, use, useCallback, useMemo, useState } from 'react'
import type { ConversationKind } from './conversationTypes'

export interface FloatingChatEntry {
  conversationId: string
  type?: ConversationKind
  title?: string
  otherId: string
  otherName: string
  otherUsername: string
  otherAvatar: string | null
  minimized: boolean
}

interface Ctx {
  chats: FloatingChatEntry[]
  openChat:       (entry: Omit<FloatingChatEntry, 'minimized'>) => void
  closeChat:      (conversationId: string) => void
  toggleMinimize: (conversationId: string) => void
}

const FloatingChatContext = createContext<Ctx>({
  chats: [], openChat: () => {}, closeChat: () => {}, toggleMinimize: () => {},
})

export function FloatingChatProvider({ children }: { children: React.ReactNode }) {
  const [chats, setChats] = useState<FloatingChatEntry[]>([])

  const openChat = useCallback((entry: Omit<FloatingChatEntry, 'minimized'>) => {
    setChats(prev => {
      const exists = prev.find(c => c.conversationId === entry.conversationId)
      if (exists) {
        return prev.map(c => c.conversationId === entry.conversationId ? { ...c, ...entry, minimized: false } : c)
      }
      return [...prev, { ...entry, minimized: false }]
    })
  }, [])

  const closeChat = useCallback((conversationId: string) =>
    setChats(prev => prev.filter(c => c.conversationId !== conversationId)), [])

  const toggleMinimize = useCallback((conversationId: string) =>
    setChats(prev => prev.map(c => c.conversationId === conversationId ? { ...c, minimized: !c.minimized } : c)), [])

  const ctxValue = useMemo(() => ({ chats, openChat, closeChat, toggleMinimize }), [chats, openChat, closeChat, toggleMinimize])

  return (
    <FloatingChatContext.Provider value={ctxValue}>
      {children}
    </FloatingChatContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFloatingChat() {
  return use(FloatingChatContext)
}
