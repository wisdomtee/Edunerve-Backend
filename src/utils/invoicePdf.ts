import PDFDocument from "pdfkit"
import type PDFKit from "pdfkit"

export type InvoiceParty = {
  name: string
  email?: string
  phone?: string
  address?: string
}

export type InvoiceItem = {
  title: string
  description?: string
  quantity: number
  unitPrice: number
}

export type InvoiceData = {
  invoiceNumber: string
  invoiceDate: string
  dueDate?: string
  currency?: string
  status?: string
  notes?: string
  paymentReference?: string

  from: InvoiceParty
  to: InvoiceParty

  items: InvoiceItem[]
  taxPercent?: number
  discount?: number
  subtotal?: number
  taxAmount?: number
  total?: number
}

function money(value: number, currency = "NGN") {
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${currency} ${value.toFixed(2)}`
  }
}

function safeNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

function formatDate(value?: string) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function drawDivider(doc: PDFKit.PDFDocument, y: number) {
  doc
    .moveTo(50, y)
    .lineTo(545, y)
    .strokeColor("#D1D5DB")
    .lineWidth(1)
    .stroke()
}

function drawLabelValue(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  width = 220
) {
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor("#6B7280")
    .text(label.toUpperCase(), x, y, { width })

  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor("#111827")
    .text(value || "-", x, y + 14, { width })
}

function calculateTotals(data: InvoiceData) {
  const subtotal =
    data.subtotal ??
    data.items.reduce((sum, item) => {
      return sum + safeNumber(item.quantity) * safeNumber(item.unitPrice)
    }, 0)

  const discount = safeNumber(data.discount)
  const taxableAmount = Math.max(subtotal - discount, 0)
  const taxPercent = safeNumber(data.taxPercent)
  const taxAmount =
    data.taxAmount ?? (taxPercent > 0 ? (taxableAmount * taxPercent) / 100 : 0)

  const total = data.total ?? taxableAmount + taxAmount

  return {
    subtotal,
    discount,
    taxPercent,
    taxAmount,
    total,
  }
}

export async function generateInvoicePdfBuffer(
  rawData: InvoiceData
): Promise<Buffer> {
  const data: InvoiceData = {
    currency: "NGN",
    status: "UNPAID",
    notes: "",
    ...rawData,
  }

  const totals = calculateTotals(data)

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
      bufferPages: true,
      info: {
        Title: `Invoice ${data.invoiceNumber}`,
        Author: "EduNerve Billing System",
        Subject: "School Subscription Invoice",
        Keywords: "invoice, billing, subscription, school management",
      },
    })

    const chunks: Buffer[] = []

    doc.on("data", (chunk: Buffer) => chunks.push(chunk))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    // Header
    doc
      .font("Helvetica-Bold")
      .fontSize(24)
      .fillColor("#111827")
      .text("INVOICE", 50, 45)

    doc
      .font("Helvetica-Bold")
      .fontSize(16)
      .fillColor("#2563EB")
      .text(data.from.name || "EduNerve", 390, 48, {
        width: 155,
        align: "right",
      })

    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#374151")
      .text(data.from.address || "", 390, 70, {
        width: 155,
        align: "right",
      })
      .text(data.from.email || "", 390, doc.y + 2, {
        width: 155,
        align: "right",
      })
      .text(data.from.phone || "", 390, doc.y + 2, {
        width: 155,
        align: "right",
      })

    drawDivider(doc, 118)

    // Invoice info
    drawLabelValue(doc, "Invoice No", data.invoiceNumber, 50, 135, 120)
    drawLabelValue(
      doc,
      "Invoice Date",
      formatDate(data.invoiceDate),
      190,
      135,
      110
    )
    drawLabelValue(doc, "Due Date", formatDate(data.dueDate), 320, 135, 100)
    drawLabelValue(doc, "Status", data.status || "UNPAID", 440, 135, 100)

    // Bill to
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor("#111827")
      .text("Bill To", 50, 195)

    doc
      .font("Helvetica-Bold")
      .fontSize(13)
      .fillColor("#111827")
      .text(data.to.name || "-", 50, 214)

    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#374151")
      .text(data.to.address || "", 50, 234, { width: 250 })
      .text(data.to.email || "", 50, doc.y + 3, { width: 250 })
      .text(data.to.phone || "", 50, doc.y + 3, { width: 250 })

    if (data.paymentReference) {
      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor("#111827")
        .text("Payment Reference", 360, 195)

      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#374151")
        .text(data.paymentReference, 360, 214, { width: 185 })
    }

    // Items table
    const tableTop = 310

    doc.roundedRect(50, tableTop, 495, 28, 4).fillColor("#EFF6FF").fill()

    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor("#1F2937")
      .text("Item", 60, tableTop + 9, { width: 220 })
      .text("Qty", 300, tableTop + 9, { width: 40, align: "center" })
      .text("Unit Price", 355, tableTop + 9, { width: 80, align: "right" })
      .text("Amount", 450, tableTop + 9, { width: 85, align: "right" })

    let y = tableTop + 38

    for (const item of data.items) {
      const qty = safeNumber(item.quantity)
      const unitPrice = safeNumber(item.unitPrice)
      const amount = qty * unitPrice

      const itemBlockHeight = item.description ? 42 : 28

      if (y + itemBlockHeight > 690) {
        doc.addPage()
        y = 70
      }

      drawDivider(doc, y - 6)

      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor("#111827")
        .text(item.title, 60, y, { width: 220 })

      if (item.description) {
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#6B7280")
          .text(item.description, 60, y + 14, { width: 220 })
      }

      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#111827")
        .text(String(qty), 300, y, { width: 40, align: "center" })
        .text(money(unitPrice, data.currency), 355, y, {
          width: 80,
          align: "right",
        })
        .text(money(amount, data.currency), 450, y, {
          width: 85,
          align: "right",
        })

      y += itemBlockHeight
    }

    drawDivider(doc, y)

    // Totals box
    const totalsTop = y + 18

    doc.roundedRect(310, totalsTop, 235, 110, 6).fillColor("#F9FAFB").fill()

    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#374151")
      .text("Subtotal", 325, totalsTop + 15, { width: 100 })
      .text(money(totals.subtotal, data.currency), 430, totalsTop + 15, {
        width: 100,
        align: "right",
      })
      .text("Discount", 325, totalsTop + 38, { width: 100 })
      .text(money(totals.discount, data.currency), 430, totalsTop + 38, {
        width: 100,
        align: "right",
      })
      .text(`Tax (${totals.taxPercent}%)`, 325, totalsTop + 61, { width: 100 })
      .text(money(totals.taxAmount, data.currency), 430, totalsTop + 61, {
        width: 100,
        align: "right",
      })

    doc
      .moveTo(325, totalsTop + 84)
      .lineTo(530, totalsTop + 84)
      .strokeColor("#D1D5DB")
      .stroke()

    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor("#111827")
      .text("Total", 325, totalsTop + 92, { width: 100 })
      .text(money(totals.total, data.currency), 430, totalsTop + 92, {
        width: 100,
        align: "right",
      })

    // Notes
    const notesTop = totalsTop + 135

    if (data.notes) {
      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor("#111827")
        .text("Notes", 50, notesTop)

      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#374151")
        .text(data.notes, 50, notesTop + 18, {
          width: 495,
          align: "left",
        })
    }

    // Footer
    const pages = doc.bufferedPageRange()
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i)

      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#6B7280")
        .text(
          `Generated by EduNerve Billing • Page ${i + 1} of ${pages.count}`,
          50,
          770,
          {
            width: 495,
            align: "center",
          }
        )
    }

    doc.end()
  })
}