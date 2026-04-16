import { useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { Camera, Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { authApi } from '@/api/auth'
import { usersApi } from '@/api/users'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { getErrorMessage } from '@/api/client'
import { SettingsCard } from './SettingsCard'

// ── Profile form ─────────────────────────────────────────────────────────────

const profileSchema = z.object({
  display_name: z.string().min(1, 'Required'),
  maker_name:   z.string().optional(),
})
type ProfileForm = z.infer<typeof profileSchema>

// ── Password form ────────────────────────────────────────────────────────────

const passwordSchema = z.object({
  current_password: z.string().min(1, 'Required'),
  new_password:     z.string().min(8, 'At least 8 characters'),
  confirm_password: z.string(),
}).refine((d) => d.new_password === d.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
})
type PasswordForm = z.infer<typeof passwordSchema>

// ── PasswordField ────────────────────────────────────────────────────────────

function PasswordField({ label, error, ...props }: React.ComponentProps<typeof Input>) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative flex flex-col gap-1">
      <Input label={label} type={show ? 'text' : 'password'} error={error} {...props} />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-3 top-[2.1rem] text-gray-500 hover:text-gray-300"
        tabIndex={-1}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function ProfileSection() {
  const user    = useAuthStore((s) => s.user)
  const fetchMe = useAuthStore((s) => s.fetchMe)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Profile form ───────────────────────────────────────────────────────
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

  // ── Avatar upload ──────────────────────────────────────────────────────
  const avatarMutation = useMutation({
    mutationFn: usersApi.uploadAvatar,
    onSuccess: () => fetchMe(),
  })

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) avatarMutation.mutate(file)
    e.target.value = ''
  }

  // ── Password form ──────────────────────────────────────────────────────
  const {
    register: regPwd,
    handleSubmit: submitPwd,
    reset: resetPwd,
    formState: { errors: pwdErrors, isDirty: pwdDirty },
  } = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) })

  const passwordMutation = useMutation({
    mutationFn: (d: PasswordForm) => authApi.changePassword(d.current_password, d.new_password),
    onSuccess: () => resetPwd(),
  })

  const initials = (user?.display_name ?? user?.email ?? '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="space-y-6">
      {/* ── Profile card ──────────────────────────────────────────────── */}
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

      {/* ── Password card ─────────────────────────────────────────────── */}
      <form onSubmit={submitPwd((d) => passwordMutation.mutate(d))} className="space-y-6">
        <SettingsCard title="Password" description="Change the password used to sign in to your account.">
          <div className="space-y-3">
            <PasswordField
              label="Current password"
              error={pwdErrors.current_password?.message}
              autoComplete="current-password"
              {...regPwd('current_password')}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <PasswordField
                label="New password"
                error={pwdErrors.new_password?.message}
                autoComplete="new-password"
                {...regPwd('new_password')}
              />
              <PasswordField
                label="Confirm new password"
                error={pwdErrors.confirm_password?.message}
                autoComplete="new-password"
                {...regPwd('confirm_password')}
              />
            </div>
          </div>
        </SettingsCard>

        {passwordMutation.error && (
          <p className="rounded-lg bg-red-900/40 border border-red-700/50 px-3 py-2 text-sm text-red-300">
            {getErrorMessage(passwordMutation.error)}
          </p>
        )}
        {passwordMutation.isSuccess && (
          <p className="rounded-lg bg-green-900/40 border border-green-700/50 px-3 py-2 text-sm text-green-300">
            Password changed successfully.
          </p>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={!pwdDirty} loading={passwordMutation.isPending}>
            Change password
          </Button>
        </div>
      </form>
    </div>
  )
}
