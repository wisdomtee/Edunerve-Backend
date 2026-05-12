import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  console.log("📈 Starting student promotion...")

  // Get all classes for all schools
  const classes = await prisma.class.findMany()

  for (const classItem of classes) {
    const match = classItem.name.match(/JSS\s(\d)/i)

    if (!match) continue

    const currentLevel = parseInt(match[1])

    // ❌ Skip final class (JSS3)
    if (currentLevel >= 3) continue

    const nextLevel = currentLevel + 1

    const nextClass = await prisma.class.findFirst({
      where: {
        name: {
          contains: `JSS ${nextLevel}`,
        },
        schoolId: classItem.schoolId,
      },
    })

    if (!nextClass) {
      console.log(`⚠️ No next class found for ${classItem.name}`)
      continue
    }

    // Promote students
    const updated = await prisma.student.updateMany({
      where: {
        classId: classItem.id,
      },
      data: {
        classId: nextClass.id,
      },
    })

    console.log(
      `✅ Promoted ${updated.count} students from ${classItem.name} → ${nextClass.name}`
    )
  }

  console.log("🎉 Promotion complete")
}

main()
  .catch((e) => {
    console.error("❌ Promotion error:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })