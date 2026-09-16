import bcrypt from "bcryptjs"
import prisma from "./src/prisma"

async function main() {
  const email = "admin@school.com"
  const newPlainPassword = "admin123"

  const hashedPassword = await bcrypt.hash(newPlainPassword, 10)

  const updatedUser = await prisma.user.update({
    where: { email },
    data: {
      password: hashedPassword,
    },
  })

  console.log("Admin password reset successfully:", updatedUser.email)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })