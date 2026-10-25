"use server";

import { revalidatePath } from "next/cache";
import { authenticatedApiSend, type AuthenticatedSendResult } from "@/lib/auth-server";
import type { VendorEvent } from "@/lib/types";

// The business's events (KAN-298). The API checks the forwarded session runs the business.

export type EventFormBody = {
    title: string;
    title_bn: string;
    description: string;
    type: string;
    starts_at: string;
    ends_at: string;
    is_online: boolean;
    online_url: string;
    venue: string;
    location_id: string;
    price_type: string;
    price_bdt: string;
    ticket_url: string;
};

const validId = (id: number) => Number.isSafeInteger(id) && id > 0;

/** Adds an event (no eventId) or saves changes to one. `notified`: people going told of a new time or place. */
export async function saveEvent(
    vendorId: number,
    eventId: number | null,
    body: EventFormBody
): Promise<AuthenticatedSendResult<{ event: VendorEvent; notified?: number }>> {
    if (!validId(vendorId) || (eventId !== null && !validId(eventId))) return { ok: false, error: "Invalid event" };
    const result = eventId === null
        ? await authenticatedApiSend<{ event: VendorEvent }>("POST", `/vendors/${vendorId}/events`, body)
        : await authenticatedApiSend<{ event: VendorEvent; notified: number }>("PUT", `/events/${eventId}`, body);
    if (result.ok) revalidatePath("/", "layout");
    return result;
}

/** Cancels the event; everyone going gets a message, with the note if there is one. */
export async function cancelEvent(eventId: number, note: string): Promise<AuthenticatedSendResult<{ event: VendorEvent; notified: number }>> {
    if (!validId(eventId)) return { ok: false, error: "Invalid event" };
    const result = await authenticatedApiSend<{ event: VendorEvent; notified: number }>("POST", `/events/${eventId}/cancel`, {
        note: typeof note === "string" ? note : "",
    });
    if (result.ok) revalidatePath("/", "layout");
    return result;
}

/** Writes to everyone going; each gets it in their Messages. */
export async function messageGoing(eventId: number, body: string): Promise<AuthenticatedSendResult<{ sent: number }>> {
    if (!validId(eventId)) return { ok: false, error: "Invalid event" };
    return authenticatedApiSend<{ sent: number }>("POST", `/events/${eventId}/message`, { body: typeof body === "string" ? body : "" });
}

export async function deleteEvent(eventId: number): Promise<AuthenticatedSendResult> {
    if (!validId(eventId)) return { ok: false, error: "Invalid event" };
    const result = await authenticatedApiSend("DELETE", `/events/${eventId}`);
    if (result.ok) revalidatePath("/", "layout");
    return result;
}
