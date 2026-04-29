import { useEffect } from 'react'

export type Density  = 'compact' | 'default' | 'comfortable'
export type FontSize = 'small' | 'medium' | 'large'

const LS_ACCENT        = 'fh_accent'
const LS_DENSITY       = 'fh_density'
const LS_FONT_SIZE     = 'fh_font_size'
const LS_REDUCE_MOTION = 'fh_reduce_motion'

// ── Accent colour ─────────────────────────────────────────────────────────────
// Pre-computed Tailwind palettes (space-separated RGB channels) for each preset.

const ACCENT_PALETTES: Record<string, Record<string, string>> = {
  '#4f46e5': { '300': '165 180 252', '400': '129 140 248', '500': '99 102 241',  '600': '79 70 229',   '700': '67 56 202',  '900': '49 46 129',  '950': '30 27 75'  }, // Indigo
  '#0891b2': { '300': '103 232 249', '400': '34 211 238',  '500': '6 182 212',   '600': '8 145 178',   '700': '14 116 144', '900': '22 78 99',   '950': '8 51 68'   }, // Cyan
  '#059669': { '300': '110 231 183', '400': '52 211 153',  '500': '16 185 129',  '600': '5 150 105',   '700': '4 120 87',   '900': '6 78 59',    '950': '2 44 34'   }, // Emerald
  '#e11d48': { '300': '253 164 175', '400': '251 113 133', '500': '244 63 94',   '600': '225 29 72',   '700': '190 18 60',  '900': '136 19 55',  '950': '76 5 25'   }, // Rose
  '#d97706': { '300': '252 211 77',  '400': '251 191 36',  '500': '245 158 11',  '600': '217 119 6',   '700': '180 83 9',   '900': '120 53 15',  '950': '69 26 3'   }, // Amber
  '#7c3aed': { '300': '196 181 253', '400': '167 139 250', '500': '139 92 246',  '600': '124 58 237',  '700': '109 40 217', '900': '76 29 149',  '950': '46 16 101' }, // Violet
  '#0f766e': { '300': '94 234 212',  '400': '45 212 191',  '500': '20 184 166',  '600': '13 148 136',  '700': '15 118 110', '900': '19 78 74',   '950': '4 47 46'   }, // Teal
  '#ea580c': { '300': '253 186 116', '400': '251 146 60',  '500': '249 115 22',  '600': '234 88 12',   '700': '194 65 12',  '900': '124 45 18',  '950': '67 20 7'   }, // Orange
}

// ── HSL palette generator for arbitrary custom hex colours ────────────────────

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, Math.round(l * 100)]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)]
}

function hslToRgbChannels(h: number, s: number, l: number): string {
  s /= 100; l /= 100
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
  }
  return `${f(0)} ${f(8)} ${f(4)}`
}

const SHADE_LIGHTNESS: [string, number][] = [
  ['300', 72], ['400', 62], ['500', 52], ['600', 44], ['700', 36], ['900', 24], ['950', 15],
]

function buildPaletteFromHex(hex: string): Record<string, string> | null {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null
  const [h, s] = hexToHsl(hex)
  return Object.fromEntries(
    SHADE_LIGHTNESS.map(([shade, l]) => [shade, hslToRgbChannels(h, Math.min(s, 90), l)])
  )
}

export function applyAccent(hex: string) {
  const palette = ACCENT_PALETTES[hex] ?? buildPaletteFromHex(hex)
  if (!palette) return
  const html = document.documentElement
  for (const [shade, rgb] of Object.entries(palette)) {
    html.style.setProperty(`--primary-${shade}`, rgb)
  }
  localStorage.setItem(LS_ACCENT, hex)
}

// ── Density + font size ───────────────────────────────────────────────────────
// Scale the root font-size so Tailwind's rem-based utilities resize proportionally.

const FONT_BASE: Record<FontSize, number>  = { small: 14, medium: 16, large: 18 }
const DENSITY_ADJ: Record<Density, number> = { compact: -1, default: 0, comfortable: 2 }

export function applyDensityAndFontSize(density: Density, fontSize: FontSize) {
  const px = FONT_BASE[fontSize] + DENSITY_ADJ[density]
  document.documentElement.style.fontSize = `${px}px`
  localStorage.setItem(LS_DENSITY, density)
  localStorage.setItem(LS_FONT_SIZE, fontSize)
}

// ── Reduce motion ─────────────────────────────────────────────────────────────

export function applyReduceMotion(enabled: boolean) {
  document.documentElement.classList.toggle('reduce-motion', enabled)
  localStorage.setItem(LS_REDUCE_MOTION, String(enabled))
}

// ── Boot-time applier ─────────────────────────────────────────────────────────

export function useAppearanceApplier() {
  useEffect(() => {
    const accent       = localStorage.getItem(LS_ACCENT)
    const density      = (localStorage.getItem(LS_DENSITY)      ?? 'default') as Density
    const fontSize     = (localStorage.getItem(LS_FONT_SIZE)    ?? 'medium')  as FontSize
    const reduceMotion = localStorage.getItem(LS_REDUCE_MOTION) === 'true'

    if (accent) applyAccent(accent)
    applyDensityAndFontSize(density, fontSize)
    applyReduceMotion(reduceMotion)
  }, [])
}
