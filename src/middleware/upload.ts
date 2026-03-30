import multer from "multer"
import { CloudinaryStorage } from "multer-storage-cloudinary"
import cloudinary from "../config/cloudinary"

const storage = new CloudinaryStorage({
  cloudinary,
  params: async () => ({
    resource_type: "image",
    public_id: `edunerve-student-${Date.now()}`,
  }),
})

const upload = multer({ storage })

export default upload