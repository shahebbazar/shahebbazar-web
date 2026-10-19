"use server";

import { revalidatePath } from "next/cache";
import { authenticatedApiSend, type AuthenticatedSendResult } from "@/lib/auth-server";

// The API checks the forwarded session belongs to an admin and records each change in the audit log.
// Pages are refreshed so sponsored placement on the home and search pages changes straight away.

export type PassAction = "extend" | "end-date" | "end-now" | "suspend" | "resume" | "cancel";

// Gives an approved business a pass starting now.
export async function activatePass(vendorId: number, packageId: number): Promise<AuthenticatedSendResult> {
    const result = await authenticatedApiSend("POST", "/admin/marketing/subscriptions", { vendor_id: vendorId, package_id: packageId });
    if (result.ok) revalidatePath("/", "layout");
    return result;
}

// Extends, ends, suspends, resumes or cancels a pass.
export async function changePass(
    subscriptionId: number,
    action: PassAction,
    body: { days?: number; ends_at?: string; reason?: string } = {}
): Promise<AuthenticatedSendResult> {
    const result = await authenticatedApiSend("POST", `/admin/marketing/subscriptions/${subscriptionId}/${action}`, body);
    if (result.ok) revalidatePath("/", "layout");
    return result;
}
