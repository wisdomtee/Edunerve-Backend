const bcrypt = require("bcryptjs")
const prisma = require("./dist/prisma").default

function generateSchoolCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let code = "EDU-"

  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }

  return code
}

function generatePassword() {
  return "Admin@123" // keep simple for testing
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "")
}

async function getUniqueSchoolCode() {
  let code = generateSchoolCode()

  let exists = await prisma.school.findUnique({
    where: { schoolCode: code },
  })

  while (exists) {
    code = generateSchoolCode()
    exists = await prisma.school.findUnique({
      where: { schoolCode: code },
    })
  }

  return code
}

async function main() {
  console.log("🚀 Creating 100 schools...\n")

  for (let i = 1; i <= 100; i++) {
    const name = `Demo School ${i}`
    const email = `${slugify(name)}@edunerve.com`

    const schoolCode = await getUniqueSchoolCode()
    const password = generatePassword()
    const hashed = await bcrypt.hash(password, 10)

    const school = await prisma.school.create({
      data: {
        name,
        schoolCode,
      },
    })

    await prisma.user.create({
      data: {
        name: `${name} Admin`,
        email,
        password: hashed,
        role: "SCHOOL_ADMIN",
        schoolId: school.id,
      },
    })

    console.log(
      `✅ ${name} | Code: ${schoolCode} | Email: ${email} | Pass: ${password}`
    )
  }

  console.log("\n🎉 DONE: 100 schools created!")
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
  })