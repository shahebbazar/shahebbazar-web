"use server";

import { revalidatePath } from "next/cache";
import { authenticatedApiSend, type AuthenticatedSendResult } from "@/lib/auth-server";

// The API checks the forwarded session belongs to an admin.

// Dismisses a report, or takes the reported item down.
export async function resolveReport(reportId: number, action: "dismiss" | "take_down"): Promise<AuthenticatedSendResult> {
    const result = await authenticatedApiSend("POST", `/admin/reports/${reportId}/resolve`, { action });
    revalidatePath("/", "layout");
    return result;
}

// Hides a review from the public site, or restores it.
export async function setReviewStatus(reviewId: number, status: "published" | "hidden"): Promise<AuthenticatedSendResult> {
    const result = await authenticatedApiSend("POST", `/admin/reviews/${reviewId}/status`, { status });
    revalidatePath("/", "layout");
    return result;
}
