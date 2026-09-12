import { useNavigate } from 'react-router-dom'
import { useFloatingChat, type FloatingChatEntry } from './FloatingChatContext'

/**
 * En desktop abre el panel flotante.
 * En móvil/tablet (≤820px) navega al hilo de /nbox en su lugar.
 * Usar este hook en todos los call sites de openChat del usuario.
 */
export function useOpenChat() {
  const { openChat } = useFloatingChat()
  const navigate = useNavigate()

  return function open(entry: Omit<FloatingChatEntry, 'minimized'>) {
    if (window.innerWidth <= 820) {
      navigate(`/nbox?c=${entry.conversationId}`)
    } else {
      openChat(entry)
    }
  }
}
