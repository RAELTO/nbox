import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useFieldArray, useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Check, ExternalLink, Link2, Plus, Trash2 } from 'lucide-react'
import AdminBadge from '../../components/ui/AdminBadge'
import { useAuth } from '../../features/auth/AuthContext'
import { useProfile, useUpdateProfile } from '../../features/profile/useProfile'
import { uploadAvatarImage } from '../../lib/storage'
import { sanitizeUrl } from '../../lib/sanitize'
import AppShell from '../../components/layout/AppShell'
import LeftSidebar from '../../components/layout/LeftSidebar'
import RightSidebar from '../../components/layout/RightSidebar'
import ImageUpload from '../../components/ui/ImageUpload'
import Avatar from '../../components/ui/Avatar'
import { useToast } from '../../components/ui/Toast'
import VoiceNoteGlobalSetting from '../../components/chat/VoiceNoteGlobalSetting'

const linkSchema = z.object({
  label: z.string().trim().min(1, 'Label required').max(40, 'Maximum 40 characters'),
  url: z
    .string()
    .trim()
    .max(300, 'Maximum 300 characters')
    .refine(value => Boolean(sanitizeUrl(value)), 'Use a valid http:// or https:// URL'),
})

const schema = z.object({
  display_name: z.string().min(2, 'Minimum 2 characters').max(100, 'Maximum 100 characters'),
  username: z.string()
    .min(3, 'Minimum 3 characters')
    .max(30, 'Maximum 30 characters')
    .regex(/^[a-z0-9_]+$/, 'Lowercase letters, numbers, and underscores only'),
  bio: z.string().max(500, 'Maximum 500 characters').optional().or(z.literal('')),
  links: z.array(linkSchema).max(5, 'Maximum 5 links'),
})

type FormValues = z.infer<typeof schema>

export default function ProfilePage() {
  const { user } = useAuth()
  const toast = useToast()
  const { data: profile, isLoading } = useProfile(user?.id)
  const updateProfile = useUpdateProfile()
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  const formValues = useMemo<FormValues | undefined>(() => (
    profile
      ? {
          display_name: profile.display_name,
          username: profile.username,
          bio: profile.bio ?? '',
          links: profile.links ?? [],
        }
      : undefined
  ), [profile])

  const { register, control, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { display_name: '', username: '', bio: '', links: [] },
    values: formValues,
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'links',
  })

  const onSubmit = async (values: FormValues) => {
    if (!user || !profile) return
    setUploading(true)
    try {
      let avatarUrl = profile.avatar_url ?? ''
      if (avatarFile) avatarUrl = await uploadAvatarImage(avatarFile, user.id)
      await updateProfile.mutateAsync({
        userId: user.id,
        form: {
          display_name: values.display_name,
          username: values.username,
          bio: values.bio ?? '',
          avatar_url: avatarUrl,
          links: values.links,
        },
      })
      toast('Profile updated.')
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Unexpected error')
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
          <div className="profile-cover mb-4" />
          <div className="profile-header-row">
            <Avatar
              name={profile?.display_name ?? user?.email ?? 'U'}
              src={profile?.avatar_url}
              size="lg"
            />
            <div className="profile-identity-col">
              <div className="profile-display-heading">
                {profile?.display_name}
                {profile?.role === 'admin' && <AdminBadge />}
              </div>
              <div className="text-mute profile-username-line">
                @{profile?.username}
              </div>
            </div>
            {profile?.username && (
              <div className="profile-primary-action">
                <Link to={`/profile/${profile.username}`} className="btn btn-small">
                  <ExternalLink size={14} strokeWidth={2.5} aria-hidden="true" /> View public box
                </Link>
              </div>
            )}
          </div>

          <div className="panel" style={{ padding: 24, marginBottom: 16 }}>
            <h2 className="section-title" style={{ marginBottom: 20 }}>▸ My Box</h2>
            <form onSubmit={handleSubmit(onSubmit)}>
              <div className="two-col">
                <div>
                  <div className="field-group">
                    <label className="field-label" htmlFor="profile-display-name">Display name</label>
                    <input id="profile-display-name" {...register('display_name')} placeholder="Your name" />
                    {errors.display_name && <p className="field-error-copy">{errors.display_name.message}</p>}
                  </div>

                  <div className="field-group">
                    <label className="field-label" htmlFor="profile-username">Username</label>
                    <input id="profile-username" {...register('username')} placeholder="your_username" style={{ fontFamily: 'var(--font-mono)' }} />
                    {errors.username && <p className="field-error-copy">{errors.username.message}</p>}
                  </div>

                  <div className="field-group">
                    <label className="field-label" htmlFor="profile-bio">Bio</label>
                    <textarea id="profile-bio" rows={3} {...register('bio')} placeholder="Tell the world who you are…" />
                    {errors.bio && <p className="field-error-copy">{errors.bio.message}</p>}
                  </div>

                  <div className="field-group profile-links-editor">
                    <div className="profile-links-editor-head">
                      <span className="field-label" style={{ marginBottom: 0 }}>
                        <Link2 size={14} strokeWidth={2.6} aria-hidden="true" /> About links ({fields.length}/5)
                      </span>
                      <button
                        type="button"
                        className="btn btn-small"
                        disabled={fields.length >= 5}
                        onClick={() => append({ label: '', url: '' })}
                      >
                        <Plus size={14} strokeWidth={2.6} aria-hidden="true" /> Add link
                      </button>
                    </div>

                    {fields.length === 0 ? (
                      <div className="profile-links-editor-empty">
                        No links added yet. Add up to 5 http/https links for your About tab.
                      </div>
                    ) : (
                      <div className="profile-links-editor-rows">
                        {fields.map((field, index) => (
                          <div key={field.id} className="profile-link-edit-row">
                            <div className="profile-link-edit-inputs">
                              <input
                                {...register(`links.${index}.label`)}
                                placeholder="Label (e.g. Portfolio)"
                                aria-label={`Link ${index + 1} label`}
                              />
                              <input
                                {...register(`links.${index}.url`)}
                                placeholder="https://example.com"
                                aria-label={`Link ${index + 1} URL`}
                                type="url"
                              />
                            </div>
                            <button
                              type="button"
                              className="btn btn-icon btn-small profile-link-remove-btn"
                              aria-label={`Remove link ${index + 1}`}
                              onClick={() => remove(index)}
                            >
                              <Trash2 size={14} strokeWidth={2.6} aria-hidden="true" />
                            </button>
                            {(errors.links?.[index]?.label || errors.links?.[index]?.url) && (
                              <p className="field-error-copy profile-link-row-error">
                                {errors.links[index]?.label?.message || errors.links[index]?.url?.message}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="row gap-3">
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={uploading || updateProfile.isPending}
                    >
                      {uploading || updateProfile.isPending ? '▒ Saving…' : (
                        <>
                          <Check size={15} strokeWidth={2.8} aria-hidden="true" /> Save
                        </>
                      )}
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
