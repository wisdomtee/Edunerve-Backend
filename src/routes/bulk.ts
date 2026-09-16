import { Router } from "express";
import upload from '../middlewares/upload.middleware'
import { authenticate as authMiddleware } from "../middlewares/auth.middleware"
import { bulkResultUpload } from "../controllers/bulkResult.controller";

const router = Router();

router.post(
  "/results/bulk",
  authMiddleware,
  upload.single("file"),
  bulkResultUpload
);

export default router;