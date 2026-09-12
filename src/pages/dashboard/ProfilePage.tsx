import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import AdminBadge from '../../components/ui/AdminBadge'
import { useAuth } from '../../features/auth/AuthContext'
import { useProfile, useUpdateProfile } from '../../features/profile/useProfile'
import { uploadAvatarImage } from '../../lib/storage'
import AppShell from '../../components/layout/AppShell'
import LeftSidebar from '../../components/layout/LeftSidebar'
import RightSidebar from '../../components/layout/RightSidebar'
import ImageUpload from '../../components/ui/ImageUpload'
import Avatar from '../../components/ui/Avatar'
import { useToast } from '../../components/ui/Toast'
import VoiceNoteGlobalSetting from '../../components/chat/VoiceNoteGlobalSetting'

const schema = z.object({
  display_name: z.string().min(2, 'Minimum 2 characters').max(100, 'Maximum 100 characters'),
  username: z.string()
    .min(3, 'Minimum 3 characters')
    .max(30, 'Maximum 30 characters')
    .regex(/^[a-z0-9_]+$/, 'Lowercase letters, numbers, and underscores only'),
  bio: z.string().max(500, 'Maximum 500 characters').optional().or(z.literal('')),
})

type FormValues = z.infer<typeof schema>

export default function ProfilePage() {
  const { user } = useAuth()
  const toast = useToast()
  const { data: profile, isLoading } = useProfile(user?.id)
  const updateProfile = useUpdateProfile()
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { display_name: '', username: '', bio: '' },
  })

  useEffect(() => {
    if (profile) reset({
      display_name: profile.display_name,
      username: profile.username,
      bio: profile.bio ?? '',
    })
  }, [profile, reset])

  const onSubmit = async (values: FormValues) => {
    if (!user || !profile) return
    setUploading(true)
    try {
      let avatarUrl = profile.avatar_url ?? ''
      if (avatarFile) avatarUrl = await uploadAvatarImage(avatarFile, user.id)
      await updateProfile.mutateAsync({
        userId: user.id,
        form: { ...values, bio: values.bio ?? '', avatar_url: avatarUrl },
      })
      toast('Profile updated ✓')
    } catch (e: unknown) {
      toast(`⚠ ${e instanceof Error ? e.message : 'Unexpected error'}`)
    } finally {
      setUploading(false)
    }
  }

  return (
    <AppShell left={<LeftSidebar />} right={<RightSidebar />}>
      {isLoading ? (
        <div className="spinner">
          <div className="spinner-ring" />
          <span className="spinner-label">▒ Loading profile…</span>
        </div>
      ) : (
        <>
          {/* Profile header */}
          <div className="profile-cover mb-4" />
          <div className="profile-header-row">
            <Avatar
              name={profile?.display_name ?? user?.email ?? 'U'}
              src={profile?.avatar_url}
              size="lg"
            />
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, letterSpacing: '-0.02em', lineHeight: 1, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                {profile?.display_name}
                {profile?.role === 'admin' && <AdminBadge />}
              </div>
              <div className="text-mute" style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                @{profile?.username}
              </div>
            </div>
          </div>

          {/* Edit form */}
          <div className="panel" style={{ padding: 24, marginBottom: 16 }}>
            <h2 className="section-title" style={{ marginBottom: 20 }}>▸ My Box</h2>
            <form onSubmit={handleSubmit(onSubmit)}>
              <div className="two-col">
                <div>
                  <div className="field-group">
                    <label className="field-label" htmlFor="profile-display-name">Display name</label>
                    <input id="profile-display-name" {...register('display_name')} placeholder="Your name" />
                    {errors.display_name && <p style={{ color: 'var(--accent-1)', fontSize: 12, marginTop: 4 }}>{errors.display_name.message}</p>}
                  </div>

                  <div className="field-group">
                    <label className="field-label" htmlFor="profile-username">Username</label>
                    <input id="profile-username" {...register('username')} placeholder="your_username" style={{ fontFamily: 'var(--font-mono)' }} />
                    {errors.username && <p style={{ color: 'var(--accent-1)', fontSize: 12, marginTop: 4 }}>{errors.username.message}</p>}
                  </div>

                  <div className="field-group">
                    <label className="field-label" htmlFor="profile-bio">Bio</label>
                    <textarea id="profile-bio" rows={3} {...register('bio')} placeholder="Tell the world who you are…" />
                    {errors.bio && <p style={{ color: 'var(--accent-1)', fontSize: 12, marginTop: 4 }}>{errors.bio.message}</p>}
                  </div>

                  <div className="row gap-3">
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={uploading || updateProfile.isPending}
                    >
                      {uploading || updateProfile.isPending ? '▒ Saving…' : '✓ Save'}
                    </button>
                  </div>
                </div>

                <aside>
                  <div className="sidebar-block">
                    <h4>Avatar</h4>
                    <ImageUpload
                      kind="avatar"
                      currentUrl={profile?.avatar_url}
                      onFile={setAvatarFile}
                      uploading={uploading}
                    />
                  </div>
                  <div className="sidebar-block">
                    <h4>Email</h4>
                    <div className="text-sm text-dim" style={{ fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                      {user?.email}
                    </div>
                  </div>
                </aside>
              </div>
            </form>
          </div>
          {user?.id && profile && (
            <VoiceNoteGlobalSetting userId={user.id} enabled={profile.voice_notes_enabled !== false} />
          )}
        </>
      )}

    </AppShell>
  )
}

