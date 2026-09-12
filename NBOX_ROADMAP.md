# NBOX Roadmap

## Vision

NBOX (Neo Brutal Box) es una plataforma social con identidad neobrutalista fuerte. No es un blog ni una red social generica: es una experiencia modular, visual y directa donde las publicaciones se llaman Boxes y publicar se llama Drop.

> Neo Brutal Box: a brutal social space for posts, people, and messages.

**Stack:** React 19 · TypeScript · Vite 8 · Tailwind CSS 4 · Supabase · TanStack Query v5 · React Router v7 · Lucide React · Zod · React Hook Form

---

## Estado actual — Septiembre 2026

> El roadmap original quedó desactualizado. Este documento refleja el estado real del proyecto.

---

## ✅ COMPLETADO

### Infraestructura
- [x] RLS correcto en todas las tablas; policies admin; `is_banned` enforced en DB
- [x] Supply-chain security: `.npmrc` con `min-release-age=7`
- [x] Auth completo: sign in / sign up / password recovery / email confirmation
- [x] Rutas protegidas (`RequireAuth`), redirect `?next=`
- [x] Validación de env vars en `supabase.ts`
- [x] Migraciones ordenadas en `supabase/migrations/`

### Layout y shell
- [x] AppShell 3 columnas (LeftSidebar | content | RightSidebar)
- [x] LeftSidebar: profile snippet, nav links, contacts list (tablet), sign out con confirm
- [x] RightSidebar: trending tags, suggested contacts, presence indicators
- [x] Header: brand NBOX, search global, notificaciones dropdown, avatar, Drop button
- [x] Mobile bottom bar (≤820px): Home / Explore / Drop / Notifs / Yo
- [x] `/yo` MenuPage: acceso rápido a Saved, Contacts, Groups (stub)
- [x] Responsive full (mobile ≤600 / tablet ≤960 / desktop >960)
- [x] Fondo vectorial repetible con doodles propios de NBOX, adaptable a paletas y modo oscuro

### Drops (boxes)
- [x] 6 tipos: Quick · Media · Poll · Mood · Link · Thread
- [x] DropModal: selector de tipo + formulario por tipo
- [x] ComposerCard en feed
- [x] ModeSelector: For You | Following | Fresh | Loud
- [x] BoxCard: head (avatar, nombre, @user, tiempo, admin badge, menú), body por tipo, tags, stats, actions
- [x] Votos (like/dislike) separados de reacciones emoji
- [x] Reacciones emoji: ❤️ 😆 😮 😢 😠 (popover)
- [x] Comentarios (CRUD, con votos y reacciones propios)
- [x] Share modal: share to feed, copy link, WhatsApp
- [x] Save / unsave (toggle desde el menú del card)
- [x] Delete propio drop (con confirm dialog)
- [x] Delete admin de cualquier drop/comentario
- [x] Poll voting interactivo y persistente por usuario (porcentajes + cambio/eliminación de voto)
- [x] StoriesRail decorativo (sin backend)

### Interacciones unificadas
- [x] ActivityModal unificado: tabs All / Likes / Reactions, admin badge, usado en BoxCard y comments
- [x] CommentItem: reacciones emoji sin like/dislike (esos van inline), confirm en delete
- [x] ConfirmDialog global (`useConfirm`) — cubre delete box, delete comment, unsave, remove contact, sign out

### Saved
- [x] SavedPage: sidebar (desktop), mobile layout con back + tabs filtro + collections stub
- [x] SavedCard: thumbnail, To collection, Share, menú 3-dots (Remove from saved)
- [x] SavedPostModal: compact box preview, comentarios, votos/reacciones al drop, activity count

### Contacts
- [x] Contact requests: send, accept, decline, cancel
- [x] Contacts list con presencia online/offline
- [x] ContactsPage: tabs Received / Sent / Suggestions / All contacts
- [x] Suggested contacts (basado en follows mutuos)
- [x] Chat directo desde contacto (FloatingChatPanel)

### Inbox / Chat
- [x] InboxPage: lista de conversaciones + thread activo
- [x] Búsqueda local de conversaciones por nombre
- [x] Indicador de conversación leída/no leída mediante `conversation_participants.last_read_at`
- [x] Mensajes realtime (Supabase Realtime)
- [x] FloatingChatPanel: hasta 3 ventanas simultáneas ancladas a la derecha
- [x] MessageNotifier: notif de nuevo mensaje en cualquier página

### Notifications
- [x] Triggers Postgres generan notificaciones (box_reactions, box_votes, box_comments, follows, contact_requests, box_shares)
- [x] NotificationsPage con filtros (All / Unread / Contacts / Reactions / Votes / Comments / Shares)
- [x] NotificationsDropdown en header
- [x] NotifNotifier: badge realtime en cualquier página

### Profiles
- [x] UserProfilePage pública: avatar, display name, @username, bio, boxes del usuario
- [x] Follow / Unfollow desde perfil ajeno y Contacts
- [x] Estadísticas exactas de Drops, Followers y Following
- [x] Feed Following conectado al grafo social real
- [x] ProfilePage propia (`/my-box`): editar avatar, nombre, username, bio
- [x] Admin badge visible en perfil y en feed

### Explore / Search
- [x] Búsqueda global de boxes y personas
- [x] SearchPeopleResults con botón Add contact / Message
- [x] TagPage: feed de boxes por tag
- [x] RightSidebar: trending tags dinámicos

### Admin
- [x] Rol admin (`profiles.role = 'admin'`)
- [x] AdminBadge en todas las superficies
- [x] Policies DB: admin puede borrar cualquier box y comentario
- [x] `useIsAdmin` hook en frontend

---

## 🔶 PARCIALMENTE COMPLETADO

### Perfil de usuario
- [x] Ver boxes propias en perfil público
- [ ] Tabs en perfil: Boxes | Media | Saves | About
- [ ] Pinned box en perfil
- [ ] Sección "About" con links y fecha de unión

### Inbox
- [ ] Adjuntos, emojis, llamadas — stubs "coming soon"

### Notas de voz en chat — fase directa completada
- [x] Definir arquitectura: audio en Storage privado, metadatos en Postgres y borrador local
- [x] Crear `message_attachments`, bucket privado `chat-media`, límites MIME/tamaño y RLS por participante
- [x] Implementar grabación web con detección de formato, temporizador, cancelar y previsualización
- [x] Implementar subida, mensaje `voice`, reproducción bajo demanda y limpieza ante errores
- [x] Obligar la publicación por RPC atómico validado; impedir inserciones directas de audio y mantener el privilegio fuera del esquema público
- [x] Integrar el flujo compartido en Inbox y chat flotante sin duplicar lógica
- [x] Verificar accesibilidad y responsive en desktop, tablet y móvil con Playwright
- [x] Evitar solicitudes de micrófono concurrentes por taps rápidos y cancelar respuestas obsoletas al cerrar o cambiar de chat
- [ ] Revalidar manualmente permiso, grabación y reproducción en Chrome Android con el build corregido
- [ ] Validar manualmente micrófono y reproducción en navegadores/dispositivos reales adicionales

#### Fase siguiente — políticas para deshabilitar notas de voz
- [x] Preferencia global del usuario para recibir notas de voz
- [x] Excepción por conversación: `inherit | allow | block`
- [x] En chat directo, validar antes de grabar y antes de subir; cancelar sin subir si el destinatario las bloqueó
- [x] Mostrar al remitente un aviso local: el destinatario deshabilitó las notas para ese chat
- [x] Revalidar atómicamente al publicar y limpiar el archivo si la preferencia cambió durante el envío
- [x] Mantener en chat directo la precedencia: excepción personal → preferencia global → permitir
- [x] Probar bloqueo, continuidad del texto, preferencias, carreras y UI accesible en cinco viewports con Playwright
- [ ] En grupos, permitir únicamente a administradores deshabilitar el envío para todo el grupo
- [ ] En grupos, permitir bloqueo personal: mostrar placeholder y no descargar el audio para ese miembro
- [ ] Registrar cambios administrativos como eventos de sistema protegidos contra suplantación
- [ ] Extender a grupos la precedencia: bloqueo administrativo → excepción personal → preferencia global → permitir

**Contrato vigente para chats directos:** la preferencia de la persona receptora decide si admite audio. La excepción del chat puede heredar, permitir o bloquear y prevalece sobre el valor global. El remitente consulta antes de abrir el micrófono y vuelve a consultar antes de subir; la RPC revalida bajo bloqueo transaccional para cerrar carreras. Si la preferencia cambia después de subir, la publicación se rechaza, el objeto se elimina y el borrador local se conserva. Los mensajes de texto permanecen disponibles en todos los casos.

### Notificaciones
- [x] Persistencia de lectura individual y masiva en `read_at`
- [ ] Sustituir el auto-read al abrir por acciones explícitas "Mark read" y "Mark all read"
- [ ] Menciones `@usuario` en boxes y comentarios

### Saved
- [ ] Collections backend — tabla + UI completa (actualmente "coming soon")

### Feed modes
- [ ] Ranking real para `For You`
- [ ] Ranking por engagement para `Loud` (actualmente equivale a `Fresh`)

---

## 🔲 PENDIENTE

### English migration (TODO.md)
- [x] UI de producto migrada a inglés
- [ ] Limpiar comentarios internos en español y actualizar/eliminar el inventario histórico de `TODO.md`

### Follows
- [x] Botón Follow / Unfollow en `UserProfilePage` y Contacts
- [x] Feed "Following" basado en datos reales
- [x] Followers / Following count expuestos en perfil

### Admin panel
- [ ] Página `/admin` protegida por rol
- [ ] Listar usuarios + ban/unban
- [ ] Ver reportes
- [ ] Métricas básicas (boxes/día, usuarios activos)

### Moderación
- [ ] Reportar box o usuario
- [ ] Bloquear / ocultar usuario

### Features sociales
- [ ] Completar share-to-feed: renderizar la Box original referenciada por `shared_from_id`
- [ ] Conectar Share desde Saved al `ShareModal`
- [ ] Post notifications ("Turn on notifications" en menú box — actualmente "coming soon")
- [ ] Nested comments (responder a un comentario) — actualmente flat
- [ ] Pinned comment por el autor
- [ ] Compartir drop directamente a un contacto (DM)

### Groups (Fase futura)
- [ ] Tabla `groups`, `group_members`, `group_boxes`
- [ ] GroupPage: feed de boxes del grupo
- [ ] Invitar contactos a un grupo

### Stories (Fase futura)
- [ ] Backend: tabla `stories`, expiración 24h
- [ ] StoriesRail funcional (actualmente decorativo)
- [ ] Vista fullscreen con timer

### Memories (Fase futura)
- [ ] "On this day" desde boxes antiguas del usuario

---

## Próximos pasos sugeridos (orden de impacto)

1. **Notification read UX** — No marcar todo automáticamente al abrir; añadir acciones explícitas
2. **New chat** — Selector de contactos sobre el backend de conversaciones existente
3. **Completar shares** — Box original compartida, Saved share y envío directo a contacto
4. **Saved Collections backend** — Tabla, RLS y UI responsive
5. **Ranking `For You` / `Loud`** — Diferenciar realmente los modos del feed
6. **Admin panel + reportes/bloqueos** — Necesario antes del lanzamiento público
7. **Notas de voz y adjuntos de chat** — Storage privado, mensajes multimedia, caché local y políticas por conversación

---

## Notas técnicas

- Auth: email/password via Supabase (sin OAuth por ahora)
- Imágenes: Supabase Storage, bucket `post-images`
- Notificaciones: solo via triggers Postgres `SECURITY DEFINER` — nunca desde el cliente
- Rutas: `/yo` (MenuPage mobile), `/saves`, `/contacts`, `/nbox`, `/my-box`, `/profile/:username`, `/box/:id`
- z-index stack: modal overlay = 10000, popovers sobre modal = 10100+, ActivityModal = 10200
- Mobile bar: `≤820px`; saved sidebar oculto: `≤1260px`
- `overflow-x: hidden` solo en `html`, nunca en `body` (rompe `position: sticky`)
