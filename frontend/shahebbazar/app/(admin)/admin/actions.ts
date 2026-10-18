"use server";

import { revalidatePath } from "next/cache";
import { authenticatedApiSend } from "@/lib/auth-server";
import type { AdminDecision, AdminDecisionResult } from "@/lib/types";

// Approves or rejects a pending item, then refreshes every cached page so the change shows at once.
// The API checks the forwarded session belongs to an admin.
export async function decide(
    kind: "vendor" | "listing",
    id: number,
    decision: AdminDecision,
    reason: string
): Promise<AdminDecisionResult> {
    if (kind !== "vendor" && kind !== "listing") return { ok: false, error: "Invalid item" };
    if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, error: "Invalid id" };
    if (decision !== "approve" && decision !== "reject") return { ok: false, error: "Invalid decision" };

    const result = await authenticatedApiSend("POST", `/admin/${kind}s/${id}/decision`, {
        decision,
        reason: typeof reason === "string" ? reason : "",
    });
    // Also after a 409: the item was decided elsewhere and should leave the queue.
    revalidatePath("/", "layout");
    return result.ok ? { ok: true } : { ok: false, error: result.error };
}
