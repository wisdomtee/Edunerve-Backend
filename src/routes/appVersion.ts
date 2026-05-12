import { Router } from "express"

const router = Router()

router.get("/", async (_req, res) => {
  return res.json({
    latestVersion: "1.0.1",
    latestBuildNumber: 2,
    forceUpdate: false,
    apkUrl: "https://your-download-link.com/EduNerve.apk",
    releaseNotes: [
      "Improved parent dashboard",
      "Improved teacher dashboard",
      "Bug fixes and performance updates",
    ],
  })
})

export default router