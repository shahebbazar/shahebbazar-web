"use server";

import { revalidatePath } from "next/cache";
import { authenticatedApiSend, type AuthenticatedSendResult } from "@/lib/auth-server";
import type { AdminSettings } from "@/lib/types";

// The API checks the forwarded session belongs to an admin and records each change in the audit log.
export async function changeSetting(
    key: string,
    value: boolean
): Promise<AuthenticatedSendResult<Pick<AdminSettings, "waiting"> & { setting: AdminSettings["settings"][number] }>> {
    const result = await authenticatedApiSend<Pick<AdminSettings, "waiting"> & { setting: AdminSettings["settings"][number] }>(
        "PUT",
        `/admin/settings/${encodeURIComponent(key)}`,
        { value }
    );
    if (result.ok) {
        revalidatePath("/admin", "layout");
        revalidatePath("/vendors/register");
    }
    return result;
}
