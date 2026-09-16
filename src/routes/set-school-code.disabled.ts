import prisma from "./src/prisma"

async function main() {
  const school = await prisma.school.update({
    where: { id: 1 },
    data: {
      schoolCode: "EDU-5HJNAS",
    },
  })

  console.log("Updated school:", school)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })