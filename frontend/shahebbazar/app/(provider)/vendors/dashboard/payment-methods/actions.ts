"use server";

import { revalidatePath } from "next/cache";
import { authenticatedApiSend } from "@/lib/auth-server";
import type { PaymentMethod } from "@/lib/types";

export type SavePaymentMethodsResult =
    | { ok: true; methods: PaymentMethod[] }
    | { ok: false; error: string };

export async function savePaymentMethods(
    vendorId: number,
    methods: PaymentMethod[]
): Promise<SavePaymentMethodsResult> {
    if (!Number.isSafeInteger(vendorId) || vendorId <= 0) {
        return { ok: false, error: "Invalid vendor id" };
    }
    if (!Array.isArray(methods)) {
        return { ok: false, error: "Invalid payment methods" };
    }

    // The API checks the forwarded session belongs to the owner of vendorId, or an admin.
    const saved = await authenticatedApiSend<PaymentMethod[]>("PUT", `/vendors/${vendorId}/payment-methods`, { methods });
    const result: SavePaymentMethodsResult = saved.ok
        ? { ok: true, methods: saved.data }
        : { ok: false, error: saved.error };

    // Refresh cached business profiles so the change shows immediately.
    if (result.ok) {
        revalidatePath("/(public)/business/[slug]", "page");
    }

    return result;
}
