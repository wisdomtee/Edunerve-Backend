import prisma from "./src/prisma"

async function main() {
  const schools = await prisma.school.findMany({
    select: {
      id: true,
      name: true,
      schoolCode: true,
      email: true,
    },
    orderBy: {
      id: "asc",
    },
  })

  console.log("\n=== SCHOOLS ===")
  schools.forEach((school) => {
    console.log(
      `ID: ${school.id} | Name: ${school.name} | Code: ${school.schoolCode} | Email: ${school.email ?? "N/A"}`
    )
  })
  console.log("===============\n")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })