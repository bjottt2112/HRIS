import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

type AuditInput = {
  actorId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  oldValues?: unknown;
  newValues?: unknown;
  ip?: string | null;
};

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * Menulis audit log tanpa pernah menggagalkan request utama.
 */
export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actor_id: input.actorId ?? null,
        action: input.action,
        entity: input.entity,
        entity_id: input.entityId ?? null,
        old_values: toJson(input.oldValues),
        new_values: toJson(input.newValues),
        ip: input.ip ?? null,
      },
    });
  } catch (error) {
    console.error("🚨 Gagal menulis audit log:", error);
  }
}
