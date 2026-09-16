import prisma from "../lib/prisma"

export const createStudentService = async (data: {
  name: string
  email: string
  password: string
  studentId: string
  schoolId?: number
  classId?: number
}) => {
  return prisma.student.create({
    data: {
      name: data.name,
      email: data.email,
      password: data.password,
      studentId: data.studentId,
      class: data.classId
        ? { connect: { id: data.classId } }
        : undefined,
      school: data.schoolId
        ? { connect: { id: data.schoolId } }
        : undefined,
    },
  })
}