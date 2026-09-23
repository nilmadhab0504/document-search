import type { Request, Response, NextFunction } from "express";

export interface TenantRequest extends Request {
  tenantId: string;
}

export function tenantMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const tenantId = req.header("X-Tenant-ID");

  if (!tenantId) {
    res.status(400).json({
      error: "X-Tenant-ID header is required",
    });
    return;
  }

  (req as TenantRequest).tenantId = tenantId;

  next();
}