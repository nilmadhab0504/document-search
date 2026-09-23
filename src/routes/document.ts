import { Router } from "express";
import {
  createDocument,
  getDocument,
  deleteDocument,
} from "../controllers/document.ts";
import { tenantMiddleware } from "../middleware/tenant.ts";
import { rateLimitMiddleware } from "../middleware/rate-limit.ts";

const router = Router();

router.use(tenantMiddleware);
router.use(rateLimitMiddleware);

router.post("/", createDocument);
router.get("/:id", getDocument);
router.delete("/:id", deleteDocument);

export default router;