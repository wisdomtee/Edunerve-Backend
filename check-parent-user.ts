import prisma from "./src/prisma"

async function main() {
  const user = await prisma.user.findUnique({
    where: {
      email: "parent@school.com",
    },
    include: {
      school: {
        select: {
          id: true,
          name: true,
          schoolCode: true,
        },
      },
    },
  })

  console.log(JSON.stringify(user, null, 2))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })