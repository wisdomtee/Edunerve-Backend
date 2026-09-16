import prisma from "../lib/prisma"

function generateSchoolCode(): string {
  return "SCH-" + Math.random().toString(36).substring(2, 8).toUpperCase()
}

export const onboardSchool = async (data: {
  name: string
  address: string
}) => {
  // Create school with required fields
  const school = await prisma.school.create({
    data: {
      name: data.name,
      address: data.address,
      schoolCode: generateSchoolCode(),
    },
  })

  // Create a subscription record using the Subscription model
  const subscription = await prisma.subscription.create({
    data: {
      schoolId: school.id,
      plan: "NORMAL",
      status: "active",
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      amount: 0,
    },
  })

  return { school, subscription }
}