import nodemailer from "nodemailer"

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
})

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
  const mailOptions = {
    from: `"EduNerve" <${process.env.EMAIL_USER}>`,
    to,
    subject: "🎓 EduNerve School Onboarding Details",
    html: `
      <div style="font-family: Arial; padding: 20px;">
        <h2>Welcome to EduNerve 🎉</h2>

        <p>Your school <b>${schoolName}</b> has been successfully onboarded.</p>

        <h3>Login Details:</h3>
        <p><b>URL:</b> https://your-app.vercel.app</p>
        <p><b>School Code:</b> ${schoolCode}</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Password:</b> ${password}</p>

        <br/>

        <p><b>Next Steps:</b></p>
        <ul>
          <li>Login to the system</li>
          <li>Change your password</li>
          <li>Create classes</li>
          <li>Add students and teachers</li>
        </ul>

        <br/>

        <p>We’re excited to have you onboard 🚀</p>
      </div>
    `,
  }

  await transporter.sendMail(mailOptions)
}