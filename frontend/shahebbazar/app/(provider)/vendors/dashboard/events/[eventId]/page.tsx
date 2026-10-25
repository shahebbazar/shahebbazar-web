import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, ExternalLink, Users } from "lucide-react";
import { authenticatedApiGet } from "@/lib/auth-server";
import { apiGet } from "@/lib/api";
import type { VendorEvent, VendorSummary } from "@/lib/types";
import { ProviderShell, parseVendorParam } from "@/components/provider/ProviderShell";
import { EventForm } from "../EventForm";
import { EventPhotos } from "../EventPhotos";
import { EventActions } from "../EventActions";
import { EventStatusBadge } from "../EventStatusBadge";
import { EventMessage } from "../EventMessage";

export const metadata: Metadata = {
    title: "Edit event",
};

const ADDED: Record<string, string> = {
    pending: "Event added. It appears publicly once an administrator approves it.",
    published: "Event added and live.",
};

export default async function EditEventPage({
    params,
    searchParams,
}: {
    params: Promise<{ eventId: string }>;
    searchParams: Promise<{ vendor?: string; added?: string; photos?: string }>;
}) {
    const [{ eventId: rawId }, query] = await Promise.all([params, searchParams]);
    const vendorId = parseVendorParam(query.vendor);
    const eventId = parseVendorParam(rawId);
    if (vendorId === null) redirect("/vendors/dashboard");
    if (eventId === null) notFound();

    const [vendor, event, areas] = await Promise.all([
        authenticatedApiGet<VendorSummary>(`/vendors/${vendorId}/summary`),
        authenticatedApiGet<VendorEvent>(`/events/${eventId}/manage`),
        apiGet<{ id: number; name: string; city: string }[]>("/locations/areas").catch(() => null),
    ]);
    // Only events of the business in the address, so the page frame always matches the event.
    if (!vendor || !event || event.vendor_id !== vendor.vendor_id) notFound();

    const ended = event.ended;
    const visible = event.event_status === "published" || event.event_status === "cancelled";

    return (
        <ProviderShell vendor={vendor} current="events">
            <Link href={`/vendors/dashboard/events?vendor=${vendor.vendor_id}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
                <ChevronLeft className="size-4" /> Events
            </Link>
            <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">{event.event_title}</h1>
                <EventStatusBadge status={event.event_status} ended={ended} />
            </div>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.9375rem] text-muted">
                <span className="inline-flex items-center gap-1.5">
                    <Users className="size-4" /> {event.going_count} going · {event.interested_count} interested
                </span>
                {visible && (
                    <Link href={`/events/${event.event_slug}`} target="_blank" className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline">
                        View public page <ExternalLink className="size-3.5" />
                    </Link>
                )}
            </p>

            {query.added && ADDED[query.added] && (
                <p role="status" className="mt-4 rounded-lg bg-success-bg p-3 text-[0.8125rem] text-success-ink">
                    {ADDED[query.added]}
                    {query.photos === "failed" && " The photos couldn't be uploaded; add them below."}
                </p>
            )}
            {event.event_status === "rejected" && (
                <p role="alert" className="mt-4 rounded-lg border border-shut-ink/30 bg-shut-bg p-3 text-[0.875rem] text-shut-ink">
                    <span className="font-semibold">An administrator rejected this event.</span> {event.event_rejection_reason} Saving your
                    changes sends it for approval again.
                </p>
            )}
            {event.event_status === "cancelled" && (
                <p className="mt-4 rounded-lg bg-surface-2 p-3 text-[0.875rem] text-muted">
                    This event is cancelled. Its page stays up with a notice; it can no longer be edited.
                </p>
            )}

            <div className="mt-6 space-y-6">
                <EventPhotos eventId={event.event_id} initial={event.photos ?? []} />
                {event.event_status === "published" && (
                    <EventMessage eventId={event.event_id} going={event.going_count} open={!ended} />
                )}
                {event.event_status !== "cancelled" && <EventForm vendorId={vendor.vendor_id} areas={areas ?? []} event={event} />}
                <EventActions
                    eventId={event.event_id}
                    vendorId={vendor.vendor_id}
                    canCancel={(event.event_status === "published" || event.event_status === "pending") && !ended}
                    going={event.going_count}
                />
            </div>
        </ProviderShell>
    );
}
