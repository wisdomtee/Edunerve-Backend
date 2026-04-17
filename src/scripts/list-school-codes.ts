import prisma from "../prisma"

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

  if (!schools.length) {
    console.log("No schools found")
    return
  }

  console.log("\nSCHOOLS\n")

  for (const school of schools) {
    console.log(`ID: ${school.id}`)
    console.log(`Name: ${school.name}`)
    console.log(`School Code: ${school.schoolCode}`)
    console.log(`Email: ${school.email || "-"}`)
    console.log("-----------------------------")
  }
}

main()
  .catch((error) => {
    console.error("Error:", error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })