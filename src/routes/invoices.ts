import { Router } from "express"
import nodemailer from "nodemailer"
import { generateInvoicePdfBuffer, InvoiceData } from "../utils/invoicePdf"

const router = Router()

function sanitizeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9-_]/g, "_")
}

function buildInvoiceEmailHtml(invoice: InvoiceData, total: number) {
  return `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
      <h2 style="margin-bottom: 8px;">Invoice ${invoice.invoiceNumber}</h2>
      <p>Hello ${invoice.to.name || "Customer"},</p>
      <p>Please find your invoice attached as a PDF.</p>

      <div style="background:#F9FAFB; padding:16px; border-radius:8px; border:1px solid #E5E7EB;">
        <p style="margin: 0 0 6px 0;"><strong>Invoice Number:</strong> ${invoice.invoiceNumber}</p>
        <p style="margin: 0 0 6px 0;"><strong>Invoice Date:</strong> ${invoice.invoiceDate}</p>
        <p style="margin: 0 0 6px 0;"><strong>Due Date:</strong> ${invoice.dueDate || "-"}</p>
        <p style="margin: 0;"><strong>Total:</strong> ${invoice.currency || "NGN"} ${total.toFixed(2)}</p>
      </div>

      <p style="margin-top: 16px;">Thank you.</p>
      <p>${invoice.from.name}</p>
    </div>
  `
}

function calculateInvoiceTotal(invoice: InvoiceData) {
  const subtotal =
    invoice.subtotal ??
    invoice.items.reduce((sum, item) => {
      return sum + Number(item.quantity || 0) * Number(item.unitPrice || 0)
    }, 0)

  const discount = Number(invoice.discount || 0)
  const taxPercent = Number(invoice.taxPercent || 0)
  const taxableAmount = Math.max(subtotal - discount, 0)
  const taxAmount = invoice.taxAmount ?? (taxableAmount * taxPercent) / 100
  const total = invoice.total ?? taxableAmount + taxAmount

  return total
}

/**
 * POST /invoices/pdf
 * Returns invoice PDF directly for download
 */
router.post("/pdf", async (req, res) => {
  try {
    const invoice = req.body as InvoiceData

    if (!invoice?.invoiceNumber) {
      return res.status(400).json({ message: "invoiceNumber is required" })
    }

    if (!invoice?.from?.name || !invoice?.to?.name) {
      return res.status(400).json({
        message: "Both from.name and to.name are required",
      })
    }

    if (!Array.isArray(invoice.items) || invoice.items.length === 0) {
      return res.status(400).json({
        message: "At least one invoice item is required",
      })
    }

    const pdfBuffer = await generateInvoicePdfBuffer(invoice)
    const fileName = `invoice-${sanitizeFileName(invoice.invoiceNumber)}.pdf`

    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`)
    res.setHeader("Content-Length", pdfBuffer.length)

    return res.send(pdfBuffer)
  } catch (error) {
    console.error("Invoice PDF generation error:", error)
    return res.status(500).json({
      message: "Failed to generate invoice PDF",
    })
  }
})

/**
 * POST /invoices/preview
 * Returns base64 PDF + email payload preview
 * Useful for frontend preview / external mail providers
 */
router.post("/preview", async (req, res) => {
  try {
    const invoice = req.body as InvoiceData

    if (!invoice?.invoiceNumber) {
      return res.status(400).json({ message: "invoiceNumber is required" })
    }

    const pdfBuffer = await generateInvoicePdfBuffer(invoice)
    const total = calculateInvoiceTotal(invoice)
    const fileName = `invoice-${sanitizeFileName(invoice.invoiceNumber)}.pdf`

    return res.json({
      message: "Invoice preview generated successfully",
      fileName,
      mimeType: "application/pdf",
      pdfBase64: pdfBuffer.toString("base64"),
      emailPayload: {
        to: invoice.to.email || "",
        subject: `Invoice ${invoice.invoiceNumber} from ${invoice.from.name}`,
        html: buildInvoiceEmailHtml(invoice, total),
        attachments: [
          {
            filename: fileName,
            contentType: "application/pdf",
            contentBase64: pdfBuffer.toString("base64"),
          },
        ],
      },
    })
  } catch (error) {
    console.error("Invoice preview error:", error)
    return res.status(500).json({
      message: "Failed to prepare invoice preview",
    })
  }
})

/**
 * POST /invoices/send-email
 * Sends invoice directly by email with PDF attachment
 */
router.post("/send-email", async (req, res) => {
  try {
    const invoice = req.body as InvoiceData

    if (!invoice?.to?.email) {
      return res.status(400).json({
        message: "Recipient email is required in to.email",
      })
    }

    const smtpHost = process.env.SMTP_HOST
    const smtpPort = Number(process.env.SMTP_PORT || 465)
    const smtpSecure = String(process.env.SMTP_SECURE || "true") === "true"
    const smtpUser = process.env.SMTP_USER
    const smtpPass = process.env.SMTP_PASS
    const smtpFrom = process.env.SMTP_FROM || smtpUser

    if (!smtpHost || !smtpUser || !smtpPass) {
      return res.status(400).json({
        message: "SMTP configuration is missing in .env",
      })
    }

    const pdfBuffer = await generateInvoicePdfBuffer(invoice)
    const total = calculateInvoiceTotal(invoice)
    const fileName = `invoice-${sanitizeFileName(invoice.invoiceNumber)}.pdf`

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    })

    const info = await transporter.sendMail({
      from: smtpFrom,
      to: invoice.to.email,
      subject: `Invoice ${invoice.invoiceNumber} from ${invoice.from.name}`,
      html: buildInvoiceEmailHtml(invoice, total),
      attachments: [
        {
          filename: fileName,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    })

    return res.json({
      message: "Invoice email sent successfully",
      invoiceNumber: invoice.invoiceNumber,
      recipient: invoice.to.email,
      messageId: info.messageId,
    })
  } catch (error) {
    console.error("Send invoice email error:", error)
    return res.status(500).json({
      message: "Failed to send invoice email",
    })
  }
})

export default router