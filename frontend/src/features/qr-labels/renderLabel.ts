/**
 * Pure-canvas label renderer.
 * Draws QR labels directly onto a <canvas> — no DOM capture needed.
 */

import type { SpoolResponse, LocationResponse } from '@/types/api'
import type { LabelTemplate, ClassicSlot, QrEncoding } from './SpoolLabel'
import { LABEL_PX, CLASSIC_FIELD_LABELS } from './SpoolLabel'

const SCALE = 3

// ── Font helpers ──────────────────────────────────────────────────────────────

async function loadFonts() { await document.fonts.ready }

function font(weight: number, size: number) {
  return `${weight} ${size}px "Poppins", system-ui, sans-serif`
}
function mono(size: number) {
  return `${size}px "Courier New", "Lucida Console", monospace`
}

// ── Text helpers ──────────────────────────────────────────────────────────────

function trunc(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text
  let s = text
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1)
  return s + '…'
}

// ── QR code helper ────────────────────────────────────────────────────────────

async function makeQR(value: string, size: number): Promise<HTMLCanvasElement> {
  const QRCode = (await import('qrcode')).default
  const c = document.createElement('canvas')
  await QRCode.toCanvas(c, value, {
    width: size, margin: 0,
    color: { dark: '#000000', light: '#ffffff' },
    errorCorrectionLevel: 'M',
  })
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
    case 'name':     return spool.name ?? fp?.name ?? '—'
    default:         return ''
  }
}

function drawSlotRows(
  ctx: CanvasRenderingContext2D,
  rows: ClassicSlot[], spool: SpoolResponse,
  x: number, y: number, w: number, h: number,
  compact = false,
) {
  if (rows.length === 0) return
  // Label at a smaller size (gray), value at a slightly larger bold size.
  // Measuring the label dynamically lets the value use all remaining width
  // — critical when the left column is narrow next to a large QR code.
  const labelFs = compact ? 6 : 6.5
  const valFs   = compact ? 7.5 : 8
  const rowH    = h / rows.length

  rows.forEach((slot, i) => {
    const label = CLASSIC_FIELD_LABELS[slot.field] ?? ''
    const value = slotText(slot, spool)
    const ry    = y + i * rowH + (rowH - valFs) / 2

    let labelW = 0
    if (label) {
      ctx.font = font(400, labelFs); ctx.fillStyle = '#9ca3af'; ctx.textBaseline = 'top'
      // Vertically centre the smaller label text against the taller value text
      ctx.fillText(label, x, ry + (valFs - labelFs) / 2)
      labelW = ctx.measureText(label).width + 3
    }

    ctx.font = font(700, valFs); ctx.fillStyle = '#1f2937'
    ctx.fillText(trunc(ctx, value, w - labelW), x + labelW, ry)
  })
}

function drawFillBar(
  ctx: CanvasRenderingContext2D,
  pct: number, hex: string | null,
  x: number, y: number, w: number, h: number,
) {
  ctx.fillStyle = '#e5e7eb'; ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fill()
  const fw = (w * Math.min(pct, 100)) / 100
  if (fw > 0) { ctx.fillStyle = hex ?? '#6366f1'; ctx.beginPath(); ctx.roundRect(x, y, fw, h, h / 2); ctx.fill() }
  ctx.font = font(600, 7); ctx.fillStyle = '#4b5563'; ctx.textBaseline = 'middle'; ctx.textAlign = 'right'
  ctx.fillText(`${pct.toFixed(0)}%`, x + w + 14, y + h / 2); ctx.textAlign = 'left'
}

// ═══════════════════════════════════════════════════════════════════════════════
// Template renderers
// ═══════════════════════════════════════════════════════════════════════════════

// ── 1. Classic Badge (151×113 = 40×30mm) ─────────────────────────────────────
// QR: 65px — right side, spans the full content area height.
// Left column: spool name (compact) + all data rows stacked below.
// Labels rendered at 6px (gray), values at 7.5px (bold) with dynamic width
// allocation so even long values like "250–280°C" have room to breathe.

async function drawClassicBadge(
  ctx: CanvasRenderingContext2D,
  spool: SpoolResponse, slots: ClassicSlot[], enc: QrEncoding,
  w: number, h: number,
) {
  const fp    = spool.filament
  const hex   = fp?.color_hex ?? spool.color_hex ?? null
  const brand = (fp?.brand?.name ?? spool.brand?.name ?? 'Unknown').toUpperCase()
  const mat   = `${fp?.material ?? '—'}${fp?.diameter ? ` · ${fp.diameter}mm` : ''}`
  const name  = spool.name ?? fp?.name ?? '—'
  const rows  = slots.filter(s => s.enabled && s.field !== 'none' && s.field !== 'fill_bar')
  const hasFill = slots.some(s => s.enabled && s.field === 'fill_bar')

  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h)
  ctx.textBaseline = 'top'

  // ── Brand strip ───────────────────────────────────────────────────
  ctx.font = font(900, 12); ctx.fillStyle = '#111827'
  ctx.fillText(trunc(ctx, brand, w - 16), 8, 4)
  const afterBrand = 4 + 12 + 3

  // ── Material bar ──────────────────────────────────────────────────
  const barH = 15
  ctx.fillStyle = '#111827'; ctx.fillRect(0, afterBrand, w, barH)
  ctx.font = mono(9.5); ctx.fillStyle = '#d1d5db'
  const hexW = hex ? ctx.measureText(hex).width + 6 : 0
  if (hex) { ctx.textAlign = 'right'; ctx.fillText(hex, w - 6, afterBrand + 3); ctx.textAlign = 'left' }
  ctx.font = font(700, 9); ctx.fillStyle = '#ffffff'
  ctx.fillText(trunc(ctx, mat, w - 14 - hexW), 6, afterBrand + 3)

  // ── Content area starts here ──────────────────────────────────────
  const contentY = afterBrand + barH + 2

  // QR — 65px, right side, spans from contentY to near bottom
  const botPad = 4
  const qrSize = 65
  const qrX    = w - botPad - qrSize        // x=82
  const qrY    = contentY                    // top-aligned with content
  const qrImg  = await makeQR(qrValue(spool, enc), qrSize)
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize)

  // ── Left column ───────────────────────────────────────────────────
  // Width = from left pad to QR with a small gap: 151-4-65-4-8 = 70px
  const colX = 8
  const colW = qrX - 4 - colX              // 70px

  // Spool name — compact single line above the data rows
  ctx.font = font(700, 8); ctx.fillStyle = '#1f2937'
  ctx.fillText(trunc(ctx, name, colW), colX, contentY + 1)
  const nameH = 10   // 8px text + 2px gap

  // Data rows fill the rest of the left column, aligned to QR bottom
  const rowsY = contentY + nameH
  const rowsH = qrY + qrSize - rowsY - botPad

  if (hasFill && rows.length === 0) {
    drawFillBar(ctx, spool.fill_percentage, hex, colX, rowsY + rowsH - 5, colW, 5)
  } else {
    // compact=true → 6px labels, 7.5px values — fits all text in 70px column
    drawSlotRows(ctx, rows, spool, colX, rowsY, colW, rowsH, true)
  }
}

// ── 2. Wide Card (189×113 = 50×30mm) ─────────────────────────────────────────
// QR: 62px (was 36) — right column spans full content height

async function drawWideCard(
  ctx: CanvasRenderingContext2D,
  spool: SpoolResponse, slots: ClassicSlot[], enc: QrEncoding,
  w: number, h: number,
) {
  const fp      = spool.filament
  const hex     = fp?.color_hex ?? spool.color_hex ?? null
  const brand   = fp?.brand?.name ?? spool.brand?.name ?? ''
  const name    = spool.name ?? fp?.name ?? '—'
  const rows    = slots.filter(s => s.enabled && s.field !== 'none' && s.field !== 'fill_bar')
  const hasFill = slots.some(s => s.enabled && s.field === 'fill_bar')

  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h)
  ctx.textBaseline = 'top'

  // Left color stripe
  ctx.fillStyle = hex ?? '#6366f1'; ctx.fillRect(0, 0, 8, h)

  // QR — 62px, right side, vertically centered
  const qrSize = 62
  const qrImg  = await makeQR(qrValue(spool, enc), qrSize)
  const qrX    = w - 6 - qrSize
  const qrY    = (h - qrSize) / 2
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize)

  // Text column (left of QR)
  const textX  = 10
  const textW  = qrX - 4 - textX   // gap from QR

  if (brand) {
    ctx.font = font(400, 7); ctx.fillStyle = '#9ca3af'
    ctx.fillText(trunc(ctx, brand.toUpperCase(), textW), textX, 8)
  }
  ctx.font = font(700, 11); ctx.fillStyle = '#111827'
  ctx.fillText(trunc(ctx, name, textW), textX, brand ? 17 : 10)

  const dataY = brand ? 30 : 24
  const dataH = h - dataY - (hasFill ? 14 : 6)
  drawSlotRows(ctx, rows, spool, textX, dataY, textW, dataH, true)

  if (hasFill) {
    drawFillBar(ctx, spool.fill_percentage, hex, textX, h - 10, textW, 5)
  }
}

// ── 3. Slim Tag (151×91 = 40×24mm) ───────────────────────────────────────────
// QR: 58px (was 42)

async function drawSlimTag(
  ctx: CanvasRenderingContext2D,
  spool: SpoolResponse, slots: ClassicSlot[], enc: QrEncoding,
  w: number, h: number,
) {
  const fp      = spool.filament
  const hex     = fp?.color_hex ?? spool.color_hex ?? null
  const brand   = fp?.brand?.name ?? spool.brand?.name ?? ''
  const mat     = `${fp?.material ?? '—'}${fp?.diameter ? ` · ${fp.diameter}mm` : ''}`
  const name    = spool.name ?? fp?.name ?? '—'
  const rows    = slots.filter(s => s.enabled && s.field !== 'none' && s.field !== 'fill_bar')
  const hasFill = slots.some(s => s.enabled && s.field === 'fill_bar')

  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h)
  ctx.textBaseline = 'top'

  // Colored header bar (8px)
  const hdrH = 8
  ctx.fillStyle = hex ?? '#6366f1'; ctx.fillRect(0, 0, w, hdrH)
  ctx.font = font(600, 7); ctx.fillStyle = 'rgba(255,255,255,0.9)'
  if (brand) ctx.fillText(trunc(ctx, brand, (w / 2) - 6), 6, 1)
  ctx.textAlign = 'right'
  ctx.fillText(trunc(ctx, mat, (w / 2) - 6), w - 4, 1)
  ctx.textAlign = 'left'

  // Body: QR left (58px), text right
  const qrSize  = 58
  const bodyY   = hdrH + 2
  const bodyH   = h - bodyY - (hasFill ? 12 : 4)
  const qrImg   = await makeQR(qrValue(spool, enc), qrSize)
  ctx.drawImage(qrImg, 4, bodyY + (bodyH - qrSize) / 2, qrSize, qrSize)

  const textX = 4 + qrSize + 4
  const textW = w - textX - 4
  ctx.font = font(700, 10); ctx.fillStyle = '#111827'
  ctx.fillText(trunc(ctx, name, textW), textX, bodyY + 2)
  drawSlotRows(ctx, rows, spool, textX, bodyY + 14, textW, bodyH - 14, true)

  if (hasFill) drawFillBar(ctx, spool.fill_percentage, hex, 4, h - 10, w - 8, 4)
}

// ── 4. Micro Strip (151×45 = 40×12mm) ────────────────────────────────────────
// QR: 38px (was 28) — very constrained by label height

async function drawMicroStrip(
  ctx: CanvasRenderingContext2D,
  spool: SpoolResponse, slots: ClassicSlot[], enc: QrEncoding,
  w: number, h: number,
) {
  const fp       = spool.filament
  const hex      = fp?.color_hex ?? spool.color_hex ?? null
  const name     = spool.name ?? fp?.name ?? '—'
  const hasFill  = slots.some(s => s.enabled && s.field === 'fill_bar')
  const textSlot = slots.find(s => s.enabled && s.field !== 'fill_bar' && s.field !== 'none')

  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h)
  ctx.textBaseline = 'middle'

  // Left stripe
  ctx.fillStyle = hex ?? '#6366f1'; ctx.fillRect(0, 0, 6, h)

  // QR — 38px (fits within 45px height with 3.5px margin each side)
  const qrSize = 38
  const qrImg  = await makeQR(qrValue(spool, enc), qrSize)
  ctx.drawImage(qrImg, 8, (h - qrSize) / 2, qrSize, qrSize)

  const textX = 8 + qrSize + 4
  const fillW = hasFill ? 56 : 0
  const textW = w - textX - fillW - 4

  ctx.font = font(700, 8); ctx.fillStyle = '#111827'
  ctx.fillText(trunc(ctx, name, textW), textX, h / 2 - 4)
  if (textSlot) {
    ctx.font = font(400, 7); ctx.fillStyle = '#6b7280'
    ctx.fillText(trunc(ctx, slotText(textSlot, spool), textW), textX, h / 2 + 5)
  }

  if (hasFill) drawFillBar(ctx, spool.fill_percentage, hex, w - fillW - 2, h / 2 - 3, fillW - 12, 5)
}

// ── 5. Square Classic (151×113 = 40×30mm) ────────────────────────────────────
// QR: 65px (was 46) — centered between header and footer

async function drawSquareClassic(
  ctx: CanvasRenderingContext2D,
  spool: SpoolResponse, slots: ClassicSlot[], enc: QrEncoding,
  w: number, h: number,
) {
  const fp      = spool.filament
  const hex     = fp?.color_hex ?? spool.color_hex ?? null
  const brand   = fp?.brand?.name ?? spool.brand?.name ?? ''
  const name    = spool.name ?? fp?.name ?? '—'
  const mat     = `${fp?.material ?? '—'}${fp?.diameter ? ` · ${fp.diameter}mm` : ''}`
  const rows    = slots.filter(s => s.enabled && s.field !== 'none' && s.field !== 'fill_bar')
  const hasFill = slots.some(s => s.enabled && s.field === 'fill_bar')

  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h)
  ctx.textBaseline = 'top'

  // Left stripe
  ctx.fillStyle = hex ?? '#6366f1'; ctx.fillRect(0, 0, 8, h)

  const cx    = 8 + (w - 8) / 2
  const textW = w - 8 - 16

  // Compact header: brand + name + material (~32px total)
  ctx.font = font(400, 7); ctx.fillStyle = '#9ca3af'; ctx.textAlign = 'center'
  if (brand) ctx.fillText(trunc(ctx, brand.toUpperCase(), textW), cx, 4)
  ctx.font = font(700, 11); ctx.fillStyle = '#111827'
  ctx.fillText(trunc(ctx, name, textW), cx, brand ? 13 : 6)
  ctx.font = font(400, 7.5); ctx.fillStyle = '#6b7280'
  ctx.fillText(trunc(ctx, mat, textW), cx, brand ? 27 : 20)
  ctx.textAlign = 'left'
  const headerEnd = brand ? 38 : 30

  // Footer height
  const footerH = (rows.length > 0 ? rows.length * 9 : 0) + (hasFill ? 10 : 0) + 6
  const footerY = h - footerH

  // QR — 65px, centered in middle zone
  const midH   = footerY - headerEnd
  const qrSize = 65
  const qrImg  = await makeQR(qrValue(spool, enc), qrSize)
  ctx.drawImage(qrImg, cx - qrSize / 2, headerEnd + (midH - qrSize) / 2, qrSize, qrSize)

  // Footer
  if (rows.length > 0) drawSlotRows(ctx, rows, spool, 10, footerY, textW, rows.length * 9, true)
  if (hasFill) drawFillBar(ctx, spool.fill_percentage, hex, 10, h - 10, textW, 4)
}

// ── 6. Tall Card (113×151 = 30×40mm) ─────────────────────────────────────────
// QR: 78px (was 52)

async function drawTallCard(
  ctx: CanvasRenderingContext2D,
  spool: SpoolResponse, slots: ClassicSlot[], enc: QrEncoding,
  w: number, h: number,
) {
  const fp      = spool.filament
  const hex     = fp?.color_hex ?? spool.color_hex ?? null
  const brand   = fp?.brand?.name ?? spool.brand?.name ?? ''
  const name    = spool.name ?? fp?.name ?? '—'
  const mat     = `${fp?.material ?? '—'}${fp?.diameter ? ` · ${fp.diameter}mm` : ''}`
  const rows    = slots.filter(s => s.enabled && s.field !== 'none' && s.field !== 'fill_bar')
  const hasFill = slots.some(s => s.enabled && s.field === 'fill_bar')

  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h)

  // Colored header
  const hdrH = 20
  ctx.fillStyle = hex ?? '#6366f1'; ctx.fillRect(0, 0, w, hdrH)
  ctx.font = font(600, 7); ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(brand ? `◉  ${brand}` : '◉', w / 2, hdrH / 2)
  ctx.textAlign = 'left'

  // Name + material
  ctx.textBaseline = 'top'
  ctx.font = font(700, 10); ctx.fillStyle = '#111827'; ctx.textAlign = 'center'
  ctx.fillText(trunc(ctx, name, w - 12), w / 2, hdrH + 5)
  ctx.font = font(400, 7); ctx.fillStyle = '#6b7280'
  ctx.fillText(trunc(ctx, mat, w - 12), w / 2, hdrH + 19)
  ctx.textAlign = 'left'
  const headerEnd = hdrH + 30

  // Footer
  const footerH = (rows.length > 0 ? rows.length * 9 : 0) + (hasFill ? 10 : 0) + 6
  const footerY = h - footerH

  // QR — 78px, centered between header and footer
  const midH   = footerY - headerEnd
  const qrSize = 78
  const qrImg  = await makeQR(qrValue(spool, enc), qrSize)
  ctx.drawImage(qrImg, (w - qrSize) / 2, headerEnd + (midH - qrSize) / 2, qrSize, qrSize)

  if (rows.length > 0) drawSlotRows(ctx, rows, spool, 6, footerY, w - 12, rows.length * 9, true)
  if (hasFill) drawFillBar(ctx, spool.fill_percentage, hex, 6, h - 10, w - 12, 4)
}

// ── 7. Narrow Portrait (95×151 = 25×40mm) ────────────────────────────────────
// QR: 72px (was 54)

async function drawNarrowPortrait(
  ctx: CanvasRenderingContext2D,
  spool: SpoolResponse, slots: ClassicSlot[], enc: QrEncoding,
  w: number, h: number,
) {
  const fp      = spool.filament
  const hex     = fp?.color_hex ?? spool.color_hex ?? null
  const name    = spool.name ?? fp?.name ?? '—'
  const rows    = slots.filter(s => s.enabled && s.field !== 'none' && s.field !== 'fill_bar')
  const hasFill = slots.some(s => s.enabled && s.field === 'fill_bar')

  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h)

  // Top stripe
  ctx.fillStyle = hex ?? '#6366f1'; ctx.fillRect(0, 0, w, 8)

  // QR — 72px, centered horizontally, just below stripe
  const qrSize = 72
  const qrImg  = await makeQR(qrValue(spool, enc), qrSize)
  ctx.drawImage(qrImg, (w - qrSize) / 2, 10, qrSize, qrSize)

  const textY = 10 + qrSize + 4
  ctx.font = font(700, 8); ctx.fillStyle = '#111827'
  ctx.textBaseline = 'top'; ctx.textAlign = 'center'
  ctx.fillText(trunc(ctx, name, w - 8), w / 2, textY)

  rows.forEach((slot, i) => {
    const value = slotText(slot, spool)
    if (!value || value === '—') return
    ctx.font = font(400, 7); ctx.fillStyle = '#6b7280'
    ctx.fillText(trunc(ctx, value, w - 8), w / 2, textY + 12 + i * 9)
  })
  ctx.textAlign = 'left'

  if (hasFill) drawFillBar(ctx, spool.fill_percentage, hex, 6, h - 10, w - 12, 4)
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public export functions
// ═══════════════════════════════════════════════════════════════════════════════

export async function renderSpoolLabel(
  spool: SpoolResponse,
  template: LabelTemplate,
  slots: ClassicSlot[],
  encoding: QrEncoding,
): Promise<string> {
  await loadFonts()
  const { w, h } = LABEL_PX[template]
  const canvas   = document.createElement('canvas')
  canvas.width   = w * SCALE
  canvas.height  = h * SCALE
  const ctx      = canvas.getContext('2d')!
  ctx.scale(SCALE, SCALE)

  switch (template) {
    case 'classic-badge':   await drawClassicBadge(ctx, spool, slots, encoding, w, h);   break
    case 'wide-card':       await drawWideCard(ctx, spool, slots, encoding, w, h);       break
    case 'slim-tag':        await drawSlimTag(ctx, spool, slots, encoding, w, h);        break
    case 'micro-strip':     await drawMicroStrip(ctx, spool, slots, encoding, w, h);     break
    case 'square-classic':  await drawSquareClassic(ctx, spool, slots, encoding, w, h);  break
    case 'tall-card':       await drawTallCard(ctx, spool, slots, encoding, w, h);       break
    case 'narrow-portrait': await drawNarrowPortrait(ctx, spool, slots, encoding, w, h); break
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

  // Background + border
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = '#000000'; ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1)

  // Header bar
  const hdrH = 19
  ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, w, hdrH)
  ctx.font = font(700, 6.5); ctx.fillStyle = '#ffffff'
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left'
  ctx.fillText('STORAGE LOCATION', 18, hdrH / 2)
  ctx.font = font(600, 6); ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.textAlign = 'right'; ctx.fillText('FH', w - 6, hdrH / 2); ctx.textAlign = 'left'

  // QR — 72px in a 78px right column (was 56px in 66px column)
  const qrColW = 78
  const qrSize = 72
  const qrURL  = `${window.location.origin}/l/${location.id}`
  const qrImg  = await makeQR(qrURL, qrSize)
  const footH  = 13
  const bodyH  = h - hdrH - footH
  ctx.drawImage(qrImg, w - qrColW + (qrColW - qrSize) / 2, hdrH + (bodyH - qrSize) / 2, qrSize, qrSize)

  // Vertical divider
  ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(w - qrColW, hdrH); ctx.lineTo(w - qrColW, h - footH); ctx.stroke()

  // Info column
  const infoW = w - qrColW - 14
  let cy = hdrH + 5
  ctx.textBaseline = 'top'
  ctx.font = font(900, 12); ctx.fillStyle = '#000000'

  // Word-wrap name (up to 2 lines)
  const words = location.name.split(' ')
  let line1 = '', line2 = ''
  for (const word of words) {
    const test = line1 ? `${line1} ${word}` : word
    if (ctx.measureText(test).width <= infoW) { line1 = test }
    else if (!line2) { line2 = word }
    else { line2 = trunc(ctx, `${line2} ${word}`, infoW) }
  }
  ctx.fillText(line1, 7, cy); cy += 14
  if (line2) { ctx.fillText(trunc(ctx, line2, infoW), 7, cy); cy += 14 }

  ctx.fillStyle = '#d1d5db'; ctx.fillRect(7, cy, infoW, 1); cy += 5

  ctx.font = font(500, 7.5); ctx.fillStyle = '#374151'
  ctx.fillText(`${location.spool_count} spool${location.spool_count !== 1 ? 's' : ''}`, 13, cy); cy += 11

  if (location.is_dry_box) {
    ctx.strokeStyle = '#000'; ctx.lineWidth = 0.8
    ctx.strokeRect(7, cy, 32, 9)
    ctx.font = font(800, 6); ctx.fillStyle = '#000'
    ctx.fillText('DRY BOX', 9, cy + 1.5); cy += 12
  }

  if (location.description) {
    ctx.font = font(400, 6.5); ctx.fillStyle = '#6b7280'
    ctx.fillText(trunc(ctx, location.description, infoW), 7, cy)
  }

  // Footer bar
  ctx.fillStyle = '#111111'; ctx.fillRect(0, h - footH, w, footH)
  ctx.font = mono(6.5); ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(`LOC-${location.id}`, w / 2, h - footH / 2)
  ctx.textAlign = 'left'

  return canvas.toDataURL('image/png')
}
