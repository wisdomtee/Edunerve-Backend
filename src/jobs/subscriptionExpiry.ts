import prisma from "../prisma"

type ExpiredSchool = {
  id: number
  name: string
  subscriptionEnd: Date | null
  plan: string
  subscriptionStatus: string
}

export async function checkExpiredSubscriptions() {
  try {
    const now = new Date()

    console.log("⏳ Running subscription expiry check at:", now.toISOString())

    // 1. Get all schools that SHOULD be expired
    const schoolsToExpire: ExpiredSchool[] = await prisma.school.findMany({
      where: {
        subscriptionEnd: {
          not: null,
          lt: now,
        },
        subscriptionStatus: {
          not: "expired",
        },
      },
      select: {
        id: true,
        name: true,
        subscriptionEnd: true,
        plan: true,
        subscriptionStatus: true,
      },
    })

    if (schoolsToExpire.length === 0) {
      console.log("✅ No subscriptions to expire")
      return {
        expiredCount: 0,
        schools: [],
      }
    }

    console.log(
      `⚠️ Found ${schoolsToExpire.length} school(s) to expire`
    )

    // 2. Expire them in batch
    const updateResult = await prisma.school.updateMany({
      where: {
        id: {
          in: schoolsToExpire.map((s) => s.id),
        },
      },
      data: {
        subscriptionStatus: "expired",
        plan: "NORMAL",
        nextBillingDate: null,
      },
    })

    // 3. Log each expired school (VERY IMPORTANT for debugging + audit)
    schoolsToExpire.forEach((school) => {
      console.log(
        `❌ Expired: ${school.name} (ID: ${school.id}) | Ended: ${
          school.subscriptionEnd
            ? school.subscriptionEnd.toISOString()
            : "N/A"
        }`
      )
    })

    console.log(
      `✅ Expiry job completed. Total expired: ${updateResult.count}`
    )

    return {
      expiredCount: updateResult.count,
      schools: schoolsToExpire,
    }
  } catch (error: any) {
    console.error("❌ Subscription expiry job failed:", error)

    return {
      expiredCount: 0,
      schools: [],
      error: error.message,
    }
  }
}