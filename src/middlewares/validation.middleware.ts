import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";

/**
 * Global Validation Middleware
 * Reusable for all routes
 */
export const validateRequest =
  (schema: ZodSchema<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error: any) {
      return res.status(400).json({
        message: "Validation Error",
        errors: error.errors,
      });
    }
  };