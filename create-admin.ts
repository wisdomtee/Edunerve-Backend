import bcrypt from "bcryptjs"
import prisma from "./src/prisma"

async function main() {
  const email = "admin@school.com"
  const plainPassword = "123456"
  const hashedPassword = await bcrypt.hash(plainPassword, 10)

  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      password: hashedPassword,
      role: "SUPER_ADMIN",
      mustChangePassword: false,
      name: "Super Admin",
      schoolId: null,
    },
    create: {
      name: "Super Admin",
      email,
      password: hashedPassword,
      role: "SUPER_ADMIN",
      schoolId: null,
      mustChangePassword: false,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      schoolId: true,
      mustChangePassword: true,
    },
  })

  console.log("? Admin user ready:")
  console.log(admin)
  console.log("?? Email:", email)
  console.log("?? Password:", plainPassword)
}

main()
  .catch((error) => {
    console.error("? Failed to create admin:", error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
