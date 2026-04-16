import admin from "firebase-admin"

let firebaseAdmin: admin.app.App | null = null

const projectId = process.env.FIREBASE_PROJECT_ID?.trim()
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim()
const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY?.trim()
const privateKey = rawPrivateKey?.replace(/\\n/g, "\n")

const hasValidFirebaseConfig =
  !!projectId &&
  !!clientEmail &&
  !!privateKey &&
  privateKey.includes("BEGIN PRIVATE KEY") &&
  privateKey.includes("END PRIVATE KEY")

try {
  if (hasValidFirebaseConfig) {
    firebaseAdmin = admin.apps.length
      ? admin.app()
      : admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        })

    console.log("✅ Firebase initialized")
  } else {
    console.warn("⚠️ Firebase not configured — push notifications disabled")
  }
} catch (error) {
  console.warn("⚠️ Firebase init failed — continuing without push notifications")
}

export { firebaseAdmin }