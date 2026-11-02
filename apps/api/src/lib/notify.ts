import { prisma } from "./prisma";
import { sendMail } from "./mailer";

type NotificationPayload = {
  title: string;
  message: string;
  type?: string;
  link?: string;
};

export async function notifyUserIds(
  userIds: Array<string | null | undefined>,
  payload: NotificationPayload,
): Promise<void> {
  const unique = [
    ...new Set(userIds.filter((id): id is string => Boolean(id))),
  ];
  if (unique.length === 0) return;

  try {
    await prisma.notification.createMany({
      data: unique.map((userId) => ({
        user_id: userId,
        title: payload.title,
        message: payload.message,
        type: payload.type ?? "INFO",
        link: payload.link ?? null,
      })),
    });
  } catch (error) {
    console.error("🚨 Gagal membuat notifikasi:", error);
  }
}

export async function notifyRoles(
  roles: string[],
  payload: NotificationPayload,
): Promise<void> {
  const users = await prisma.user.findMany({
    where: { role: { in: roles }, status: "ACTIVE" },
    select: { id: true },
  });

  await notifyUserIds(
    users.map((user) => user.id),
    payload,
  );
}

/**
 * Kirim email ke pengguna tertentu. Kegagalan email tidak boleh menggagalkan
 * alur bisnis (notifikasi in-app tetap tersimpan).
 */
export async function emailUserIds(
  userIds: Array<string | null | undefined>,
  subject: string,
  text: string,
): Promise<void> {
  const unique = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return;

  const users = await prisma.user.findMany({
    where: { id: { in: unique }, status: "ACTIVE" },
    select: { email: true },
  });

  await Promise.all(
    users.map((user) =>
      sendMail({ to: user.email, subject, text }).catch((error) => {
        console.error("🚨 Gagal mengirim email:", error);
      }),
    ),
  );
}
