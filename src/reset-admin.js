import bcrypt from "bcryptjs"
import prisma from "./src/prisma"

async function reset() {
  const password = "admin123"

  const hash = await bcrypt.hash(password, 10)

  await prisma.user.update({
    where: { email: "admin@school.com" },
    data: { password: hash },
  })

  console.log("✅ Admin password reset to: admin123")
}

reset().finally(() => prisma.$disconnect())