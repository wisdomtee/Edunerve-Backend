import bcrypt from "bcryptjs"
import prisma from "../prisma"

async function main() {
  const defaultPassword = "123456"
  const hashedPassword = await bcrypt.hash(defaultPassword, 10)

  // =========================
  // SUPER ADMIN SCHOOL
  // =========================
  let superSchool = await prisma.school.findFirst({
    where: { schoolCode: "HQ-0001" },
  })

  if (!superSchool) {
    superSchool = await prisma.school.create({
      data: {
        name: "EduNerve Headquarters",
        address: "Lagos, Nigeria",
        schoolCode: "HQ-0001",
      },
    })
    console.log("Created super admin school:", superSchool.schoolCode)
  }

  let superAdmin = await prisma.user.findFirst({
    where: {
      email: "superadmin@edunerve.com",
      schoolId: superSchool.id,
    },
  })

  if (!superAdmin) {
    superAdmin = await prisma.user.create({
      data: {
        name: "Super Admin",
        email: "superadmin@edunerve.com",
        password: hashedPassword,
        role: "SUPER_ADMIN",
        schoolId: superSchool.id,
        mustChangePassword: false,
      },
    })
    console.log("Created super admin user")
  }

  // =========================
  // DEMO SCHOOL
  // =========================
  let demoSchool = await prisma.school.findFirst({
    where: { schoolCode: "EDU-1001" },
  })

  if (!demoSchool) {
    demoSchool = await prisma.school.create({
      data: {
        name: "EduNerve Demo School",
        address: "Lagos, Nigeria",
        schoolCode: "EDU-1001",
      },
    })
    console.log("Created demo school:", demoSchool.schoolCode)
  }

  // =========================
  // SCHOOL ADMIN
  // =========================
  let schoolAdmin = await prisma.user.findFirst({
    where: {
      email: "admin@edunerve.com",
      schoolId: demoSchool.id,
    },
  })

  if (!schoolAdmin) {
    schoolAdmin = await prisma.user.create({
      data: {
        name: "School Admin",
        email: "admin@edunerve.com",
        password: hashedPassword,
        role: "SCHOOL_ADMIN",
        schoolId: demoSchool.id,
        mustChangePassword: false,
      },
    })
    console.log("Created school admin user")
  }

  // =========================
  // TEACHER
  // =========================
  let teacherUser = await prisma.user.findFirst({
    where: {
      email: "teacher@edunerve.com",
      schoolId: demoSchool.id,
    },
  })

  if (!teacherUser) {
    teacherUser = await prisma.user.create({
      data: {
        name: "Demo Teacher",
        email: "teacher@edunerve.com",
        password: hashedPassword,
        role: "TEACHER",
        schoolId: demoSchool.id,
        mustChangePassword: false,
      },
    })
    console.log("Created teacher user")
  }

  // =========================
  // PARENT USER
  // =========================
  let parentUser = await prisma.user.findFirst({
    where: {
      email: "parent@edunerve.com",
      schoolId: demoSchool.id,
    },
  })

  if (!parentUser) {
    parentUser = await prisma.user.create({
      data: {
        name: "Demo Parent",
        email: "parent@edunerve.com",
        password: hashedPassword,
        role: "PARENT",
        schoolId: demoSchool.id,
        mustChangePassword: false,
      },
    })
    console.log("Created parent user")
  }

  console.log("===================================")
  console.log("LOGIN DETAILS")
  console.log("===================================")
  console.log("SUPER ADMIN")
  console.log("School Code: HQ-0001")
  console.log("Email: superadmin@edunerve.com")
  console.log("Password: 123456")
  console.log("-----------------------------------")
  console.log("SCHOOL ADMIN")
  console.log("School Code: EDU-1001")
  console.log("Email: admin@edunerve.com")
  console.log("Password: 123456")
  console.log("-----------------------------------")
  console.log("TEACHER")
  console.log("School Code: EDU-1001")
  console.log("Email: teacher@edunerve.com")
  console.log("Password: 123456")
  console.log("-----------------------------------")
  console.log("PARENT")
  console.log("School Code: EDU-1001")
  console.log("Email: parent@edunerve.com")
  console.log("Password: 123456")
  console.log("===================================")
}

main()
  .catch((error) => {
    console.error("SEED ERROR:", error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })