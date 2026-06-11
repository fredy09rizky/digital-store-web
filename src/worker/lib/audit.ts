import type { AppBindings } from "../env";
import { nanoId } from "./id";
import { now } from "./time";

export interface AuditInput {
  actorKind: "user" | "admin" | "system";
  actorId?: string | null;
  action: string;
  targetKind?: string | null;
  targetId?: string | null;
  meta?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

export async function writeAudit(db: D1Database, input: AuditInput) {
  await db
    .prepare(
      `INSERT INTO audit_logs (id, actor_kind, actor_id, action, target_kind, target_id, meta, ip, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      nanoId("aud"),
      input.actorKind,
      input.actorId ?? null,
      input.action,
      input.targetKind ?? null,
      input.targetId ?? null,
      JSON.stringify(input.meta ?? {}),
      input.ip ?? null,
      input.userAgent ?? null,
      now(),
    )
    .run();
}

export async function audit(env: AppBindings, input: AuditInput) {
  return writeAudit(env.DB, input);
}
