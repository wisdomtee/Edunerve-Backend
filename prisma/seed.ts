import { PrismaClient } from "@prisma/client"
import bcrypt from "bcrypt"

const prisma = new PrismaClient()

async function main() {
  console.log("🌱 Seeding database...")

  const hashedPassword = await bcrypt.hash("password123", 10)

  // ✅ 1. CREATE SCHOOL
  const school = await prisma.school.create({
    data: {
      name: "EduNerve Demo School",
      address: "Lagos, Nigeria",
      phone: "08000000000",
      email: "school@edunerve.com",
    },
  })

  // ✅ 2. SUPER ADMIN (NO SCHOOL)
  await prisma.user.upsert({
    where: { email: "superadmin@edunerve.com" },
    update: {},
    create: {
      name: "Super Admin",
      email: "superadmin@edunerve.com",
      password: hashedPassword,
      role: "SUPER_ADMIN",
    },
  })

  // ✅ 3. SCHOOL ADMIN
  await prisma.user.upsert({
    where: { email: "admin@school.com" },
    update: {},
    create: {
      name: "School Admin",
      email: "admin@school.com",
      password: hashedPassword,
      role: "SCHOOL_ADMIN",
      schoolId: school.id,
    },
  })

  // ✅ 4. TEACHER
  await prisma.user.upsert({
    where: { email: "teacher@school.com" },
    update: {},
    create: {
      name: "Teacher One",
      email: "teacher@school.com",
      password: hashedPassword,
      role: "TEACHER",
      schoolId: school.id,
    },
  })

  // ✅ 5. PARENT
  await prisma.user.upsert({
    where: { email: "parent@school.com" },
    update: {},
    create: {
      name: "Parent One",
      email: "parent@school.com",
      password: hashedPassword,
      role: "PARENT",
      schoolId: school.id,
    },
  })

  console.log("✅ Seeding complete")
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })