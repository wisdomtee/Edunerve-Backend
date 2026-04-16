const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || ""

type InitializePaymentPayload = {
  email: string
  amount: number
  reference: string
  callback_url?: string
  metadata?: Record<string, any>
}

export async function initializePaystackPayment(payload: InitializePaymentPayload) {
  const response = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })

  const data = await response.json()

  if (!response.ok || !data.status) {
    throw new Error(data.message || "Failed to initialize payment")
  }

  return data.data
}

export async function verifyPaystackPayment(reference: string) {
  const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
  })

  const data = await response.json()

  if (!response.ok || !data.status) {
    throw new Error(data.message || "Failed to verify payment")
  }

  return data.data
}