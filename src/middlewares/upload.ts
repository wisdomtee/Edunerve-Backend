import multer from "multer"
import path from "path"
import fs from "fs"

/* CREATE FOLDERS IF NOT EXIST */
const passportDir = path.join(
  process.cwd(),
  "uploads/passports"
)

const logoDir = path.join(
  process.cwd(),
  "uploads/logos"
)

if (!fs.existsSync(passportDir)) {
  fs.mkdirSync(passportDir, {
    recursive: true,
  })
}

if (!fs.existsSync(logoDir)) {
  fs.mkdirSync(logoDir, {
    recursive: true,
  })
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === "passport") {
      cb(null, passportDir)
    } else {
      cb(null, logoDir)
    }
  },

  filename: (req, file, cb) => {
    const uniqueName =
      Date.now() +
      "-" +
      file.originalname.replace(/\s/g, "")

    cb(null, uniqueName)
  },
})

const upload = multer({
  storage,
})

export default upload