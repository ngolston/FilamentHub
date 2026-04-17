/**
 * Hex → human-readable color name and basic English color category.
 */

export type BasicColor =
  | 'white' | 'black' | 'grey'
  | 'red' | 'orange' | 'yellow' | 'green'
  | 'blue' | 'purple' | 'pink' | 'brown'

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === rn
    ? ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
    : max === gn
      ? ((bn - rn) / d + 2) / 6
      : ((rn - gn) / d + 4) / 6
  return [h * 360, s, l]
}

/** Returns a human-readable color name for a hex string (~50 possible names). */
export function hexToColorName(hex: string): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return 'Unknown'
  const [h, s, l] = rgbToHsl(...rgb)

  // Achromatic
  if (s < 0.10) {
    if (l > 0.93) return 'White'
    if (l > 0.82) return 'Off-White'
    if (l > 0.68) return 'Silver'
    if (l > 0.48) return 'Light Gray'
    if (l > 0.28) return 'Gray'
    if (l > 0.12) return 'Dark Gray'
    return 'Black'
  }

  // Brown / earth tones (warm hue, low-ish sat/lightness)
  if (h >= 10 && h < 50 && s < 0.55 && l < 0.56) {
    if (l > 0.72) return 'Cream'
    if (l > 0.58) return 'Beige'
    if (l > 0.42) return 'Tan'
    if (l > 0.25) return 'Brown'
    return 'Dark Brown'
  }

  // Red family
  if (h >= 355 || h < 8) {
    if (l < 0.28) return 'Maroon'
    if (l > 0.75) return 'Rose'
    return 'Red'
  }
  if (h < 18) {
    if (l < 0.30) return 'Dark Red'
    if (l > 0.70) return 'Salmon'
    return 'Crimson'
  }
  // Orange-red
  if (h < 28) {
    if (l > 0.72) return 'Peach'
    if (l < 0.32) return 'Burnt Orange'
    return 'Orange Red'
  }
  // Orange
  if (h < 45) {
    if (l > 0.72) return 'Peach'
    if (l < 0.35) return 'Burnt Orange'
    return 'Orange'
  }
  // Amber / Gold
  if (h < 55) {
    if (l < 0.38) return 'Amber'
    if (l > 0.75) return 'Light Yellow'
    return 'Gold'
  }
  // Yellow
  if (h < 68) {
    if (l < 0.38) return 'Olive'
    return 'Yellow'
  }
  // Yellow-Green / Lime
  if (h < 90) {
    if (l < 0.35) return 'Dark Olive'
    if (l > 0.72) return 'Light Green'
    return 'Lime'
  }
  // Green
  if (h < 140) {
    if (l < 0.25) return 'Dark Green'
    if (l > 0.72) return 'Mint'
    if (s < 0.35) return 'Sage'
    return 'Green'
  }
  // Teal-Green
  if (h < 170) {
    if (l < 0.30) return 'Forest Green'
    if (l > 0.65) return 'Aquamarine'
    return 'Emerald'
  }
  // Teal
  if (h < 200) {
    if (l < 0.28) return 'Dark Teal'
    if (l > 0.68) return 'Aqua'
    return 'Teal'
  }
  // Cyan
  if (h < 218) {
    if (l < 0.28) return 'Dark Cyan'
    if (l > 0.70) return 'Sky Blue'
    return 'Cyan'
  }
  // Blue
  if (h < 255) {
    if (l < 0.22) return 'Navy'
    if (l > 0.72) return 'Sky Blue'
    if (s < 0.42) return 'Steel Blue'
    if (h < 240) return 'Cornflower'
    return 'Blue'
  }
  // Indigo
  if (h < 275) {
    if (l < 0.25) return 'Indigo'
    if (l > 0.72) return 'Periwinkle'
    return 'Indigo'
  }
  // Purple
  if (h < 300) {
    if (l < 0.28) return 'Dark Purple'
    if (l > 0.72) return 'Lavender'
    if (s < 0.42) return 'Mauve'
    return 'Purple'
  }
  // Magenta
  if (h < 325) {
    if (l < 0.32) return 'Dark Magenta'
    if (l > 0.72) return 'Light Pink'
    return 'Magenta'
  }
  // Pink
  if (h < 355) {
    if (l < 0.35) return 'Dark Pink'
    if (l > 0.75) return 'Pink'
    if (s > 0.75) return 'Hot Pink'
    return 'Pink'
  }

  return 'Red'
}

/** Maps a hex to one of the 11 basic English color categories. */
export function hexToBasicColor(hex: string): BasicColor {
  const rgb = hexToRgb(hex)
  if (!rgb) return 'grey'
  const [h, s, l] = rgbToHsl(...rgb)

  if (s < 0.10) {
    if (l > 0.85) return 'white'
    if (l < 0.18) return 'black'
    return 'grey'
  }
  if (h >= 10 && h < 50 && s < 0.55 && l < 0.56) return 'brown'
  if (h >= 355 || h < 20) return 'red'
  if (h < 45) return 'orange'
  if (h < 70) return 'yellow'
  if (h < 200) return 'green'
  if (h < 255) return 'blue'
  if (h < 295) return 'purple'
  if (h < 355) return 'pink'
  return 'red'
}

export const BASIC_COLORS: BasicColor[] = [
  'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'brown', 'white', 'grey', 'black',
]

/** Display label + a representative dot color for each basic category. */
export const BASIC_COLOR_META: Record<BasicColor, { label: string; dot: string }> = {
  red:    { label: 'Red',    dot: '#EF4444' },
  orange: { label: 'Orange', dot: '#F97316' },
  yellow: { label: 'Yellow', dot: '#EAB308' },
  green:  { label: 'Green',  dot: '#22C55E' },
  blue:   { label: 'Blue',   dot: '#3B82F6' },
  purple: { label: 'Purple', dot: '#A855F7' },
  pink:   { label: 'Pink',   dot: '#EC4899' },
  brown:  { label: 'Brown',  dot: '#92400E' },
  white:  { label: 'White',  dot: '#F1F5F9' },
  grey:   { label: 'Grey',   dot: '#6B7280' },
  black:  { label: 'Black',  dot: '#1E293B' },
}
