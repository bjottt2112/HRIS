import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.use(requireAuth, requireRole("SUPER_ADMIN"));

// GET /api/v1/audit-logs
router.get("/", async (req: Request, res: Response) => {
  const entity = typeof req.query.entity === "string" ? req.query.entity : undefined;

  const logs = await prisma.auditLog.findMany({
    where: entity ? { entity } : undefined,
    orderBy: { created_at: "desc" },
    take: 100,
    include: { actor: { select: { email: true, name: true } } },
  });

  res.json(logs);
});

export default router;
