"use server";

import { revalidatePath } from "next/cache";
import {
    authenticatedApiSend,
    type AuthenticatedSendResult,
} from "@/lib/auth-server";
import type { BusinessMember, OwnerDetails } from "@/lib/types";

// Sends the owner's reply in a conversation.
export async function replyAsOwner(vendorId: number, conversationId: number, body: string): Promise<AuthenticatedSendResult> {
    const result = await authenticatedApiSend("POST", `/vendors/${vendorId}/conversations/${conversationId}/messages`, { body });
    revalidatePath("/vendors/dashboard", "layout");
    return result;
}

// Saves or clears the owner's public reply to a review.
export async function saveReviewReply(vendorId: number, reviewId: number, reply: string): Promise<AuthenticatedSendResult> {
    const result = await authenticatedApiSend("PUT", `/vendors/${vendorId}/reviews/${reviewId}/reply`, { reply });
    if (result.ok) revalidatePath("/", "layout");
    return result;
}

// Saves the signed-in owner's or manager's name and email.
export async function saveOwnerDetails(
    vendorId: number,
    name: string,
    email: string
): Promise<AuthenticatedSendResult<OwnerDetails>> {
    return authenticatedApiSend<OwnerDetails>("PUT", `/vendors/${vendorId}/owner`, { user_name: name, user_email: email });
}

// Marks all of the owner's alerts as read.
export async function markOwnerAlertsRead(vendorId: number): Promise<void> {
    await authenticatedApiSend("POST", `/vendors/${vendorId}/alerts/read`);
    revalidatePath("/vendors/dashboard");
}

// Lets another account help run the business. Owner only; the API checks.
export async function addManager(vendorId: number, phone: string): Promise<AuthenticatedSendResult<BusinessMember[]>> {
    return authenticatedApiSend<BusinessMember[]>("POST", `/vendors/${vendorId}/members`, { phone });
}

export async function removeManager(vendorId: number, userId: number): Promise<AuthenticatedSendResult<BusinessMember[]>> {
    return authenticatedApiSend<BusinessMember[]>("DELETE", `/vendors/${vendorId}/members/${userId}`);
}
