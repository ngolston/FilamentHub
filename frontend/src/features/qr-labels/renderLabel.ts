/**
 * Pure-canvas label renderer.
 *
 * Draws QR labels directly onto a <canvas> using the Canvas 2D API — no DOM
 * capture, no html2canvas, no html-to-image.  All layout values are translated
 * directly from the CSS pixel dimensions used in the React preview components.
 */

import type { SpoolResponse, LocationResponse } from '@/types/api'
import type { LabelTemplate, ClassicSlot, QrEncoding } from './SpoolLabel'
import { LABEL_PX, CLASSIC_FIELD_LABELS } from './SpoolLabel'

const SCALE = 3   // output is 3× the CSS pixel dimensions → crisp on retina

// ── Font helpers ──────────────────────────────────────────────────────────────

async function loadFonts() {
  await document.fonts.ready
}

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
    width: size,
    margin: 0,
    color: { dark: '#000000', light: '#ffffff' },
    errorCorrectionLevel: 'M',
  })
  return c
}

// ── Data helpers (mirror SpoolLabel logic) ────────────────────────────────────

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
    case 'nozzle': {
      const a = fp?.print_temp_min, b = fp?.print_temp_max
      return (a || b) ? (a && b ? `${a}–${b}°C` : a ? `${a}°C` : `${b}°C`) : '—'
    }
    case 'bed': {
      const a = fp?.bed_temp_min, b = fp?.bed_temp_max
      return (a || b) ? (a && b ? `${a}–${b}°C` : a ? `${a}°C` : `${b}°C`) : '—'
    }
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

/** Draw evenly-spaced label+value rows into the data region. */
function drawSlotRows(
  ctx: CanvasRenderingContext2D,
  rows: ClassicSlot[],
  spool: SpoolResponse,
  x: number, y: number, w: number, h: number,
  compact = false,
) {
  if (rows.length === 0) return
  const fs       = compact ? 7 : 7.5
  const labelW   = 40
  const rowH     = h / rows.length

  rows.forEach((slot, i) => {
    const label = CLASSIC_FIELD_LABELS[slot.field] ?? ''
    const value = slotText(slot, spool)
    const ry    = y + i * rowH + (rowH - fs) / 2

    if (label) {
      ctx.font      = font(400, fs)
      ctx.fillStyle = '#9ca3af'
      ctx.textBaseline = 'top'
      ctx.fillText(label, x, ry)
    }

    ctx.font      = font(600, fs)
    ctx.fillStyle = '#1f2937'
    const vx      = label ? x + labelW : x
    ctx.fillText(trunc(ctx, value, w - (label ? labelW : 0)), vx, ry)
  })
}

/** Draw a horizontal fill bar. */
function drawFillBar(
  ctx: CanvasRenderingContext2D,
  pct: number, hex: string | null,
  x: number, y: number, w: number, h: number,
) {
  // Track
  ctx.fillStyle = '#e5e7eb'
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, h / 2)
  ctx.fill()
  // Fill
  const fw = (w * Math.min(pct, 100)) / 100
  if (fw > 0) {
    ctx.fillStyle = hex ?? '#6366f1'
    ctx.beginPath()
    ctx.roundRect(x, y, fw, h, h / 2)
    ctx.fill()
  }
  // Percentage text
  const fs = 7
  ctx.font      = font(600, fs)
  ctx.fillStyle = '#4b5563'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'right'
  ctx.fillText(`${pct.toFixed(0)}%`, x + w + 14, y + h / 2)
  ctx.textAlign = 'left'
}

// ═══════════════════════════════════════════════════════════════════════════════
// Template renderers
// ═══════════════════════════════════════════════════════════════════════════════

// ── 1. Classic Badge (151×113) ────────────────────────────────────────────────

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

  // Brand — 14px black, pt-1.5=6, px-2=8
  ctx.font = font(900, 14); ctx.fillStyle = '#111827'
  ctx.fillText(trunc(ctx, brand, w - 16), 8, 6)
  const afterBrand = 6 + 14 + 4   // text + mt-1

  // Material bar — bg-gray-900, h≈15, py-[3px]
  const barH = 15
  ctx.fillStyle = '#111827'; ctx.fillRect(0, afterBrand, w, barH)
  // hex (right, mono)
  ctx.font = mono(7.5); ctx.fillStyle = '#d1d5db'
  const hexW = hex ? ctx.measureText(hex).width + 4 : 0
  if (hex) { ctx.textAlign = 'right'; ctx.fillText(hex, w - 8, afterBrand + 3); ctx.textAlign = 'left' }
  // material (left, bold, white)
  ctx.font = font(700, 9); ctx.fillStyle = '#ffffff'
  ctx.fillText(trunc(ctx, mat, w - 16 - hexW), 8, afterBrand + 3)
  const afterBar = afterBrand + barH + 2

  // Spool name — 9px bold, pt-0.5=2
  ctx.font = font(700, 9); ctx.fillStyle = '#1f2937'
  ctx.fillText(trunc(ctx, name, w - 16), 8, afterBar + 2)
  const afterName = afterBar + 11 + 4   // text h + pt-1

  // QR + data rows
  const qrSize = 38
  const qrImg  = await makeQR(qrValue(spool, enc), qrSize)
  const botPad = 6
  const dataH  = h - afterName - botPad
  const dataW  = w - 8 - qrSize - 4 - 8  // left pad, qr, gap, right pad

  ctx.drawImage(qrImg, w - 8 - qrSize, h - botPad - qrSize, qrSize, qrSize)

  if (hasFill && rows.length === 0) {
    drawFillBar(ctx, spool.fill_percentage, hex, 8, h - botPad - 5, dataW - 16, 5)
  } else {
    drawSlotRows(ctx, rows, spool, 8, afterName, dataW, dataH)
  }
}

// ── 2. Wide Card (189×113) ────────────────────────────────────────────────────

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

  // Left color stripe (w-2=8)
  ctx.fillStyle = hex ?? '#6366f1'; ctx.fillRect(0, 0, 8, h)

  // Header area: brand + name (left) + QR (right), px-2 py-1.5
  const qrSize = 36
  const hdrH   = qrSize + 12   // qr + padding
  const textX  = 10
  const textW  = w - 10 - qrSize - 6 - 6

  if (brand) {
    ctx.font = font(400, 7); ctx.fillStyle = '#9ca3af'
    ctx.fillText(trunc(ctx, brand.toUpperCase(), textW), textX, 8)
  }
  ctx.font = font(700, 11); ctx.fillStyle = '#111827'
  ctx.fillText(trunc(ctx, name, textW), textX, brand ? 17 : 10)

  const qrImg = await makeQR(qrValue(spool, enc), qrSize)
  ctx.drawImage(qrImg, w - 6 - qrSize, 6, qrSize, qrSize)

  // Data rows
  const dataY = hdrH + 2
  const dataH = h - dataY - 6
  drawSlotRows(ctx, rows, spool, textX, dataY, textW, dataH, true)

  if (hasFill) {
    drawFillBar(ctx, spool.fill_percentage, hex, textX, h - 10, w - textX - 8, 5)
  }
}

// ── 3. Slim Tag (151×91) ──────────────────────────────────────────────────────

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

  // Colored header bar (h-2 = 8px)
  const hdrH = 8
  ctx.fillStyle = hex ?? '#6366f1'; ctx.fillRect(0, 0, w, hdrH)
  // brand left, material right
  ctx.font = font(600, 7); ctx.fillStyle = 'rgba(255,255,255,0.9)'
  if (brand) ctx.fillText(trunc(ctx, brand, (w / 2) - 6), 6, 1)
  ctx.textAlign = 'right'
  ctx.fillText(trunc(ctx, mat, (w / 2) - 6), w - 4, 1)
  ctx.textAlign = 'left'

  // Body: QR left, text right
  const qrSize  = 42
  const bodyY   = hdrH + 2
  const bodyH   = h - bodyY - (hasFill ? 12 : 4)
  const qrImg   = await makeQR(qrValue(spool, enc), qrSize)
  ctx.drawImage(qrImg, 4, bodyY + (bodyH - qrSize) / 2, qrSize, qrSize)

  const textX = 4 + qrSize + 4
  const textW = w - textX - 4
  ctx.font = font(700, 10); ctx.fillStyle = '#111827'
  ctx.fillText(trunc(ctx, name, textW), textX, bodyY + 2)
  drawSlotRows(ctx, rows, spool, textX, bodyY + 14, textW, bodyH - 14, true)

  if (hasFill) {
    drawFillBar(ctx, spool.fill_percentage, hex, 4, h - 10, w - 8, 4)
  }
}

// ── 4. Micro Strip (151×45) ───────────────────────────────────────────────────

async function drawMicroStrip(
  ctx: CanvasRenderingContext2D,
  spool: SpoolResponse, slots: ClassicSlot[], enc: QrEncoding,
  w: number, h: number,
) {
  const fp      = spool.filament
  const hex     = fp?.color_hex ?? spool.color_hex ?? null
  const name    = spool.name ?? fp?.name ?? '—'
  const hasFill = slots.some(s => s.enabled && s.field === 'fill_bar')
  const textSlot = slots.find(s => s.enabled && s.field !== 'fill_bar' && s.field !== 'none')

  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h)
  ctx.textBaseline = 'middle'

  // Left stripe (w-1.5 = 6px)
  ctx.fillStyle = hex ?? '#6366f1'; ctx.fillRect(0, 0, 6, h)

  // QR code
  const qrSize = 28
  const qrImg  = await makeQR(qrValue(spool, enc), qrSize)
  ctx.drawImage(qrImg, 8, (h - qrSize) / 2, qrSize, qrSize)

  // Name + secondary text
  const textX  = 8 + qrSize + 4
  const fillW  = hasFill ? 60 : 0
  const textW  = w - textX - fillW - 4

  ctx.font = font(700, 8); ctx.fillStyle = '#111827'
  ctx.fillText(trunc(ctx, name, textW), textX, h / 2 - 4)

  if (textSlot) {
    const secondary = slotText(textSlot, spool)
    ctx.font = font(400, 7); ctx.fillStyle = '#6b7280'
    ctx.fillText(trunc(ctx, secondary, textW), textX, h / 2 + 5)
  }

  if (hasFill) {
    drawFillBar(ctx, spool.fill_percentage, hex, w - fillW - 2, h / 2 - 3, fillW - 12, 5)
  }
}

// ── 5. Square Classic (151×113) ───────────────────────────────────────────────

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

  // Left stripe (w-2 = 8px)
  ctx.fillStyle = hex ?? '#6366f1'; ctx.fillRect(0, 0, 8, h)

  const cx    = 8 + (w - 8) / 2   // center of content area
  const textW = w - 8 - 16         // w minus stripe minus px-1.5 each side

  // Top header: brand + name + material
  ctx.font = font(400, 7); ctx.fillStyle = '#9ca3af'; ctx.textAlign = 'center'
  if (brand) ctx.fillText(trunc(ctx, brand.toUpperCase(), textW), cx, 6)
  ctx.font = font(700, 11); ctx.fillStyle = '#111827'
  ctx.fillText(trunc(ctx, name, textW), cx, brand ? 16 : 8)
  ctx.font = font(400, 8); ctx.fillStyle = '#6b7280'
  ctx.fillText(trunc(ctx, mat, textW), cx, brand ? 30 : 22)
  ctx.textAlign = 'left'

  // QR center
  const qrSize = 46
  const qrImg  = await makeQR(qrValue(spool, enc), qrSize)
  ctx.drawImage(qrImg, cx - qrSize / 2, (h - qrSize) / 2, qrSize, qrSize)

  // Footer data rows
  const footerY = h - 6 - (rows.length * 9) - (hasFill ? 8 : 0)
  drawSlotRows(ctx, rows, spool, 10, footerY, textW, rows.length * 9, true)
  if (hasFill) {
    drawFillBar(ctx, spool.fill_percentage, hex, 10, h - 10, textW, 4)
  }
}

// ── 6. Tall Card (113×151) ────────────────────────────────────────────────────

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
  ctx.textBaseline = 'middle'

  // Colored header
  const hdrH = 20
  ctx.fillStyle = hex ?? '#6366f1'; ctx.fillRect(0, 0, w, hdrH)
  ctx.font = font(600, 7); ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.textAlign = 'center'
  const hdrLabel = brand ? `◉ ${brand}` : '◉'
  ctx.fillText(hdrLabel, w / 2, hdrH / 2)
  ctx.textAlign = 'left'

  // Name + material
  ctx.textBaseline = 'top'
  ctx.font = font(700, 10); ctx.fillStyle = '#111827'
  ctx.textAlign = 'center'
  ctx.fillText(trunc(ctx, name, w - 12), w / 2, hdrH + 6)
  ctx.font = font(400, 7); ctx.fillStyle = '#6b7280'
  ctx.fillText(trunc(ctx, mat, w - 12), w / 2, hdrH + 20)
  ctx.textAlign = 'left'

  // QR center
  const qrSize = 52
  const qrImg  = await makeQR(qrValue(spool, enc), qrSize)
  ctx.drawImage(qrImg, (w - qrSize) / 2, (h - qrSize) / 2, qrSize, qrSize)

  // Footer data rows
  const footerH = rows.length * 9 + (hasFill ? 10 : 0)
  const footerY = h - footerH - 6
  drawSlotRows(ctx, rows, spool, 6, footerY, w - 12, rows.length * 9, true)
  if (hasFill) {
    drawFillBar(ctx, spool.fill_percentage, hex, 6, h - 10, w - 12, 4)
  }
}

// ── 7. Narrow Portrait (95×151) ───────────────────────────────────────────────

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

  // QR center-top area
  const qrSize = 54
  const qrImg  = await makeQR(qrValue(spool, enc), qrSize)
  ctx.drawImage(qrImg, (w - qrSize) / 2, 12, qrSize, qrSize)

  // Name + rows
  const textY = 12 + qrSize + 4
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

  if (hasFill) {
    drawFillBar(ctx, spool.fill_percentage, hex, 6, h - 10, w - 12, 4)
  }
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

  // White background with black border
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = '#000000'; ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1)

  // Header bar (black, h=19)
  const hdrH = 19
  ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, w, hdrH)
  ctx.font = font(700, 6.5); ctx.fillStyle = '#ffffff'
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left'
  ctx.fillText('STORAGE LOCATION', 18, hdrH / 2)
  ctx.font = font(600, 6); ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.textAlign = 'right'
  ctx.fillText('FH', w - 8, hdrH / 2)
  ctx.textAlign = 'left'

  // QR code (right column, w=66)
  const qrW   = 66
  const qrURL = `${window.location.origin}/l/${location.id}`
  const qrSize = 56
  const qrImg = await makeQR(qrURL, qrSize)
  ctx.drawImage(qrImg, w - qrW + (qrW - qrSize) / 2, hdrH + (h - hdrH - 13 - qrSize) / 2, qrSize, qrSize)

  // Vertical divider
  ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(w - qrW, hdrH); ctx.lineTo(w - qrW, h - 13); ctx.stroke()

  // Info column
  const infoW = w - qrW - 14  // left pad 7, right pad 7
  let cy = hdrH + 5

  // Location name
  ctx.textBaseline = 'top'
  ctx.font = font(900, 13); ctx.fillStyle = '#000000'
  // word-wrap the name up to 2 lines
  const nameWords = location.name.split(' ')
  let line1 = '', line2 = ''
  for (const word of nameWords) {
    const test = line1 ? `${line1} ${word}` : word
    if (ctx.measureText(test).width <= infoW) {
      line1 = test
    } else if (!line2) {
      line2 = word
    } else {
      line2 = trunc(ctx, `${line2} ${word}`, infoW)
    }
  }
  ctx.fillText(line1, 7, cy)
  cy += 14
  if (line2) { ctx.fillText(trunc(ctx, line2, infoW), 7, cy); cy += 14 }

  // Divider
  ctx.fillStyle = '#d1d5db'; ctx.fillRect(7, cy, infoW, 1); cy += 5

  // Spool count
  ctx.font = font(500, 7.5); ctx.fillStyle = '#374151'
  ctx.fillText(`${location.spool_count} spool${location.spool_count !== 1 ? 's' : ''}`, 13, cy)
  cy += 11

  // Dry box badge
  if (location.is_dry_box) {
    ctx.strokeStyle = '#000'; ctx.lineWidth = 0.8
    ctx.strokeRect(7, cy, 32, 9)
    ctx.font = font(800, 6); ctx.fillStyle = '#000'
    ctx.fillText('DRY BOX', 9, cy + 1.5)
    cy += 12
  }

  // Description
  if (location.description) {
    ctx.font = font(400, 6.5); ctx.fillStyle = '#6b7280'
    ctx.fillText(trunc(ctx, location.description, infoW), 7, cy)
  }

  // Footer bar
  const footH = 13
  ctx.fillStyle = '#111111'; ctx.fillRect(0, h - footH, w, footH)
  ctx.font = mono(6.5); ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(`LOC-${location.id}`, w / 2, h - footH / 2)
  ctx.textAlign = 'left'

  return canvas.toDataURL('image/png')
}
