import bcrypt from "bcrypt"
import prisma from "../prisma"

async function main() {
  const hashedPassword = await bcrypt.hash("123456", 10)

  const user = await prisma.user.create({
    data: {
      email: "admin@example.com",
      password: hashedPassword,

      // 🔥 THIS IS THE FIX
      school: {
        connect: { id: 1 }, // <-- change if your school id is different
      },
    },
  })

  console.log("User created:", user)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })