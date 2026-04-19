import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { SpoolResponse } from '@/types/api'

function statusLabel(s: string) {
  if (s === 'active')   return 'Active'
  if (s === 'storage')  return 'Storage'
  if (s === 'archived') return 'Archived'
  return s
}

function round1(n: number) {
  return Math.round(n * 10) / 10
}

export function exportInventoryPdf(spools: SpoolResponse[], username?: string) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  const pageW = doc.internal.pageSize.getWidth()
  const now   = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

  // ── Header ─────────────────────────────────────────────────────────────────
  doc.setFillColor(15, 17, 23)  // ~surface-0 dark
  doc.rect(0, 0, pageW, 18, 'F')

  doc.setFontSize(13)
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.text('FilamentHub — Inventory Report', 10, 11)

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(160, 160, 180)
  const subtitle = [username && `User: ${username}`, `Exported: ${now}`, `${spools.length} spool${spools.length !== 1 ? 's' : ''}`]
    .filter(Boolean).join('   ·   ')
  doc.text(subtitle, pageW - 10, 11, { align: 'right' })

  // ── Table ──────────────────────────────────────────────────────────────────
  const head = [['Name / Filament', 'Brand', 'Material', 'Color', 'Diameter', 'Initial (g)', 'Used (g)', 'Remaining (g)', 'Fill %', 'Status', 'Location', 'Purchase date', 'Price', 'Notes']]

  const body = spools.map((s) => {
    const fp = s.filament
    const displayName = s.name || fp?.name || '—'
    return [
      displayName,
      s.brand?.name ?? '—',
      fp?.material ?? '—',
      fp?.color_name ? `${fp.color_name}${fp.color_hex ? ` (${fp.color_hex})` : ''}` : (fp?.color_hex ?? '—'),
      fp?.diameter != null ? `${fp.diameter} mm` : '—',
      round1(s.initial_weight),
      round1(s.used_weight),
      round1(s.remaining_weight),
      `${round1(s.fill_percentage)}%`,
      statusLabel(s.status),
      s.location?.name ?? '—',
      s.purchase_date ?? '—',
      s.purchase_price != null ? s.purchase_price.toFixed(2) : '—',
      s.notes ?? '',
    ]
  })

  autoTable(doc, {
    head,
    body,
    startY: 22,
    styles: {
      fontSize: 7.5,
      cellPadding: 2.5,
      overflow: 'linebreak',
      textColor: [30, 30, 40],
    },
    headStyles: {
      fillColor: [79, 70, 229],   // primary-600
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 7.5,
    },
    alternateRowStyles: { fillColor: [245, 246, 250] },
    columnStyles: {
      0:  { cellWidth: 36 },  // Name
      1:  { cellWidth: 22 },  // Brand
      2:  { cellWidth: 16 },  // Material
      3:  { cellWidth: 24 },  // Color
      4:  { cellWidth: 16 },  // Diameter
      5:  { cellWidth: 18 },  // Initial
      6:  { cellWidth: 14 },  // Used
      7:  { cellWidth: 20 },  // Remaining
      8:  { cellWidth: 12 },  // Fill
      9:  { cellWidth: 14 },  // Status
      10: { cellWidth: 20 },  // Location
      11: { cellWidth: 22 },  // Purchase date
      12: { cellWidth: 14 },  // Price
      13: { cellWidth: 'auto' },  // Notes
    },
    margin: { left: 10, right: 10 },
    didDrawPage: (data) => {
      // Page number footer
      const pageCount = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages()
      doc.setFontSize(7)
      doc.setTextColor(150)
      doc.text(
        `Page ${data.pageNumber} of ${pageCount}`,
        pageW / 2,
        doc.internal.pageSize.getHeight() - 5,
        { align: 'center' },
      )
    },
  })

  doc.save('filamenthub_inventory.pdf')
}
