import bcrypt from "bcryptjs"
import prisma from "./src/prisma"

async function main() {
  const email = "teacher@school.com"
  const plainPassword = "123456"
  const hashedPassword = await bcrypt.hash(plainPassword, 10)

  const teacher = await prisma.user.upsert({
    where: { email },
    update: {
      password: hashedPassword,
      role: "TEACHER",
      mustChangePassword: false,
      name: "Test Teacher",
      schoolId: 1,
    },
    create: {
      name: "Test Teacher",
      email,
      password: hashedPassword,
      role: "TEACHER",
      schoolId: 1,
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

  console.log("? Teacher user ready:")
  console.log(teacher)
  console.log("?? Email:", email)
  console.log("?? Password:", plainPassword)
}

main()
  .catch((error) => {
    console.error("? Failed to create teacher:", error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
