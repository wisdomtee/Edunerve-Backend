import { Request, Response } from "express"
import prisma from "../prisma"

export const createClass = async (
  req: Request,
  res: Response
) => {
  try {
    const { name } = req.body

    const newClass = await prisma.class.create({
      data: {
        name,
      },
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
  req: Request,
  res: Response
) => {
  try {
    const classes = await prisma.class.findMany()

    res.json(classes)
  } catch (err) {
    console.error(err)

    res.status(500).json({
      message: "Failed to fetch classes",
    })
  }
}