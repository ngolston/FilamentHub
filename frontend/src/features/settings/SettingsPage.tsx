import { useState } from 'react'
import { ProfileSection } from './ProfileSection'
import { SecuritySection } from './SecuritySection'
import { ApiKeysSection } from './ApiKeysSection'

const TABS = [
  { id: 'profile',  label: 'Profile'   },
  { id: 'security', label: 'Security'  },
  { id: 'api-keys', label: 'API Keys'  },
] as const

type TabId = typeof TABS[number]['id']

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('profile')

  return (
    <div className="p-5 lg:p-7 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Settings</h1>
        <p className="mt-0.5 text-sm text-gray-400">Manage your account, security, and integrations.</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-xl bg-surface-2 p-1 mb-6 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={
              activeTab === tab.id
                ? 'rounded-lg px-4 py-1.5 text-sm font-medium text-white bg-primary-600 shadow-sm'
                : 'rounded-lg px-4 py-1.5 text-sm font-medium text-gray-400 hover:text-white transition-colors'
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'profile'  && <ProfileSection />}
      {activeTab === 'security' && <SecuritySection />}
      {activeTab === 'api-keys' && <ApiKeysSection />}
    </div>
  )
}
