import { useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { Camera } from 'lucide-react'
import { usersApi } from '@/api/users'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { getErrorMessage } from '@/api/client'
import { SettingsCard } from './SettingsCard'

const profileSchema = z.object({
  display_name: z.string().min(1, 'Required'),
  maker_name:   z.string().optional(),
})
type ProfileForm = z.infer<typeof profileSchema>

export function ProfileSection() {
  const user    = useAuthStore((s) => s.user)
  const fetchMe = useAuthStore((s) => s.fetchMe)
  const fileRef = useRef<HTMLInputElement>(null)

  const { register: regProfile, handleSubmit: submitProfile, formState: { errors: profileErrors, isDirty } } =
    useForm<ProfileForm>({
      resolver: zodResolver(profileSchema),
      defaultValues: {
        display_name: user?.display_name ?? '',
        maker_name:   user?.maker_name   ?? '',
      },
    })

  const updateMutation = useMutation({
    mutationFn: usersApi.updateMe,
    onSuccess: () => fetchMe(),
  })

  const avatarMutation = useMutation({
    mutationFn: usersApi.uploadAvatar,
    onSuccess: () => fetchMe(),
  })

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) avatarMutation.mutate(file)
    e.target.value = ''
  }

  const initials = (user?.display_name ?? user?.email ?? '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="space-y-6">
      <form onSubmit={submitProfile((d) => updateMutation.mutate(d))} className="space-y-6">
        <SettingsCard title="Profile" description="Your public identity on FilamentHub.">
          {/* Avatar */}
          <div className="flex items-center gap-5">
            <div className="relative">
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.display_name}
                  className="h-16 w-16 rounded-full object-cover border border-surface-border"
                />
              ) : (
                <div className="h-16 w-16 rounded-full bg-primary-600/30 border border-primary-500/30 flex items-center justify-center">
                  <span className="text-lg font-semibold text-primary-300">{initials}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="absolute -bottom-1 -right-1 rounded-full bg-surface-2 border border-surface-border p-1.5 text-gray-400 hover:text-white hover:bg-surface-3 transition-colors"
                title="Change avatar"
              >
                {avatarMutation.isPending
                  ? <span className="inline-block h-3 w-3 rounded-full border-2 border-gray-400 border-t-white animate-spin" />
                  : <Camera className="h-3 w-3" />}
              </button>
            </div>
            <div>
              <p className="text-sm font-medium text-white">{user?.display_name}</p>
              <p className="text-xs text-gray-500 mt-0.5">{user?.email}</p>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="mt-1.5 text-xs text-primary-400 hover:text-primary-300"
              >
                Upload new photo
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>

          {avatarMutation.error && (
            <p className="text-xs text-red-400">{getErrorMessage(avatarMutation.error)}</p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Display name"
              error={profileErrors.display_name?.message}
              {...regProfile('display_name')}
            />
            <Input
              label="Maker name"
              placeholder="Optional community handle"
              {...regProfile('maker_name')}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-surface-border bg-surface-2 px-4 py-3">
              <p className="text-xs text-gray-500">Email</p>
              <p className="mt-0.5 text-sm text-white">{user?.email}</p>
            </div>
            <div className="rounded-lg border border-surface-border bg-surface-2 px-4 py-3">
              <p className="text-xs text-gray-500">Role</p>
              <p className="mt-0.5 text-sm capitalize text-white">{user?.role}</p>
            </div>
          </div>
        </SettingsCard>

        {updateMutation.error && (
          <p className="rounded-lg bg-red-900/40 border border-red-700/50 px-3 py-2 text-sm text-red-300">
            {getErrorMessage(updateMutation.error)}
          </p>
        )}
        {updateMutation.isSuccess && (
          <p className="rounded-lg bg-green-900/40 border border-green-700/50 px-3 py-2 text-sm text-green-300">
            Profile updated.
          </p>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={!isDirty} loading={updateMutation.isPending}>
            Save changes
          </Button>
        </div>
      </form>
    </div>
  )
}
