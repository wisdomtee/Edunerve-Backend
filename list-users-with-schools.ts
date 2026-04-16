import prisma from "./src/prisma"

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      schoolId: true,
      school: {
        select: {
          name: true,
          schoolCode: true,
        },
      },
    },
    orderBy: {
      id: "asc",
    },
  })

  console.log("\n=== USERS WITH SCHOOL CODE ===\n")

  users.forEach((user) => {
    console.log(`
ID: ${user.id}
Name: ${user.name}
Email: ${user.email}
Role: ${user.role}
School: ${user.school?.name ?? "N/A"}
School Code: ${user.school?.schoolCode ?? "N/A"}
----------------------------------------
`)
  })

  console.log("\n=============================\n")
}

main()
  .catch((e) => {
    console.error("ERROR:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })