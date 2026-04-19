/**
 * OnboardingFlow — full-screen guided setup for new FilamentHub users.
 *
 * Steps:
 *  0  Welcome
 *  1  Add your printer
 *  2  Add your first spool
 *  3  Feature tour (carousel)
 *  4  All done
 *
 * Completion is stored in localStorage so it only shows once.
 * Users can skip individual steps or skip the whole flow.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Flame, Printer, Package, BarChart3, Bell, QrCode,
  ClipboardList, Globe, ArrowRight, ArrowLeft, CheckCircle2,
  X, Zap, Shield, Users, ShoppingCart,
} from 'lucide-react'
import { cn } from '@/utils/cn'

// ── Storage key ────────────────────────────────────────────────────────────────

export const ONBOARDING_KEY = 'fh_onboarding_complete'

export function isOnboardingComplete(): boolean {
  return localStorage.getItem(ONBOARDING_KEY) === '1'
}

export function markOnboardingComplete() {
  localStorage.setItem(ONBOARDING_KEY, '1')
}

// ── Feature tour slides ────────────────────────────────────────────────────────

interface TourSlide {
  icon:        React.ElementType
  color:       string
  title:       string
  description: string
}

const TOUR_SLIDES: TourSlide[] = [
  {
    icon:        Package,
    color:       'from-primary-500 to-primary-700',
    title:       'Spool Inventory',
    description: 'Track every filament spool — brand, material, color, weight, and location. Filter, sort, and bulk-manage your full collection from one view.',
  },
  {
    icon:        Printer,
    color:       'from-accent-500 to-accent-700',
    title:       'Devices & AMS',
    description: 'Connect your printers and map AMS slots to specific spools. See at a glance what filament is loaded on each machine.',
  },
  {
    icon:        BarChart3,
    color:       'from-emerald-500 to-emerald-700',
    title:       'Usage Analytics',
    description: 'Log usage when you print to track filament consumed per day, per spool, and per material. The dashboard shows weekly trends and forecasts.',
  },
  {
    icon:        Bell,
    color:       'from-yellow-500 to-orange-600',
    title:       'Low-Stock Alerts',
    description: 'Set thresholds and get warned before a spool runs out. The Reorder List automatically surfaces spools that need replenishing.',
  },
  {
    icon:        QrCode,
    color:       'from-violet-500 to-violet-700',
    title:       'QR Labels',
    description: 'Print QR code labels for any spool. Stick them on the box and scan to instantly pull up specs, remaining weight, and history.',
  },
  {
    icon:        Globe,
    color:       'from-cyan-500 to-cyan-700',
    title:       'Community Database',
    description: 'Browse thousands of community-contributed filament profiles. Import any profile directly into your inventory with one click.',
  },
  {
    icon:        ClipboardList,
    color:       'from-rose-500 to-rose-700',
    title:       'Print Jobs',
    description: "Log print jobs to automatically deduct filament used. Build a full history of what you've printed, on which spool, and with which printer.",
  },
]

// ── Progress dots ──────────────────────────────────────────────────────────────

function Dots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={cn(
            'rounded-full transition-all duration-300',
            i === current
              ? 'w-6 h-2 bg-primary-400'
              : i < current
                ? 'w-2 h-2 bg-primary-700'
                : 'w-2 h-2 bg-surface-3',
          )}
        />
      ))}
    </div>
  )
}

// ── Step: Welcome ──────────────────────────────────────────────────────────────

function WelcomeStep() {
  return (
    <div className="text-center space-y-5 max-w-md mx-auto">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 shadow-2xl shadow-primary-900/40">
        <Flame className="h-10 w-10 text-white" />
      </div>
      <div>
        <h1 className="text-2xl font-bold text-white">Welcome to FilamentHub</h1>
        <p className="mt-2 text-gray-400 text-sm leading-relaxed">
          Your all-in-one hub for managing 3D printing filament — track spools, log usage,
          forecast runout, and never run dry mid-print again.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3 text-left">
        {[
          { icon: Shield,  label: 'Never run out',    desc: 'Smart alerts & reorder list' },
          { icon: Zap,     label: 'Instant insights', desc: 'Usage stats & forecasting'   },
          { icon: Users,   label: 'Community',        desc: 'Shared filament profiles'    },
        ].map(({ icon: Icon, label, desc }) => (
          <div key={label} className="rounded-xl border border-surface-border bg-surface-2 p-3">
            <Icon className="h-5 w-5 text-primary-400 mb-2" />
            <p className="text-xs font-semibold text-white">{label}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">{desc}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-600">This quick setup takes about 2 minutes — or skip ahead anytime.</p>
    </div>
  )
}

// ── Step: Add printer ──────────────────────────────────────────────────────────

function AddPrinterStep({ onGoNow }: { onGoNow: () => void }) {
  return (
    <div className="text-center space-y-5 max-w-md mx-auto">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-500 to-accent-700 shadow-2xl shadow-accent-900/30">
        <Printer className="h-8 w-8 text-white" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-white">Connect your printer</h2>
        <p className="mt-2 text-gray-400 text-sm leading-relaxed">
          Add your 3D printer so FilamentHub knows which filament is loaded.
          If you have a Bambu Lab printer with an AMS, you can map every slot.
        </p>
      </div>
      <div className="rounded-xl border border-surface-border bg-surface-2 p-4 text-left space-y-3">
        {[
          'Give your printer a name (e.g. "P1S Garage")',
          'Add AMS units if you have them',
          'Assign spools to each slot',
          'See which filament is loaded at a glance',
        ].map((tip, i) => (
          <div key={i} className="flex items-start gap-2.5 text-sm">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-500/20 text-accent-300 text-xs font-bold">
              {i + 1}
            </span>
            <span className="text-gray-300">{tip}</span>
          </div>
        ))}
      </div>
      <button
        onClick={onGoNow}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-accent-600 hover:bg-accent-500 px-4 py-3 text-sm font-semibold text-white transition-colors"
      >
        <Printer className="h-4 w-4" />
        Add my printer now
        <ArrowRight className="h-4 w-4" />
      </button>
      <p className="text-xs text-gray-600">No printer yet? That's fine — you can skip and add one later.</p>
    </div>
  )
}

// ── Step: Add spool ────────────────────────────────────────────────────────────

function AddSpoolStep({ onGoNow }: { onGoNow: () => void }) {
  return (
    <div className="text-center space-y-5 max-w-md mx-auto">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 shadow-2xl shadow-primary-900/30">
        <Package className="h-8 w-8 text-white" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-white">Add your first spool</h2>
        <p className="mt-2 text-gray-400 text-sm leading-relaxed">
          Log a physical spool of filament. You can enter how much is left, the brand,
          material, color, and where you store it.
        </p>
      </div>
      <div className="rounded-xl border border-surface-border bg-surface-2 p-4 text-left space-y-3">
        {[
          { label: 'Name & brand',      desc: 'e.g. Bambu Lab PLA Basic — Jade White' },
          { label: 'Material',          desc: 'PLA, PETG, ABS, TPU…' },
          { label: 'Initial weight',    desc: 'Usually 1000 g (the full spool)' },
          { label: 'How much is left',  desc: 'Enter remaining grams or weigh the spool' },
        ].map(({ label, desc }) => (
          <div key={label} className="flex items-start gap-2.5">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-primary-400 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-gray-200">{label}</p>
              <p className="text-xs text-gray-500">{desc}</p>
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={onGoNow}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary-600 hover:bg-primary-500 px-4 py-3 text-sm font-semibold text-white transition-colors"
      >
        <Package className="h-4 w-4" />
        Add my first spool
        <ArrowRight className="h-4 w-4" />
      </button>
      <p className="text-xs text-gray-600">You can add as many spools as you like — or come back to this later.</p>
    </div>
  )
}

// ── Step: Feature tour ─────────────────────────────────────────────────────────

function TourStep() {
  const [slide, setSlide] = useState(0)
  const current = TOUR_SLIDES[slide]
  const Icon    = current.icon

  return (
    <div className="text-center space-y-5 max-w-md mx-auto">
      <div>
        <h2 className="text-xl font-bold text-white">Everything FilamentHub can do</h2>
        <p className="mt-1 text-sm text-gray-400">A quick look at the tools available to you.</p>
      </div>

      <div className="rounded-2xl border border-surface-border bg-surface-1 p-6 space-y-4">
        <div className={cn('mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg', current.color)}>
          <Icon className="h-7 w-7 text-white" />
        </div>
        <div>
          <p className="text-base font-bold text-white">{current.title}</p>
          <p className="mt-1.5 text-sm text-gray-400 leading-relaxed">{current.description}</p>
        </div>

        {/* Slide indicator dots */}
        <div className="flex items-center justify-center gap-1.5 pt-1">
          {TOUR_SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setSlide(i)}
              className={cn(
                'rounded-full transition-all',
                i === slide ? 'w-5 h-1.5 bg-primary-400' : 'w-1.5 h-1.5 bg-surface-3 hover:bg-gray-500',
              )}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => setSlide((s) => Math.max(0, s - 1))}
          disabled={slide === 0}
          className="flex items-center gap-1.5 rounded-lg border border-surface-border bg-surface-2 px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ArrowLeft className="h-4 w-4" />
          Prev
        </button>
        <span className="text-xs text-gray-600">{slide + 1} / {TOUR_SLIDES.length}</span>
        <button
          onClick={() => setSlide((s) => Math.min(TOUR_SLIDES.length - 1, s + 1))}
          disabled={slide === TOUR_SLIDES.length - 1}
          className="flex items-center gap-1.5 rounded-lg border border-surface-border bg-surface-2 px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Next
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ── Step: Done ─────────────────────────────────────────────────────────────────

function DoneStep({ onFinish }: { onFinish: () => void }) {
  const navigate = useNavigate()

  const quickLinks = [
    { icon: Package,      label: 'Add your spools',    desc: 'Start logging your inventory',         href: '/spools/new', color: 'text-primary-400' },
    { icon: Printer,      label: 'Connect a printer',  desc: 'Map your AMS and loaded filament',     href: '/printers',   color: 'text-accent-400'  },
    { icon: ShoppingCart, label: 'Check reorder list', desc: "See what's running low",               href: '/reorder',    color: 'text-yellow-400'  },
    { icon: Bell,         label: 'Set up alerts',      desc: 'Get notified before spools run out',   href: '/alerts',     color: 'text-red-400'     },
  ]

  return (
    <div className="text-center space-y-5 max-w-md mx-auto">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-2xl shadow-emerald-900/30">
        <CheckCircle2 className="h-10 w-10 text-white" />
      </div>
      <div>
        <h2 className="text-2xl font-bold text-white">You're all set!</h2>
        <p className="mt-2 text-gray-400 text-sm leading-relaxed">
          FilamentHub is ready. Here are some great places to start.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 text-left">
        {quickLinks.map(({ icon: Icon, label, desc, href, color }) => (
          <button
            key={href}
            onClick={() => { onFinish(); navigate(href) }}
            className="flex items-center gap-3 rounded-xl border border-surface-border bg-surface-2 p-3.5 text-left hover:bg-surface-3 transition-colors"
          >
            <Icon className={cn('h-5 w-5 shrink-0', color)} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">{label}</p>
              <p className="text-xs text-gray-500 truncate">{desc}</p>
            </div>
            <ArrowRight className="h-4 w-4 text-gray-600 shrink-0 ml-auto" />
          </button>
        ))}
      </div>

      <button
        onClick={onFinish}
        className="w-full rounded-xl bg-primary-600 hover:bg-primary-500 px-4 py-3 text-sm font-semibold text-white transition-colors"
      >
        Go to Dashboard
      </button>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

const STEP_LABELS = ['Welcome', 'Printer', 'Spool', 'Tour', 'Done']
const TOTAL_STEPS = STEP_LABELS.length

interface OnboardingFlowProps {
  onComplete: () => void
}

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState(0)
  const navigate = useNavigate()

  function next()    { setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1)) }
  function prev()    { setStep((s) => Math.max(0, s - 1)) }
  function finish()  { markOnboardingComplete(); onComplete() }

  function goToPrinters() { finish(); navigate('/printers')   }
  function goToAddSpool() { finish(); navigate('/spools/new') }

  const isFirst = step === 0
  const isLast  = step === TOTAL_STEPS - 1

  const stepContent = [
    <WelcomeStep    key={0} />,
    <AddPrinterStep key={1} onGoNow={goToPrinters} />,
    <AddSpoolStep   key={2} onGoNow={goToAddSpool}  />,
    <TourStep       key={3} />,
    <DoneStep       key={4} onFinish={finish}        />,
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg rounded-2xl border border-surface-border bg-surface-1 shadow-2xl overflow-hidden">

        {/* Top bar */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-surface-border">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-accent-500">
              <Flame className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {STEP_LABELS[step]}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Dots total={TOTAL_STEPS} current={step} />
            {!isLast && (
              <button
                onClick={finish}
                title="Skip setup"
                className="rounded-md p-1 text-gray-600 hover:text-gray-400 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Step content */}
        <div className="px-6 py-6 max-h-[70vh] overflow-y-auto">
          {stepContent[step]}
        </div>

        {/* Footer nav — hidden on Done step (it has its own buttons) */}
        {!isLast && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-surface-border bg-surface-2">
            <button
              onClick={prev}
              disabled={isFirst}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>

            <div className="flex items-center gap-2">
              {step > 0 && step < TOTAL_STEPS - 1 && (
                <button
                  onClick={next}
                  className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Skip this step
                </button>
              )}
              <button
                onClick={next}
                className="flex items-center gap-1.5 rounded-lg bg-primary-600 hover:bg-primary-500 px-4 py-2 text-sm font-semibold text-white transition-colors"
              >
                {step === 0 ? "Let's go" : 'Next'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
