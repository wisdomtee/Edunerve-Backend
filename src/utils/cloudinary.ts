import { v2 as cloudinary } from "cloudinary"
import { CloudinaryStorage } from "multer-storage-cloudinary"

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME as string,
  api_key: process.env.CLOUDINARY_API_KEY as string,
  api_secret: process.env.CLOUDINARY_API_SECRET as string,
})

export const storage = new CloudinaryStorage({
  cloudinary,
  params: async () => ({
    folder: "edunerve/students",
    allowed_formats: ["jpg", "png", "jpeg"],
  }),
})