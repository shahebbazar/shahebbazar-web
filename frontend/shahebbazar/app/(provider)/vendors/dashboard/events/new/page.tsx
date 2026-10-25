import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { authenticatedApiGet } from "@/lib/auth-server";
import { apiGet } from "@/lib/api";
import type { PublicSettings, VendorSummary } from "@/lib/types";
import { ProviderShell, parseVendorParam } from "@/components/provider/ProviderShell";
import { EventForm } from "../EventForm";

export const metadata: Metadata = {
    title: "Add an event",
};

export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ vendor?: string }> }) {
    const vendorId = parseVendorParam((await searchParams).vendor);
    if (vendorId === null) redirect("/vendors/dashboard");

    const [vendor, areas, settings] = await Promise.all([
        authenticatedApiGet<VendorSummary>(`/vendors/${vendorId}/summary`),
        apiGet<{ id: number; name: string; city: string }[]>("/locations/areas").catch(() => null),
        apiGet<PublicSettings>("/settings/public").catch(() => null),
    ]);
    if (!vendor) notFound();

    return (
        <ProviderShell vendor={vendor} current="events">
            <Link href={`/vendors/dashboard/events?vendor=${vendor.vendor_id}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
                <ChevronLeft className="size-4" /> Events
            </Link>
            <h1 className="mt-2 text-[1.75rem] leading-tight font-bold tracking-tight">Add an event</h1>
            <p className="mt-1.5 mb-6 text-[0.9375rem] text-muted">
                {settings?.require_event_approval
                    ? "An administrator checks new events before they appear publicly."
                    : "Your event appears on the Events page as soon as you add it."}
            </p>
            <EventForm vendorId={vendor.vendor_id} areas={areas ?? []} />
        </ProviderShell>
    );
}
