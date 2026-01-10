import { Request, Response, NextFunction } from "express";

// Simplified auth middleware - API key auth not needed for Moru-only mode
export const apiKeyAuth = (_req: Request, _res: Response, next: NextFunction) => {
  // Skip API key auth - this was only for production remote mode
  next();
};
