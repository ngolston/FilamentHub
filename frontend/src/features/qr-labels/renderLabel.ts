/**
 * Pure-canvas label renderer — no DOM capture needed.
 *
 * Resolution strategy (same principle for both QR codes and text):
 *   • ctx.scale(SCALE, SCALE) is used only for rectangles / image placement.
 *   • Text and QR codes are generated / drawn at physical-pixel coordinates
 *     so the browser rasterizer never has to upscale — zero blur.
 */

import type { SpoolResponse, LocationResponse } from '@/types/api'
import type { LabelTemplate, ClassicSlot, QrEncoding } from './SpoolLabel'
import { LABEL_PX, CLASSIC_FIELD_LABELS, DEFAULT_LABEL_ADJUSTMENTS } from './SpoolLabel'
import type { LabelAdjustments } from './SpoolLabel'

const SCALE = 4   // 4× CSS pixels → ~380 dpi on a 40 × 30 mm label

// ── Color family derivation (mirrors SpoolLabel.tsx) ─────────────────────────

function hexToColorFamily(hex: string | null): string {
  if (!hex) return '—'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  if (isNaN(r) || isNaN(g) || isNaN(b)) return '—'
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (l < 26)  return 'Black'
  if (l > 229) return 'White'
  const s = max === min ? 0 : l < 128 ? (max - min) / (max + min) : (max - min) / (510 - max - min)
  if (s < 0.15) return 'Gray'
  let h = 0
  if (max === r) h = ((g - b) / (max - min)) % 6
  else if (max === g) h = (b - r) / (max - min) + 2
  else h = (r - g) / (max - min) + 4
  h = Math.round(h * 60)
  if (h < 0) h += 360
  if (h < 15 || h >= 345) return 'Red'
  if (h < 45)  return 'Orange'
  if (h < 70)  return 'Yellow'
  if (h < 150) return 'Green'
  if (h < 195) return 'Teal'
  if (h < 255) return 'Blue'
  if (h < 300) return 'Purple'
  return 'Pink'
}

// ── Font string helpers ───────────────────────────────────────────────────────

function font(weight: number, cssPx: number) {
  return `${weight} ${cssPx}px "Poppins", system-ui, sans-serif`
}
function mono(cssPx: number) {
  return `${cssPx}px "Courier New", "Lucida Console", monospace`
}
/** Rewrite a CSS-pixel font string to physical-pixel size. */
function physFont(f: string): string {
  return f.replace(/(\d+(?:\.\d+)?)px/, (_, n) => `${parseFloat(n) * SCALE}px`)
}

// ── Physical-pixel text primitives ────────────────────────────────────────────
//
// These mirror the QR-code fix: the source is generated at physical pixels so
// the canvas draws it 1-to-1, with no upscaling artefacts.
// Usage: call inside a ctx.scale(SCALE,SCALE) context; helpers temporarily
// reset the transform, draw at (cssX*SCALE, cssY*SCALE), then restore.

function fillTextSharp(
  ctx: CanvasRenderingContext2D,
  text: string,
  cssX: number, cssY: number,
  fontStr: string,
  fillStyle: string,
  baseline: CanvasTextBaseline = 'top',
  align: CanvasTextAlign = 'left',
) {
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)          // physical-pixel coordinate space
  ctx.font         = physFont(fontStr)
  ctx.fillStyle    = fillStyle
  ctx.textBaseline = baseline
  ctx.textAlign    = align
  ctx.fillText(text, Math.round(cssX * SCALE), Math.round(cssY * SCALE))
  ctx.restore()
}

/** Measure text width and return it in CSS pixels. */
function measureCss(ctx: CanvasRenderingContext2D, text: string, fontStr: string): number {
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.font = physFont(fontStr)
  const w = ctx.measureText(text).width / SCALE
  ctx.restore()
  return w
}

/** Truncate text so it fits within maxCssW CSS pixels. */
function truncCss(ctx: CanvasRenderingContext2D, text: string, maxCssW: number, fontStr: string): string {
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.font = physFont(fontStr)
  const maxPhys = maxCssW * SCALE
  let s = text
  if (ctx.measureText(s).width <= maxPhys) { ctx.restore(); return s }
  while (s.length > 1 && ctx.measureText(s + '…').width > maxPhys) s = s.slice(0, -1)
  ctx.restore()
  return s + '…'
}

// ── Font preload ──────────────────────────────────────────────────────────────

async function loadFonts() {
  await document.fonts.ready
  // Force the browser to rasterize every weight + physical size we'll use
  // so the glyph cache is warm before we start drawing.
  const weights  = [400, 600, 700, 900]
  const cssSizes = [6, 6.5, 7, 7.5, 8, 9, 10, 11, 12, 13, 14, 20, 21]
  await Promise.allSettled(
    weights.flatMap(w =>
      cssSizes.map(s =>
        document.fonts.load(`${w} ${Math.round(s * SCALE)}px "Poppins"`)
      )
    )
  )
}

// ── QR code helper ────────────────────────────────────────────────────────────

const qrCache = new Map<string, HTMLCanvasElement>()

async function makeQR(value: string, cssPx: number): Promise<HTMLCanvasElement> {
  const key = `${value}|${cssPx}`
  const hit = qrCache.get(key)
  if (hit) return hit
  const QRCode = (await import('qrcode')).default
  const c = document.createElement('canvas')
  await QRCode.toCanvas(c, value, {
    width: cssPx * SCALE,
    margin: 0,
    color: { dark: '#000000', light: '#ffffff' },
    errorCorrectionLevel: 'M',
  })
  if (qrCache.size > 120) qrCache.clear()
  qrCache.set(key, c)
  return c
}

// ── Data helpers ──────────────────────────────────────────────────────────────

function qrValue(spool: SpoolResponse, enc: QrEncoding): string {
  const fp = spool.filament
  switch (enc) {
    case 'url':     return `${window.location.origin}/s/${spool.id}`
    case 'id':      return `FH-${spool.id}`
    case 'summary': return [
      fp?.brand?.name ?? spool.brand?.name,
      spool.name ?? fp?.name,
      fp?.material,
      `${spool.fill_percentage.toFixed(0)}%`,
    ].filter(Boolean).join(' | ')
  }
}

function slotText(slot: ClassicSlot, spool: SpoolResponse): string {
  const fp = spool.filament
  switch (slot.field) {
    case 'nozzle': { const a = fp?.print_temp_min, b = fp?.print_temp_max; return (a||b)?(a&&b?`${a}–${b}°C`:a?`${a}°C`:`${b}°C`):'—' }
    case 'bed':    { const a = fp?.bed_temp_min,   b = fp?.bed_temp_max;   return (a||b)?(a&&b?`${a}–${b}°C`:a?`${a}°C`:`${b}°C`):'—' }
    case 'id':       return `${spool.id}`
    case 'color':    return fp?.color_hex ?? spool.color_hex ?? '—'
    case 'fill':     return `${spool.fill_percentage.toFixed(0)}%`
    case 'weight':   return `${spool.remaining_weight.toFixed(0)}g`
    case 'material': return fp?.material ?? '—'
    case 'diameter': return fp?.diameter ? `${fp.diameter}mm` : '—'
    case 'brand':    return fp?.brand?.name ?? spool.brand?.name ?? '—'
    case 'name':         return spool.name ?? fp?.name ?? '—'
    case 'color_family': return hexToColorFamily(fp?.color_hex ?? spool.color_hex ?? null)
    case 'color_name':   return fp?.color_name ?? '—'
    default:             return ''
  }
}

/** Evenly-spaced data rows — labels small+gray, values bold+dark. */
function drawSlotRows(
  ctx: CanvasRenderingContext2D,
  rows: ClassicSlot[], spool: SpoolResponse,
  cssX: number, cssY: number, cssW: number, cssH: number,
  compact = false, scale = 1,
) {
  if (rows.length === 0) return
  const labelFs = (compact ? 6   : 6.5) * scale
  const valFs   = (compact ? 7.5 : 8)   * scale
  const labelF  = font(400, labelFs)
  const valF    = font(700, valFs)
  const rowH    = cssH / rows.length

  rows.forEach((slot, i) => {
    const label = CLASSIC_FIELD_LABELS[slot.field] ?? ''
    const value = slotText(slot, spool)
    const ry    = cssY + i * rowH + (rowH - valFs) / 2

    let labelCssW = 0
    if (label) {
      fillTextSharp(ctx, label, cssX, ry + (valFs - labelFs) / 2, labelF, '#9ca3af', 'top', 'left')
      labelCssW = measureCss(ctx, label, labelF) + 3
    }

    const valText = truncCss(ctx, value, cssW - labelCssW, valF)
    fillTextSharp(ctx, valText, cssX + labelCssW, ry, valF, '#1f2937', 'top', 'left')
  })
}

/** Horizontal fill percentage bar. */
function drawFillBar(
  ctx: CanvasRenderingContext2D,
  pct: number, hex: string | null,
  cssX: number, cssY: number, cssW: number, cssH: number,
) {
  ctx.fillStyle = '#e5e7eb'
  ctx.beginPath(); ctx.roundRect(cssX, cssY, cssW, cssH, cssH / 2); ctx.fill()
  const fw = (cssW * Math.min(pct, 100)) / 100
  if (fw > 0) {
    ctx.fillStyle = hex ?? '#6366f1'
    ctx.beginPath(); ctx.roundRect(cssX, cssY, fw, cssH, cssH / 2); ctx.fill()
  }
  const pctF = font(600, 7)
  fillTextSharp(ctx, `${pct.toFixed(0)}%`, cssX + cssW + 14, cssY + cssH / 2, pctF, '#4b5563', 'middle', 'right')
}

// ═══════════════════════════════════════════════════════════════════════════════
// Template renderers
// ═══════════════════════════════════════════════════════════════════════════════

// ── 1. Classic Badge (151×113 = 40×30mm) ─────────────────────────────────────
// Layout: brand (top) → dark material bar (full-width) → [left: name+slots | right: QR]

async function drawClassicBadge(
  ctx: CanvasRenderingContext2D,
  spool: SpoolResponse, slots: ClassicSlot[], enc: QrEncoding,
  w: number, h: number, adj: LabelAdjustments,
) {
  const fp    = spool.filament
  const hex   = fp?.color_hex ?? spool.color_hex ?? null
  const brand = (fp?.brand?.name ?? spool.brand?.name ?? 'Unknown').toUpperCase()
  const mat   = fp?.material ?? '—'
  const diam  = fp?.diameter ? ` · ${fp.diameter}mm` : ''
  const name  = spool.name ?? fp?.name ?? '—'
  const rows  = slots.filter(s => s.enabled && s.field !== 'none' && s.field !== 'fill_bar')

  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h)

  // Brand (px-2 pt-1.5 → left=8, top=6; font 14px black)
  const F_brand = font(900, 14)
  fillTextSharp(ctx, truncCss(ctx, brand, w - 16, F_brand), 8, 6, F_brand, '#111827')
  const brandH = 6 + 14 + 2   // pt-1.5 + font + small gap

  // Material bar (full width, mt-1=4px, py=[3px], font 9px)
  const barTop = brandH + 4
  const barH   = 6 + 9        // py-[3px] each side + font
  const F_mat  = font(700, 9)
  const F_hex  = mono(7.5)
  ctx.fillStyle = '#111827'; ctx.fillRect(0, barTop, w, barH)
  const matStr = `${mat}${diam}`
  const hexW   = hex ? measureCss(ctx, hex, F_hex) + 4 : 0
  const matMaxW = w - 16 - hexW
  fillTextSharp(ctx, truncCss(ctx, matStr, matMaxW, F_mat), 8, barTop + (barH - 9) / 2, F_mat, '#ffffff', 'top', 'left')
  if (hex) fillTextSharp(ctx, hex, w - 8, barTop + barH / 2, F_hex, '#d1d5db', 'middle', 'right')

  // Body starts below bar (pt-1 = 4px below bar)
  const bodyTop = barTop + barH + 4

  // QR — right column, centered on default anchor, then offset applied
  const BASE_QR = 56
  const adjQrSz = Math.max(10, Math.round(BASE_QR * adj.qrScale))
  const qrPadX  = 6
  const qrColW  = BASE_QR + qrPadX * 2   // layout width never changes
  const bodyH   = h - bodyTop - 6
  const qrCX    = w - qrColW + qrPadX + BASE_QR / 2   // center of default QR column
  const qrCY    = bodyTop + bodyH / 2
  const qrImg   = await makeQR(qrValue(spool, enc), adjQrSz)
  ctx.drawImage(qrImg, qrCX - adjQrSz / 2 + adj.qrOffsetX, qrCY - adjQrSz / 2 + adj.qrOffsetY, adjQrSz, adjQrSz)

  // Left column — name then slots, with text adjustments
  const textX  = 8 + adj.textOffsetX
  const textW  = w - qrColW - 8 - 4
  const F_name = font(700, 9 * adj.textScale)
  const nameY  = bodyTop + adj.textOffsetY
  fillTextSharp(ctx, truncCss(ctx, name, textW, F_name), textX, nameY, F_name, '#1f2937')
  const slotsTop = nameY + 9 * adj.textScale + 2
  drawSlotRows(ctx, rows, spool, textX, slotsTop, textW, bodyH - (9 + 2), false, adj.textScale)
}

// ── 2. Wide Card (189×113 = 50×30mm) ─────────────────────────────────────────
// Layout: color stripe left | [left: brand+name+slots+fillbar | right: QR full-height]

async function drawWideCard(
  ctx: CanvasRenderingContext2D,
  spool: SpoolResponse, slots: ClassicSlot[], enc: QrEncoding,
  w: number, h: number, adj: LabelAdjustments,
) {
  const fp      = spool.filament
  const hex     = fp?.color_hex ?? spool.color_hex ?? null
  const brand   = fp?.brand?.name ?? spool.brand?.name ?? ''
  const name    = spool.name ?? fp?.name ?? '—'
  const rows    = slots.filter(s => s.enabled && s.field !== 'none' && s.field !== 'fill_bar')
  const hasFill = slots.some(s => s.enabled && s.field === 'fill_bar')

  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h)
  // Color stripe (w-2 = 8px)
  ctx.fillStyle = hex ?? '#6366f1'; ctx.fillRect(0, 0, 8, h)

  // QR — right column, centered on anchor, then offset
  const BASE_QR = 61
  const adjQrSz = Math.max(10, Math.round(BASE_QR * adj.qrScale))
  const qrPadX  = 8
  const qrColW  = BASE_QR + qrPadX * 2
  const qrCX    = w - qrColW + qrPadX + BASE_QR / 2
  const qrImg   = await makeQR(qrValue(spool, enc), adjQrSz)
  ctx.drawImage(qrImg, qrCX - adjQrSz / 2 + adj.qrOffsetX, h / 2 - adjQrSz / 2 + adj.qrOffsetY, adjQrSz, adjQrSz)

  // Left text column
  const textX = 16 + adj.textOffsetX
  const textW = w - 8 - qrColW - 8
  let   y     = 6 + adj.textOffsetY

  if (brand) {
    const F = font(400, 7 * adj.textScale)
    fillTextSharp(ctx, truncCss(ctx, brand.toUpperCase(), textW, F), textX, y, F, '#9ca3af')
    y += 7 * adj.textScale + 4
  }
  const F_name = font(700, 11 * adj.textScale)
  fillTextSharp(ctx, truncCss(ctx, name, textW, F_name), textX, y, F_name, '#111827')
  y += 11 * adj.textScale + 4

  const dataH = h - y - (hasFill ? 16 : 6)
  drawSlotRows(ctx, rows, spool, textX, y, textW, Math.max(1, dataH), true, adj.textScale)
  if (hasFill) drawFillBar(ctx, spool.fill_percentage, hex, textX, h - 10, textW, 5)
}

// ── 3. Slim Tag (151×91 = 40×24mm) ───────────────────────────────────────────

async function drawSlimTag(
  ctx: CanvasRenderingContext2D,
  spool: SpoolResponse, slots: ClassicSlot[], enc: QrEncoding,
  w: number, h: number, adj: LabelAdjustments,
) {
  const fp      = spool.filament
  const hex     = fp?.color_hex ?? spool.color_hex ?? null
  const brand   = fp?.brand?.name ?? spool.brand?.name ?? ''
  const mat     = `${fp?.material ?? '—'}${fp?.diameter ? ` · ${fp.diameter}mm` : ''}`
  const name    = spool.name ?? fp?.name ?? '—'
  const rows    = slots.filter(s => s.enabled && s.field !== 'none' && s.field !== 'fill_bar')
  const hasFill = slots.some(s => s.enabled && s.field === 'fill_bar')

  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h)

  const hdrH = 8
  ctx.fillStyle = hex ?? '#6366f1'; ctx.fillRect(0, 0, w, hdrH)
  const F_hdr = font(600, 7)
  if (brand) fillTextSharp(ctx, truncCss(ctx, brand, (w / 2) - 6, F_hdr), 6, 1, F_hdr, 'rgba(255,255,255,0.9)')
  fillTextSharp(ctx, truncCss(ctx, mat, (w / 2) - 6, F_hdr), w - 4, 1, F_hdr, 'rgba(255,255,255,0.9)', 'top', 'right')

  const BASE_QR = 50
  const adjQrSz = Math.max(10, Math.round(BASE_QR * adj.qrScale))
  const bodyY   = hdrH + 2
  const bodyH   = h - bodyY - (hasFill ? 12 : 4)
  const qrImg   = await makeQR(qrValue(spool, enc), adjQrSz)
  // QR anchored to left side, centered vertically, then offset
  ctx.drawImage(qrImg, 4 + (BASE_QR - adjQrSz) / 2 + adj.qrOffsetX, bodyY + (bodyH - adjQrSz) / 2 + adj.qrOffsetY, adjQrSz, adjQrSz)

  const textX  = 4 + BASE_QR + 4 + adj.textOffsetX
  const textW  = w - textX - 4
  const nameY  = bodyY + 2 + adj.textOffsetY
  const F_name = font(700, 10 * adj.textScale)
  fillTextSharp(ctx, truncCss(ctx, name, textW, F_name), textX, nameY, F_name, '#111827')
  drawSlotRows(ctx, rows, spool, textX, nameY + 14 * adj.textScale, textW, bodyH - 14, true, adj.textScale)
  if (hasFill) drawFillBar(ctx, spool.fill_percentage, hex, 4, h - 10, w - 8, 4)
}

// ── 4. Micro Strip (151×45 = 40×12mm) ────────────────────────────────────────

async function drawMicroStrip(
  ctx: CanvasRenderingContext2D,
  spool: SpoolResponse, slots: ClassicSlot[], enc: QrEncoding,
  w: number, h: number, adj: LabelAdjustments,
) {
  const fp       = spool.filament
  const hex      = fp?.color_hex ?? spool.color_hex ?? null
  const name     = spool.name ?? fp?.name ?? '—'
  const hasFill  = slots.some(s => s.enabled && s.field === 'fill_bar')
  const textSlot = slots.find(s => s.enabled && s.field !== 'fill_bar' && s.field !== 'none')

  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = hex ?? '#6366f1'; ctx.fillRect(0, 0, 6, h)

  const BASE_QR = 32
  const adjQrSz = Math.max(10, Math.round(BASE_QR * adj.qrScale))
  const qrImg   = await makeQR(qrValue(spool, enc), adjQrSz)
  ctx.drawImage(qrImg, 8 + (BASE_QR - adjQrSz) / 2 + adj.qrOffsetX, (h - adjQrSz) / 2 + adj.qrOffsetY, adjQrSz, adjQrSz)

  const textX  = 8 + BASE_QR + 4 + adj.textOffsetX
  const fillW  = hasFill ? 56 : 0
  const textW  = w - textX - fillW - 4
  const midY   = h / 2 + adj.textOffsetY

  const F_name = font(700, 8 * adj.textScale)
  fillTextSharp(ctx, truncCss(ctx, name, textW, F_name), textX, midY - 4 * adj.textScale, F_name, '#111827', 'middle')
  if (textSlot) {
    const F_sec = font(400, 7 * adj.textScale)
    fillTextSharp(ctx, truncCss(ctx, slotText(textSlot, spool), textW, F_sec), textX, midY + 5 * adj.textScale, F_sec, '#6b7280', 'middle')
  }
  if (hasFill) drawFillBar(ctx, spool.fill_percentage, hex, w - fillW - 2, h / 2 - 3, fillW - 12, 5)
}

// ── 5. Square Classic (151×113 = 40×30mm) ────────────────────────────────────

async function drawSquareClassic(
  ctx: CanvasRenderingContext2D,
  spool: SpoolResponse, slots: ClassicSlot[], enc: QrEncoding,
  w: number, h: number, adj: LabelAdjustments,
) {
  const fp      = spool.filament
  const hex     = fp?.color_hex ?? spool.color_hex ?? null
  const brand   = fp?.brand?.name ?? spool.brand?.name ?? ''
  const name    = spool.name ?? fp?.name ?? '—'
  const mat     = `${fp?.material ?? '—'}${fp?.diameter ? ` · ${fp.diameter}mm` : ''}`
  const rows    = slots.filter(s => s.enabled && s.field !== 'none' && s.field !== 'fill_bar')
  const hasFill = slots.some(s => s.enabled && s.field === 'fill_bar')

  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = hex ?? '#6366f1'; ctx.fillRect(0, 0, 8, h)

  const cx    = 8 + (w - 8) / 2
  const textW = w - 8 - 16

  if (brand) {
    const F = font(400, 7)
    fillTextSharp(ctx, truncCss(ctx, brand.toUpperCase(), textW, F), cx, 4, F, '#9ca3af', 'top', 'center')
  }
  const F_name = font(700, 11)
  fillTextSharp(ctx, truncCss(ctx, name, textW, F_name), cx, brand ? 13 : 6, F_name, '#111827', 'top', 'center')
  const F_mat = font(400, 7.5)
  fillTextSharp(ctx, truncCss(ctx, mat, textW, F_mat), cx, brand ? 27 : 20, F_mat, '#6b7280', 'top', 'center')
  const headerEnd = brand ? 38 : 30

  const footerH = (rows.length > 0 ? rows.length * 9 : 0) + (hasFill ? 10 : 0) + 6
  const footerY = h - footerH
  const midH    = footerY - headerEnd
  const BASE_QR = 49
  const adjQrSz = Math.max(10, Math.round(BASE_QR * adj.qrScale))
  const qrImg   = await makeQR(qrValue(spool, enc), adjQrSz)
  ctx.drawImage(qrImg, cx - adjQrSz / 2 + adj.qrOffsetX, headerEnd + (midH - adjQrSz) / 2 + adj.qrOffsetY, adjQrSz, adjQrSz)

  if (rows.length > 0) drawSlotRows(ctx, rows, spool, 10 + adj.textOffsetX, footerY + adj.textOffsetY, textW, rows.length * 9, true, adj.textScale)
  if (hasFill) drawFillBar(ctx, spool.fill_percentage, hex, 10, h - 10, textW, 4)
}

// ── 6. Tall Card (113×151 = 30×40mm) ─────────────────────────────────────────

async function drawTallCard(
  ctx: CanvasRenderingContext2D,
  spool: SpoolResponse, slots: ClassicSlot[], enc: QrEncoding,
  w: number, h: number, adj: LabelAdjustments,
) {
  const fp      = spool.filament
  const hex     = fp?.color_hex ?? spool.color_hex ?? null
  const brand   = fp?.brand?.name ?? spool.brand?.name ?? ''
  const name    = spool.name ?? fp?.name ?? '—'
  const mat     = `${fp?.material ?? '—'}${fp?.diameter ? ` · ${fp.diameter}mm` : ''}`
  const rows    = slots.filter(s => s.enabled && s.field !== 'none' && s.field !== 'fill_bar')
  const hasFill = slots.some(s => s.enabled && s.field === 'fill_bar')

  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h)

  const hdrH = 20
  ctx.fillStyle = hex ?? '#6366f1'; ctx.fillRect(0, 0, w, hdrH)
  const F_hdr = font(600, 7)
  fillTextSharp(ctx, brand ? `◉  ${brand}` : '◉', w / 2, hdrH / 2, F_hdr, 'rgba(255,255,255,0.9)', 'middle', 'center')

  const F_name = font(700, 10)
  fillTextSharp(ctx, truncCss(ctx, name, w - 12, F_name), w / 2, hdrH + 5, F_name, '#111827', 'top', 'center')
  const F_mat = font(400, 7)
  fillTextSharp(ctx, truncCss(ctx, mat, w - 12, F_mat), w / 2, hdrH + 19, F_mat, '#6b7280', 'top', 'center')
  const headerEnd = hdrH + 30

  const footerH = (rows.length > 0 ? rows.length * 9 : 0) + (hasFill ? 10 : 0) + 6
  const footerY = h - footerH
  const midH    = footerY - headerEnd
  const BASE_QR = 58
  const adjQrSz = Math.max(10, Math.round(BASE_QR * adj.qrScale))
  const qrImg   = await makeQR(qrValue(spool, enc), adjQrSz)
  ctx.drawImage(qrImg, w / 2 - adjQrSz / 2 + adj.qrOffsetX, headerEnd + (midH - adjQrSz) / 2 + adj.qrOffsetY, adjQrSz, adjQrSz)

  if (rows.length > 0) drawSlotRows(ctx, rows, spool, 6 + adj.textOffsetX, footerY + adj.textOffsetY, w - 12, rows.length * 9, true, adj.textScale)
  if (hasFill) drawFillBar(ctx, spool.fill_percentage, hex, 6, h - 10, w - 12, 4)
}

// ── 7. Narrow Portrait (95×151 = 25×40mm) ────────────────────────────────────

async function drawNarrowPortrait(
  ctx: CanvasRenderingContext2D,
  spool: SpoolResponse, slots: ClassicSlot[], enc: QrEncoding,
  w: number, h: number, adj: LabelAdjustments,
) {
  const fp      = spool.filament
  const hex     = fp?.color_hex ?? spool.color_hex ?? null
  const name    = spool.name ?? fp?.name ?? '—'
  const rows    = slots.filter(s => s.enabled && s.field !== 'none' && s.field !== 'fill_bar')
  const hasFill = slots.some(s => s.enabled && s.field === 'fill_bar')

  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = hex ?? '#6366f1'; ctx.fillRect(0, 0, w, 8)

  const BASE_QR = 61
  const adjQrSz = Math.max(10, Math.round(BASE_QR * adj.qrScale))
  const qrImg   = await makeQR(qrValue(spool, enc), adjQrSz)
  ctx.drawImage(qrImg, w / 2 - adjQrSz / 2 + adj.qrOffsetX, 10 + adj.qrOffsetY, adjQrSz, adjQrSz)

  const textCX = w / 2 + adj.textOffsetX
  const textY  = 10 + BASE_QR + 4 + adj.textOffsetY   // position based on base size so text doesn't jump
  const F_name = font(700, 8 * adj.textScale)
  fillTextSharp(ctx, truncCss(ctx, name, w - 8, F_name), textCX, textY, F_name, '#111827', 'top', 'center')

  rows.forEach((slot, i) => {
    const value = slotText(slot, spool)
    if (!value || value === '—') return
    const F = font(400, 7 * adj.textScale)
    fillTextSharp(ctx, truncCss(ctx, value, w - 8, F), textCX, textY + 12 * adj.textScale + i * 9 * adj.textScale, F, '#6b7280', 'top', 'center')
  })

  if (hasFill) drawFillBar(ctx, spool.fill_percentage, hex, 6, h - 10, w - 12, 4)
}

// ═══════════════════════════════════════════════════════════════════════════════
// Labelife AML generator
// ═══════════════════════════════════════════════════════════════════════════════

export function generateAml(
  pngDataUrl: string,
  labelName: string,
  widthMm: number,
  heightMm: number,
): string {
  const base64   = pngDataUrl.replace(/^data:image\/png;base64,/, '')
  const wInt     = Math.round(widthMm)
  const hInt     = Math.round(heightMm)
  const typeName = `White-${wInt}${hInt}`
  const wInch    = (widthMm / 25.4).toFixed(3)
  const hInch    = (heightMm / 25.4).toFixed(3)

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<LPAPI version="1.6">
      <labelName>${labelName}</labelName>
      <paperName>Custom Label</paperName>
      <isPrintHorizontal>0</isPrintHorizontal>
      <labelHeight>${heightMm.toFixed(3)}</labelHeight>
      <labelWidth>${widthMm.toFixed(3)}</labelWidth>
      <validBoundsX>1</validBoundsX>
      <validBoundsY>1</validBoundsY>
      <validBoundsWidth>${wInt - 2}</validBoundsWidth>
      <validBoundsHeight>${hInt - 2}</validBoundsHeight>
      <paperType>0</paperType>
      <paperBackground>#ffffff</paperBackground>
      <paperForeground>#000000</paperForeground>
      <DisplaySize_mm>${widthMm.toFixed(2)}mm * ${heightMm.toFixed(2)}mm</DisplaySize_mm>
      <DisplaySize_in>${wInch}inch * ${hInch}inch</DisplaySize_in>
      <isRotate180>0</isRotate180>
      <isBannerMode>0</isBannerMode>
      <isCustomSize>0</isCustomSize>
      <leftBlank>0</leftBlank>
      <rightBlank>0</rightBlank>
      <upBlank>0</upBlank>
      <downBlank>0</downBlank>
      <typeName>${typeName}</typeName>
      <showDisplayMm>${widthMm.toFixed(1)}mm * ${heightMm.toFixed(1)}mm</showDisplayMm>
      <showDisplayIn>${(widthMm / 25.4).toFixed(2)}inch * ${(heightMm / 25.4).toFixed(2)}inch</showDisplayIn>
      <contents>
          <WdPage>
              <masksToBoundsType>0</masksToBoundsType>
              <borderDisplay>0</borderDisplay>
              <isAutoHeight>0</isAutoHeight>
              <lineType>0</lineType>
              <borderWidth>1</borderWidth>
              <borderColor>#000000</borderColor>
              <lockMovement>0</lockMovement>
              <contents><Image>
                    <lineType>0</lineType>
                    <content>${base64}</content>
                    <height>${heightMm.toFixed(3)}</height>
                    <width>${widthMm.toFixed(3)}</width>
                    <y>0.000</y>
                    <x>0.000</x>
                    <orientation>0.000000</orientation>
                    <lockMovement>0</lockMovement>
                    <borderDisplay>0</borderDisplay>
                    <borderHeight>0.7055555449591742</borderHeight>
                    <borderColor>#000000</borderColor>
                    <id>2150144943</id>
                    <objectId>2153023841</objectId>
                    <imageEffect>0</imageEffect>
                    <antiColor>0</antiColor>
                    <isRatioScale>1</isRatioScale>
                    <imageType>0</imageType>
                    <isMirror>0</isMirror>
                    <isRedBlack>0</isRedBlack>
              </Image></contents>
              <columnCount>0</columnCount>
              <isRibbonLabel>0</isRibbonLabel>
          </WdPage>
      </contents>
</LPAPI>`
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public export functions
// ═══════════════════════════════════════════════════════════════════════════════

export async function renderSpoolLabel(
  spool: SpoolResponse,
  template: LabelTemplate,
  slots: ClassicSlot[],
  encoding: QrEncoding,
  adj: LabelAdjustments = DEFAULT_LABEL_ADJUSTMENTS,
): Promise<string> {
  await loadFonts()
  const { w, h } = LABEL_PX[template]
  const canvas   = document.createElement('canvas')
  canvas.width   = w * SCALE
  canvas.height  = h * SCALE
  const ctx      = canvas.getContext('2d')!
  ctx.scale(SCALE, SCALE)

  switch (template) {
    case 'classic-badge':   await drawClassicBadge(ctx, spool, slots, encoding, w, h, adj);   break
    case 'wide-card':       await drawWideCard(ctx, spool, slots, encoding, w, h, adj);       break
    case 'slim-tag':        await drawSlimTag(ctx, spool, slots, encoding, w, h, adj);        break
    case 'micro-strip':     await drawMicroStrip(ctx, spool, slots, encoding, w, h, adj);     break
    case 'square-classic':  await drawSquareClassic(ctx, spool, slots, encoding, w, h, adj);  break
    case 'tall-card':       await drawTallCard(ctx, spool, slots, encoding, w, h, adj);       break
    case 'narrow-portrait': await drawNarrowPortrait(ctx, spool, slots, encoding, w, h, adj); break
  }

  return canvas.toDataURL('image/png')
}

export async function renderLocationLabel(location: LocationResponse): Promise<string> {
  await loadFonts()

  const w = 151, h = 113
  const canvas  = document.createElement('canvas')
  canvas.width  = w * SCALE
  canvas.height = h * SCALE
  const ctx     = canvas.getContext('2d')!
  ctx.scale(SCALE, SCALE)

  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = '#000000'; ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1)

  const hdrH = 19
  ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, w, hdrH)

  const F_hdr = font(700, 6.5)
  fillTextSharp(ctx, 'STORAGE LOCATION', 18, hdrH / 2, F_hdr, '#ffffff', 'middle', 'left')
  fillTextSharp(ctx, 'FH', w - 6, hdrH / 2, font(600, 6), 'rgba(255,255,255,0.35)', 'middle', 'right')

  const qrColW = 78
  const qrSize = 72
  const footH  = 13
  const bodyH  = h - hdrH - footH
  const qrURL  = `${window.location.origin}/l/${location.id}`
  const qrImg  = await makeQR(qrURL, qrSize)
  ctx.drawImage(qrImg, w - qrColW + (qrColW - qrSize) / 2, hdrH + (bodyH - qrSize) / 2, qrSize, qrSize)

  ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(w - qrColW, hdrH); ctx.lineTo(w - qrColW, h - footH); ctx.stroke()

  const infoW = w - qrColW - 14
  let cy = hdrH + 5

  // Word-wrap location name (up to 2 lines)
  const F_locName = font(900, 12)
  const words = location.name.split(' ')
  let line1 = '', line2 = ''
  for (const word of words) {
    const test = line1 ? `${line1} ${word}` : word
    if (measureCss(ctx, test, F_locName) <= infoW) { line1 = test }
    else if (!line2) { line2 = word }
    else { line2 = truncCss(ctx, `${line2} ${word}`, infoW, F_locName) }
  }
  fillTextSharp(ctx, line1, 7, cy, F_locName, '#000000'); cy += 14
  if (line2) { fillTextSharp(ctx, truncCss(ctx, line2, infoW, F_locName), 7, cy, F_locName, '#000000'); cy += 14 }

  ctx.fillStyle = '#d1d5db'; ctx.fillRect(7, cy, infoW, 1); cy += 5

  const F_count = font(500, 7.5)
  fillTextSharp(ctx, `${location.spool_count} spool${location.spool_count !== 1 ? 's' : ''}`, 13, cy, F_count, '#374151')
  cy += 11

  if (location.is_dry_box) {
    ctx.strokeStyle = '#000'; ctx.lineWidth = 0.8
    ctx.strokeRect(7, cy, 32, 9)
    fillTextSharp(ctx, 'DRY BOX', 9, cy + 1.5, font(800, 6), '#000000')
    cy += 12
  }

  if (location.description) {
    fillTextSharp(ctx, truncCss(ctx, location.description, infoW, font(400, 6.5)), 7, cy, font(400, 6.5), '#6b7280')
  }

  ctx.fillStyle = '#111111'; ctx.fillRect(0, h - footH, w, footH)
  const F_foot = mono(6.5)
  fillTextSharp(ctx, `LOC-${location.id}`, w / 2, h - footH / 2, F_foot, 'rgba(255,255,255,0.6)', 'middle', 'center')

  return canvas.toDataURL('image/png')
}
