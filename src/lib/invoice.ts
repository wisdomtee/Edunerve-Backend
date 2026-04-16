import { API_BASE_URL, getAuthHeaders } from "./api"

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

export type InvoicePayload = {
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

export async function downloadInvoicePdf(payload: InvoicePayload) {
  const response = await fetch(`${API_BASE_URL}/invoices/pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(error?.message || "Failed to download invoice PDF")
  }

  const blob = await response.blob()
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `invoice-${payload.invoiceNumber}.pdf`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

export async function printInvoicePdf(payload: InvoicePayload) {
  const response = await fetch(`${API_BASE_URL}/invoices/pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(error?.message || "Failed to generate invoice PDF for print")
  }

  const blob = await response.blob()
  const url = window.URL.createObjectURL(blob)
  const printWindow = window.open(url, "_blank")

  if (!printWindow) {
    window.URL.revokeObjectURL(url)
    throw new Error("Popup blocked. Please allow popups to print invoice.")
  }

  printWindow.onload = () => {
    printWindow.focus()
    printWindow.print()
  }

  setTimeout(() => {
    window.URL.revokeObjectURL(url)
  }, 10000)
}

export async function sendInvoiceEmail(payload: InvoicePayload) {
  const response = await fetch(`${API_BASE_URL}/invoices/send-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(data?.message || "Failed to send invoice email")
  }

  return data
}

export async function getInvoiceEmailReadyPayload(payload: InvoicePayload) {
  const response = await fetch(`${API_BASE_URL}/invoices/preview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(data?.message || "Failed to prepare invoice email payload")
  }

  return data
}