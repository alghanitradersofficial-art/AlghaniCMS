import type { ErrorRequestHandler } from "express";
import { logger } from "./logger.js";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  logger.error({ err }, "Unhandled error");
  const status = typeof (err as any).status === "number" ? (err as any).status : 500;
  const message = typeof (err as any).message === "string" ? (err as any).message : "Internal server error";
  res.status(status).json({ error: message });
};
