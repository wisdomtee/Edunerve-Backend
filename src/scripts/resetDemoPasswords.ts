import bcrypt from "bcryptjs"
import prisma from "../prisma"

async function resetUser(email: string, password: string) {
  const hashedPassword = await bcrypt.hash(password, 10)

  const user = await prisma.user.findFirst({
    where: {
      email: {
        equals: email,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      email: true,
      role: true,
    },
  })

  if (!user) {
    console.log(`User not found: ${email}`)
    return
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      mustChangePassword: false,
    },
  })

  console.log(`Password reset successful: ${user.email} (${user.role})`)
}

async function main() {
  const demoPassword = "Password123!"

  await resetUser("superadmin@edunerve.com", demoPassword)
  await resetUser("schooladmin@school.com", demoPassword)
  await resetUser("teacher@school.com", demoPassword)
  await resetUser("parent@school.com", demoPassword)

  console.log("")
  console.log("====================================")
  console.log("ALL DEMO PASSWORDS RESET")
  console.log("====================================")
  console.log("SUPER ADMIN: superadmin@edunerve.com")
  console.log("SCHOOL ADMIN: schooladmin@school.com")
  console.log("TEACHER: teacher@school.com")
  console.log("PARENT: parent@school.com")
  console.log("PASSWORD: Password123!")
  console.log("====================================")
}

main()
  .catch((error) => {
    console.error("Reset failed:", error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })