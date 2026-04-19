import prisma from "../prisma"

async function main() {
  const parentEmail = "parent@edunerve.com"

  const user = await prisma.user.findFirst({
    where: { email: parentEmail },
    select: {
      id: true,
      email: true,
      name: true,
      schoolId: true,
    },
  })

  if (!user) {
    console.log("❌ Parent user not found")
    return
  }

  if (!user.schoolId) {
    console.log("❌ Parent user has no schoolId")
    return
  }

  let parent = await prisma.parent.findFirst({
    where: {
      email: user.email,
      schoolId: user.schoolId,
    },
  })

  if (!parent) {
    parent = await prisma.parent.create({
      data: {
        name: user.name || "Demo Parent",
        email: user.email,
        phone: "08000000000",
        user: {
          connect: {
            id: user.id,
          },
        },
        school: {
          connect: {
            id: user.schoolId,
          },
        },
      },
    })

    console.log("✅ Parent profile created:", {
      id: parent.id,
      name: parent.name,
      email: parent.email,
      schoolId: parent.schoolId,
    })
  } else {
    console.log("ℹ️ Parent already exists:", {
      id: parent.id,
      name: parent.name,
      email: parent.email,
      schoolId: parent.schoolId,
    })
  }

  let student = await prisma.student.findFirst({
    where: {
      studentId: "STD-001",
      schoolId: user.schoolId,
    },
  })

  if (!student) {
    student = await prisma.student.create({
      data: {
        name: "Demo Student",
        studentId: "STD-001",
        schoolId: user.schoolId,
        parentId: parent.id,
      },
    })

    console.log("✅ Student created:", {
      id: student.id,
      name: student.name,
      studentId: student.studentId,
      parentId: student.parentId,
    })
  } else {
    if (student.parentId !== parent.id) {
      student = await prisma.student.update({
        where: { id: student.id },
        data: {
          parentId: parent.id,
        },
      })
    }

    console.log("ℹ️ Student already exists:", {
      id: student.id,
      name: student.name,
      studentId: student.studentId,
      parentId: student.parentId,
    })
  }

  console.log("🎉 Parent now linked to student")
  console.log("Parent Email:", user.email)
  console.log("Student Name:", student.name)
  console.log("Student ID:", student.studentId)
}

main()
  .catch((err) => {
    console.error("SEED ERROR:", err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })