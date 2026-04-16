import bcrypt from "bcryptjs"
import prisma from "../prisma"

async function main() {
  const plainPassword = "Password123!"
  const hashedPassword = await bcrypt.hash(plainPassword, 10)

  let school = await prisma.school.findFirst()

  if (!school) {
    school = await prisma.school.create({
      data: {
        name: "Demo School",
        schoolCode: "DEMO-SCHOOL-001",
        address: "Lagos, Nigeria",
        email: "school@demo.com",
        phone: "08000000000",
      },
    })
    console.log("Created demo school")
  } else {
    console.log(`Using existing school: ${school.name}`)
  }

  const superAdmin = await prisma.user.upsert({
    where: { email: "superadmin@edunerve.com" },
    update: {
      name: "Super Admin",
      password: hashedPassword,
      role: "SUPER_ADMIN",
      schoolId: null,
      mustChangePassword: false,
    },
    create: {
      name: "Super Admin",
      email: "superadmin@edunerve.com",
      password: hashedPassword,
      role: "SUPER_ADMIN",
      mustChangePassword: false,
    },
  })
  console.log("SUPER_ADMIN ready:", superAdmin.email)

  const schoolAdmin = await prisma.user.upsert({
    where: { email: "schooladmin@school.com" },
    update: {
      name: "School Admin",
      password: hashedPassword,
      role: "SCHOOL_ADMIN",
      schoolId: school.id,
      mustChangePassword: false,
    },
    create: {
      name: "School Admin",
      email: "schooladmin@school.com",
      password: hashedPassword,
      role: "SCHOOL_ADMIN",
      schoolId: school.id,
      mustChangePassword: false,
    },
  })
  console.log("SCHOOL_ADMIN ready:", schoolAdmin.email)

  const teacherUser = await prisma.user.upsert({
    where: { email: "teacher@school.com" },
    update: {
      name: "Demo Teacher",
      password: hashedPassword,
      role: "TEACHER",
      schoolId: school.id,
      mustChangePassword: false,
    },
    create: {
      name: "Demo Teacher",
      email: "teacher@school.com",
      password: hashedPassword,
      role: "TEACHER",
      schoolId: school.id,
      mustChangePassword: false,
    },
  })
  console.log("TEACHER user ready:", teacherUser.email)

  await prisma.teacher.upsert({
    where: { userId: teacherUser.id },
    update: {
      schoolId: school.id,
      name: "Demo Teacher",
      email: "teacher@school.com",
      subject: "Mathematics",
      phone: "08000000000",
    },
    create: {
      userId: teacherUser.id,
      schoolId: school.id,
      name: "Demo Teacher",
      email: "teacher@school.com",
      subject: "Mathematics",
      phone: "08000000000",
    },
  })
  console.log("TEACHER profile ready")

  const parentUser = await prisma.user.upsert({
    where: { email: "parent@school.com" },
    update: {
      name: "Demo Parent",
      password: hashedPassword,
      role: "PARENT",
      schoolId: school.id,
      mustChangePassword: false,
    },
    create: {
      name: "Demo Parent",
      email: "parent@school.com",
      password: hashedPassword,
      role: "PARENT",
      schoolId: school.id,
      mustChangePassword: false,
    },
  })
  console.log("PARENT ready:", parentUser.email)

  console.log("")
  console.log("====================================")
  console.log("DEMO LOGINS RESET AND READY")
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
    console.error("Seed failed:", error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })