import prisma from "../prisma"

function cleanText(value: string) {
  return value.replace(/[^A-Za-z0-9]/g, "").toUpperCase()
}

function randomDigits(length: number) {
  let result = ""
  for (let i = 0; i < length; i++) {
    result += Math.floor(Math.random() * 10).toString()
  }
  return result
}

function randomPassword(length = 10) {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"
  const lower = "abcdefghijkmnopqrstuvwxyz"
  const digits = "23456789"
  const symbols = "@#$%&*"
  const all = upper + lower + digits + symbols

  let password =
    upper[Math.floor(Math.random() * upper.length)] +
    lower[Math.floor(Math.random() * lower.length)] +
    digits[Math.floor(Math.random() * digits.length)] +
    symbols[Math.floor(Math.random() * symbols.length)]

  for (let i = password.length; i < length; i++) {
    password += all[Math.floor(Math.random() * all.length)]
  }

  return password
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("")
}

export async function generateUniqueSchoolCode(schoolName: string) {
  const base = cleanText(schoolName).slice(0, 3) || "SCH"

  let schoolCode = ""
  let exists = true

  while (exists) {
    schoolCode = `EDU-${base}-${randomDigits(4)}`
    const school = await prisma.school.findUnique({
      where: { schoolCode },
      select: { id: true },
    })
    exists = Boolean(school)
  }

  return schoolCode
}

export function generateTempPassword() {
  return randomPassword(10)
}