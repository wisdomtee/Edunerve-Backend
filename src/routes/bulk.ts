import { Router } from "express";
import { upload } from "../middleware/upload.middleware";
import { bulkResultUpload } from "../controllers/bulkResult.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

router.post(
  "/results/bulk",
  authMiddleware,
  upload.single("file"),
  bulkResultUpload
);

export default router;