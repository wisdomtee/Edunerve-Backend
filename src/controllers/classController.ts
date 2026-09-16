import { Request, Response } from "express"
import prisma from "../prisma"

export const createClass = async (
  req: any,
  res: Response
) => {
  try {
    const { name } = req.body

    const schoolId = req.user?.schoolId

    const newClass = await prisma.class.create({
  data: {
    name,
    school: { connect: { id: schoolId } }
  }
})

    res.json(newClass)
  } catch (err) {
    console.error(err)

    res.status(500).json({
      message: "Failed to create class",
    })
  }
}

export const getClasses = async (
  req: any,
  res: Response
) => {
  try {
    const schoolId = req.user?.schoolId

    const classes = await prisma.class.findMany({
      where: {
        schoolId,
      },
    })

    res.json(classes)
  } catch (err) {
    console.error(err)

    res.status(500).json({
      message: "Failed to fetch classes",
    })
  }
}