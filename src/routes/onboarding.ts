import { Router } from "express";
import { registerSchool } from "../controllers/onboarding.controller";

const router = Router();

router.post("/school/register", registerSchool);

export default router;