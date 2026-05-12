import { PrismaClient } from "@prisma/client"
import bcrypt from "bcrypt"

const prisma = new PrismaClient()

async function main() {
  console.log("🌱 Seeding database...")

  const hashedPassword = await bcrypt.hash("password123", 10)

  // =====================================================
  // SCHOOL
  // =====================================================

  const school = await prisma.school.upsert({
    where: {
      schoolCode: "EDU-001",
    },
    update: {},
    create: {
      name: "EduNerve Demo School",
      address: "Lagos, Nigeria",
      phone: "08000000000",
      email: "school@edunerve.com",
      schoolCode: "EDU-001",
    },
  })

  // =====================================================
  // SUPER ADMIN
  // =====================================================

  await prisma.user.upsert({
    where: {
      email: "superadmin@edunerve.com",
    },
    update: {},
    create: {
      name: "Super Admin",
      email: "superadmin@edunerve.com",
      password: hashedPassword,
      role: "SUPER_ADMIN",
      mustChangePassword: false,
    },
  })

  // =====================================================
  // SCHOOL ADMIN
  // =====================================================

  const schoolAdmin = await prisma.user.upsert({
    where: {
      email: "admin@school.com",
    },
    update: {},
    create: {
      name: "School Admin",
      email: "admin@school.com",
      password: hashedPassword,
      role: "SCHOOL_ADMIN",
      schoolId: school.id,
      mustChangePassword: false,
    },
  })

  // =====================================================
  // TEACHER USER
  // =====================================================

  const teacherUser = await prisma.user.upsert({
    where: {
      email: "teacher@school.com",
    },
    update: {},
    create: {
      name: "Teacher One",
      email: "teacher@school.com",
      password: hashedPassword,
      role: "TEACHER",
      schoolId: school.id,
      mustChangePassword: false,
    },
  })

  // =====================================================
  // TEACHER PROFILE
  // =====================================================

  const teacher = await prisma.teacher.upsert({
    where: {
      userId: teacherUser.id,
    },
    update: {},
    create: {
      userId: teacherUser.id,
      schoolId: school.id,
      name: "Teacher One",
      email: "teacher@school.com",
      subject: "Mathematics",
    },
  })

  // =====================================================
  // PARENT USER
  // =====================================================

  const parentUser = await prisma.user.upsert({
    where: {
      email: "parent@school.com",
    },
    update: {},
    create: {
      name: "Parent One",
      email: "parent@school.com",
      password: hashedPassword,
      role: "PARENT",
      schoolId: school.id,
      mustChangePassword: false,
    },
  })

  // =====================================================
  // PARENT PROFILE
  // =====================================================

  const parent = await prisma.parent.upsert({
    where: {
      userId: parentUser.id,
    },
    update: {},
    create: {
      userId: parentUser.id,
      schoolId: school.id,
      name: "Parent One",
      email: "parent@school.com",
      phone: "08012345678",
    },
  })

  // =====================================================
  // CLASSES
  // =====================================================

  const class1 = await prisma.class.upsert({
    where: {
      id: 1,
    },
    update: {},
    create: {
      name: "JSS 1A",
      schoolId: school.id,
      teacherId: teacher.id,
    },
  })

  const class2 = await prisma.class.upsert({
    where: {
      id: 2,
    },
    update: {},
    create: {
      name: "JSS 2A",
      schoolId: school.id,
      teacherId: teacher.id,
    },
  })

  // =====================================================
  // STUDENTS
  // =====================================================

  const student1 = await prisma.student.upsert({
    where: {
      studentId: "STU-001",
    },
    update: {},
    create: {
      name: "John Doe",
      studentId: "STU-001",
      classId: class1.id,
      schoolId: school.id,
      parentId: parent.id,
      gender: "Male",
      session: "2025/2026",
    },
  })

  const student2 = await prisma.student.upsert({
    where: {
      studentId: "STU-002",
    },
    update: {},
    create: {
      name: "Mary James",
      studentId: "STU-002",
      classId: class1.id,
      schoolId: school.id,
      parentId: parent.id,
      gender: "Female",
      session: "2025/2026",
    },
  })

  const student3 = await prisma.student.upsert({
    where: {
      studentId: "STU-003",
    },
    update: {},
    create: {
      name: "Peter Johnson",
      studentId: "STU-003",
      classId: class2.id,
      schoolId: school.id,
      parentId: parent.id,
      gender: "Male",
      session: "2025/2026",
    },
  })

  // =====================================================
  // ATTENDANCE
  // =====================================================

  await prisma.attendance.createMany({
    data: [
      {
        studentId: student1.id,
        status: "PRESENT",
      },
      {
        studentId: student2.id,
        status: "ABSENT",
      },
      {
        studentId: student3.id,
        status: "PRESENT",
      },
    ],
  })

  // =====================================================
  // SUBJECTS
  // =====================================================

  const math = await prisma.subject.create({
    data: {
      name: "Mathematics",
      schoolId: school.id,
    },
  })

  // =====================================================
  // RESULTS
  // =====================================================

  await prisma.result.createMany({
    data: [
      {
        studentId: student1.id,
        subjectId: math.id,
        schoolId: school.id,
        teacherId: teacher.id,
        score: 85,
        term: "First Term",
        session: "2025/2026",
      },
      {
        studentId: student2.id,
        subjectId: math.id,
        schoolId: school.id,
        teacherId: teacher.id,
        score: 72,
        term: "First Term",
        session: "2025/2026",
      },
    ],
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