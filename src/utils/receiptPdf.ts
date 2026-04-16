import PDFDocument from "pdfkit"

type ReceiptParty = {
  name: string
  email?: string
  phone?: string
  address?: string
}

type ReceiptData = {
  receiptNumber: string
  invoiceNumber: string
  paymentReference: string
  paymentMethod: string

  amountPaid: number
  currency?: string

  paidAt: string

  from: ReceiptParty
  to: ReceiptParty

  notes?: string
}

function money(value: number, currency = "NGN") {
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
    }).format(value)
  } catch {
    return `${currency} ${value.toFixed(2)}`
  }
}

function formatDate(value: string) {
  const date = new Date(value)
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

export async function generateReceiptPdfBuffer(
  data: ReceiptData,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
    })

    const chunks: Buffer[] = []

    doc.on("data", (chunk) => chunks.push(chunk))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)

    // HEADER
    doc
      .font("Helvetica-Bold")
      .fontSize(24)
      .text("PAYMENT RECEIPT", 50, 45)

    doc
      .font("Helvetica-Bold")
      .fontSize(16)
      .fillColor("#2563EB")
      .text(data.from.name, 350, 45, { align: "right" })

    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#374151")
      .text(data.from.address || "", 350, 70, { align: "right" })
      .text(data.from.email || "", 350, doc.y + 2, { align: "right" })
      .text(data.from.phone || "", 350, doc.y + 2, { align: "right" })

    doc.moveDown(2)

    // INFO
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor("#6B7280")
      .text("Receipt No:", 50, 140)

    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor("#111827")
      .text(data.receiptNumber, 150, 140)

    doc.text("Invoice No:", 50, 160)
    doc.text(data.invoiceNumber, 150, 160)

    doc.text("Payment Ref:", 50, 180)
    doc.text(data.paymentReference, 150, 180)

    doc.text("Payment Method:", 50, 200)
    doc.text(data.paymentMethod, 150, 200)

    doc.text("Date Paid:", 50, 220)
    doc.text(formatDate(data.paidAt), 150, 220)

    // BILL TO
    doc.moveDown(2)

    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .text("Received From:", 50, 260)

    doc
      .font("Helvetica-Bold")
      .fontSize(13)
      .text(data.to.name, 50, 280)

    doc
      .font("Helvetica")
      .fontSize(10)
      .text(data.to.address || "", 50, 300)
      .text(data.to.email || "", 50, doc.y + 2)
      .text(data.to.phone || "", 50, doc.y + 2)

    // AMOUNT BOX
    doc.roundedRect(50, 370, 495, 100, 6).stroke("#D1D5DB")

    doc
      .font("Helvetica")
      .fontSize(12)
      .text("Amount Paid", 70, 390)

    doc
      .font("Helvetica-Bold")
      .fontSize(28)
      .fillColor("#059669")
      .text(money(data.amountPaid, data.currency), 70, 410)

    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#374151")
      .text("Status: PAID", 70, 450)

    // NOTES
    if (data.notes) {
      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .text("Notes", 50, 500)

      doc
        .font("Helvetica")
        .fontSize(10)
        .text(data.notes, 50, 520)
    }

    // FOOTER
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#6B7280")
      .text(
        "This is a system-generated receipt. No signature required.",
        50,
        750,
        { align: "center", width: 495 },
      )

    doc.end()
  })
}