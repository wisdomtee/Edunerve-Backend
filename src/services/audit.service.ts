import prisma from "../lib/prisma"

export const createAuditLog = async (action: string) => {
  return await prisma.auditLog.create({
    data: {
      action,
    },
  })
}