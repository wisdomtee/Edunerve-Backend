import bcrypt from "bcryptjs"
import prisma from "../prisma"

async function main() {
  const schoolCode = "EMS-8410"
  const adminName = "Elliot Admin"
  const adminEmail = "admin@elliotmodelschool.com"
  const adminPassword = "Admin12345"

  const school = await prisma.school.findUnique({
    where: { schoolCode },
    select: {
      id: true,
      name: true,
      schoolCode: true,
    },
  })

  if (!school) {
    console.log(`School not found for code: ${schoolCode}`)
    process.exit(1)
  }

  const existingUser = await prisma.user.findFirst({
    where: {
      email: {
        equals: adminEmail,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      email: true,
    },
  })

  if (existingUser) {
    console.log(`User already exists with email: ${existingUser.email}`)
    process.exit(1)
  }

  const hashedPassword = await bcrypt.hash(adminPassword, 10)

  const user = await prisma.user.create({
    data: {
      name: adminName,
      email: adminEmail,
      password: hashedPassword,
      role: "SCHOOL_ADMIN",
      schoolId: school.id,
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

  console.log("School admin created successfully")
  console.log("--------------------------------")
  console.log(`School: ${school.name}`)
  console.log(`School Code: ${school.schoolCode}`)
  console.log(`Name: ${user.name}`)
  console.log(`Email: ${user.email}`)
  console.log(`Password: ${adminPassword}`)
  console.log(`Role: ${user.role}`)
}

main()
  .catch((error) => {
    console.error("Error creating school admin:", error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })