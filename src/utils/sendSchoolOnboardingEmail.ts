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
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  })

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
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