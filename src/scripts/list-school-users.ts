import prisma from "../prisma"

async function main() {
  const schoolCodeArg = process.argv[2]

  if (!schoolCodeArg) {
    console.log('Usage: npx ts-node src/scripts/list-school-users.ts "EMS-8410"')
    process.exit(1)
  }

  const schoolCode = String(schoolCodeArg).trim().toUpperCase()

  const school = await prisma.school.findUnique({
    where: { schoolCode },
    include: {
      users: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          mustChangePassword: true,
          schoolId: true,
        },
        orderBy: {
          id: "asc",
        },
      },
    },
  })

  if (!school) {
    console.log(`No school found with code: ${schoolCode}`)
    return
  }

  console.log(`\nSchool: ${school.name}`)
  console.log(`School Code: ${school.schoolCode}`)
  console.log(`School Email: ${school.email || "-"}`)
  console.log("\nUSERS\n")

  if (!school.users.length) {
    console.log("No users found for this school")
    return
  }

  for (const user of school.users) {
    console.log(`ID: ${user.id}`)
    console.log(`Name: ${user.name}`)
    console.log(`Email: ${user.email}`)
    console.log(`Role: ${user.role}`)
    console.log(`Must Change Password: ${user.mustChangePassword}`)
    console.log("-----------------------------")
  }
}

main()
  .catch((error) => {
    console.error("Error listing school users:", error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })