import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarDays, Plus, Users } from "lucide-react";
import { authenticatedApiGet } from "@/lib/auth-server";
import { apiGet, assetUrl } from "@/lib/api";
import { formatEventWhen } from "@/lib/format";
import { eventTypeLabel } from "@/lib/events";
import type { PublicSettings, VendorEvent, VendorSummary } from "@/lib/types";
import { ProviderShell, parseVendorParam } from "@/components/provider/ProviderShell";
import { providerText } from "@/lib/i18n-provider";
import { getAccountLocale } from "@/lib/locale-server";
import { EventStatusBadge } from "./EventStatusBadge";

export const metadata: Metadata = {
    title: "Events",
};

// The business's events (KAN-298): add one, see each one's status and who's coming.
export default async function EventsPage({ searchParams }: { searchParams: Promise<{ vendor?: string; deleted?: string }> }) {
    const params = await searchParams;
    const vendorId = parseVendorParam(params.vendor);
    if (vendorId === null) redirect("/vendors/dashboard");

    const [vendor, events, settings] = await Promise.all([
        authenticatedApiGet<VendorSummary>(`/vendors/${vendorId}/summary`),
        authenticatedApiGet<VendorEvent[]>(`/vendors/${vendorId}/events`),
        apiGet<PublicSettings>("/settings/public").catch(() => null),
    ]);
    if (!vendor) notFound();
    const list = events ?? [];

    const copy = providerText(await getAccountLocale());
    return (
        <ProviderShell vendor={vendor} current="events">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">{copy.navEvents}</h1>
                    <p className="mt-1.5 max-w-2xl text-[0.9375rem] text-muted">
                        {settings?.require_event_approval ? copy.eventsIntroApproval : copy.eventsIntroDirect}
                    </p>
                </div>
                <Link
                    href={`/vendors/dashboard/events/new?vendor=${vendor.vendor_id}`}
                    className="inline-flex items-center gap-1.5 rounded-[10px] bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                >
                    <Plus className="size-4" /> {copy.eventsAdd}
                </Link>
            </div>

            {params.deleted && (
                <p role="status" className="mt-4 rounded-lg bg-success-bg p-3 text-[0.8125rem] text-success-ink">
                    Event deleted.
                </p>
            )}

            {list.length === 0 ? (
                <div className="mt-6 rounded-xl border border-dashed border-line-strong bg-surface p-10 text-center">
                    <CalendarDays className="mx-auto size-8 text-soft" />
                    <p className="mt-3 font-medium">No events yet</p>
                    <p className="mt-1 text-[0.875rem] text-muted">Add your first one, with photos and the details people need.</p>
                </div>
            ) : (
                <ul className="mt-6 space-y-3">
                    {list.map((event) => {
                        const cover = assetUrl(event.event_image_url);
                        return (
                            <li key={event.event_id} className="relative flex gap-4 rounded-xl border border-line bg-surface p-4 shadow-card">
                                <span className="aspect-[4/3] w-24 shrink-0 self-start overflow-hidden rounded-lg bg-gradient-to-br from-brand-100 to-brand-200 sm:w-36">
                                    {cover && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={cover} alt="" className="size-full object-cover" />
                                    )}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h2 className="font-semibold">
                                            <Link
                                                href={`/vendors/dashboard/events/${event.event_id}?vendor=${vendor.vendor_id}`}
                                                className="after:absolute after:inset-0 hover:text-brand-600"
                                            >
                                                {event.event_title}
                                            </Link>
                                        </h2>
                                        <EventStatusBadge status={event.event_status} ended={event.ended} />
                                    </div>
                                    <p className="mt-0.5 text-[0.8125rem] text-muted">
                                        {eventTypeLabel(event.event_type)} · {formatEventWhen(event.event_starts_at, event.event_ends_at)}
                                    </p>
                                    <p className="mt-1 flex items-center gap-1.5 text-[0.8125rem] text-muted">
                                        <Users className="size-3.5 shrink-0" /> {event.going_count} going · {event.interested_count} interested ·{" "}
                                        {event.photo_count} photo{event.photo_count === 1 ? "" : "s"}
                                    </p>
                                    {event.event_status === "rejected" && event.event_rejection_reason && (
                                        <p className="mt-1.5 text-[0.8125rem] text-shut-ink">Rejected: {event.event_rejection_reason}</p>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </ProviderShell>
    );
}
