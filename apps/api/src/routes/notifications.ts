import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

// GET /api/v1/notifications
router.get("/", async (req: Request, res: Response) => {
  const userId = req.auth!.sub;

  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { user_id: userId },
      orderBy: { created_at: "desc" },
      take: 20,
    }),
    prisma.notification.count({ where: { user_id: userId, read: false } }),
  ]);

  res.json({ items, unreadCount });
});

// PATCH /api/v1/notifications/read-all
router.patch("/read-all", async (req: Request, res: Response) => {
  await prisma.notification.updateMany({
    where: { user_id: req.auth!.sub, read: false },
    data: { read: true },
  });

  res.json({ ok: true });
});

// PATCH /api/v1/notifications/:id/read
router.patch("/:id/read", async (req: Request, res: Response) => {
  const result = await prisma.notification.updateMany({
    where: { id: String(req.params.id), user_id: req.auth!.sub },
    data: { read: true },
  });

  if (result.count === 0) {
    res.status(404).json({ error: "Notifikasi tidak ditemukan." });
    return;
  }

  res.json({ ok: true });
});

export default router;
