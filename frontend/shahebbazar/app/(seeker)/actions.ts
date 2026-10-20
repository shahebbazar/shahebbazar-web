"use server";

import { revalidatePath } from "next/cache";
import {
    authenticatedApiGet,
    authenticatedApiSend,
    type AuthenticatedSendResult,
} from "@/lib/auth-server";
import type { Customer, ReportTargetType, ViewerState } from "@/lib/types";



// Loads whether the customer saved this business and their review of it.
export async function getViewerState(slug: string): Promise<ViewerState | null> {
    return authenticatedApiGet<ViewerState>(`/me/businesses/${encodeURIComponent(slug)}`).catch(() => null);
}

// Loads the ids of every business the customer has saved.
export async function getSavedIds(): Promise<number[]> {
    return (await authenticatedApiGet<number[]>("/me/saved-ids").catch(() => null)) ?? [];
}

// Saves or unsaves a business.
export async function setSaved(vendorId: number, saved: boolean): Promise<AuthenticatedSendResult> {
    const result = await authenticatedApiSend(saved ? "PUT" : "DELETE", `/me/saved/${vendorId}`);
    revalidatePath("/account", "layout");
    return result;
}

// Saves the customer's name and email address (KAN-294). An empty email removes it.
export async function saveMyDetails(name: string, email: string): Promise<AuthenticatedSendResult<Customer>> {
    const result = await authenticatedApiSend<Customer>("PUT", "/me/profile", { name, email });
    revalidatePath("/account", "layout");
    return result;
}

// Posts or updates the customer's review
export async function postReview(
    slug: string,
    rating: number,
    body: string
): Promise<AuthenticatedSendResult> {
    const result = await authenticatedApiSend(
        "POST",
        `/businesses/${encodeURIComponent(
            slug
        )}/reviews`,
        {
            rating,
            body,
        }
    );

    if (result.ok) {
        revalidatePath(
            `/business/${encodeURIComponent(
                slug
            )}`
        );

        revalidatePath("/account/reviews");
        revalidatePath("/account");
    }

    return result;
}

// Sends a report about a business, product, review or message.
export async function sendReport(
    targetType: ReportTargetType,
    targetId: number,
    reason: string,
    details: string
): Promise<AuthenticatedSendResult> {
    return authenticatedApiSend("POST", "/reports", { target_type: targetType, target_id: targetId, reason, details });
}

// Starts a conversation with a business, optionally about one product.
export async function startConversation(
    vendorId: number,
    listingId: number | null,
    body: string
): Promise<AuthenticatedSendResult<{ conversation_id: number }>> {
    const result = await authenticatedApiSend<{ conversation_id: number }>("POST", "/me/conversations", {
        vendor_id: vendorId,
        listing_id: listingId,
        body,
    });
    revalidatePath("/account", "layout");
    return result;
}

// Sends a reply in one of the customer's conversations.
export async function replyAsCustomer(conversationId: number, body: string): Promise<AuthenticatedSendResult> {
    const result = await authenticatedApiSend("POST", `/me/conversations/${conversationId}/messages`, { body });
    revalidatePath(`/account/messages/${conversationId}`);
    return result;
}

// Marks all the customer's alerts as read.
export async function markMyAlertsRead(): Promise<void> {
    await authenticatedApiSend("POST", "/me/alerts/read");
    revalidatePath("/account");
}
