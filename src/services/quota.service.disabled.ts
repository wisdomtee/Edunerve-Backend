import prisma from "../prisma";

export const checkStudentQuota = async (schoolId: string) => {
  const studentCount = await prisma.student.count({
    where: { id: schoolId }
  });

  const subscription = await prisma.schoolSubscription.findFirst({
    where: {
      schoolId,
      status: "ACTIVE",
      endDate: {
        gte: new Date()
      }
    },
    include: {
      plan: true
    }
  });

  if (!subscription) {
    throw new Error("Subscription inactive");
  }

  if (
    subscription.plan.maxStudents &&
    studentCount >= subscription.plan.maxStudents
  ) {
    throw new Error("Student quota exceeded. Upgrade plan.");
  }
};