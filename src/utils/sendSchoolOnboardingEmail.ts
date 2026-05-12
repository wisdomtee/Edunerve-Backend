import nodemailer from "nodemailer"

export async function sendSchoolOnboardingEmail({
  to,
  schoolName,
  schoolCode,
  email,
  password,
}: {
  to: string
  schoolName: string
  schoolCode: string
  email: string
  password: string
}) {
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // STARTTLS — required for port 587
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: false, // allows connection on local dev
    },
  })

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || `EduNerve <${process.env.EMAIL_USER}>`,
    to,
    subject: "EduNerve School Login Details",
    html: `
      <h2>Welcome to EduNerve</h2>
      <p>Your school has been onboarded successfully.</p>

      <p><b>Login URL:</b><br/>
      https://edunerve-frontend-ooow.vercel.app/login</p>

      <p><b>School Code:</b> ${schoolCode}</p>
      <p><b>Email:</b> ${email}</p>
      <p><b>Temporary Password:</b> ${password}</p>

      <p>Please change your password after login.</p>
    `,
  })
}