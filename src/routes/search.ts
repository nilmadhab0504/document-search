import { Router } from "express";
import { searchDocuments } from "../controllers/search.ts";
import { rateLimitMiddleware } from "../middleware/rate-limit.ts";
import { tenantMiddleware } from "../middleware/tenant.ts";

const router = Router();

router.use(tenantMiddleware);
router.use(rateLimitMiddleware);

router.get("/", searchDocuments);

export default router;