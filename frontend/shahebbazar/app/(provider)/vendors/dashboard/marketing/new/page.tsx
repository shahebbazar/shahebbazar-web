import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { authenticatedApiGet, getViewer } from "@/lib/auth-server";
import { ProviderShell, parseVendorParam, providerHref } from "@/components/provider/ProviderShell";
import type { MarketingWorkspace, VendorEvent, VendorSummary } from "@/lib/types";
import { NewCampaignForm } from "./NewCampaignForm";

export const metadata: Metadata = {
    title: "New campaign",
};

export default async function NewCampaignPage({ searchParams }: { searchParams: Promise<{ vendor?: string }> }) {
    const vendorId = parseVendorParam((await searchParams).vendor);
    if (vendorId === null) redirect("/vendors/dashboard");
    const [vendor, workspace, viewer, events] = await Promise.all([
        authenticatedApiGet<VendorSummary>(`/vendors/${vendorId}/summary`),
        authenticatedApiGet<MarketingWorkspace>(`/vendors/${vendorId}/marketing/workspace`),
        getViewer(),
        authenticatedApiGet<VendorEvent[]>(`/vendors/${vendorId}/events`),
    ]);
    if (!vendor) notFound();
    // Admins can look at campaigns but not write them; anyone else goes back to the overview.
    if (!workspace || !workspace.can_create || viewer?.user_role === "admin") {
        redirect(providerHref("/vendors/dashboard/marketing", vendorId));
    }

    return (
        <ProviderShell vendor={vendor} current="marketing">
            <Link
                href={providerHref("/vendors/dashboard/marketing", vendorId)}
                className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-brand-600 hover:underline"
            >
                <ChevronLeft className="size-4" /> Marketing
            </Link>
            <h1 className="mt-2 text-[1.75rem] leading-tight font-bold tracking-tight">New campaign</h1>
            <p className="mt-1.5 text-[0.9375rem] text-muted">
                Answer three questions and we&apos;ll write email, Facebook and WhatsApp drafts from your saved business details.
                You can edit everything before approving.
            </p>
            <NewCampaignForm
                vendorId={vendorId}
                listings={workspace.listings}
                maxListings={workspace.max_listings}
                subscribers={{ total: workspace.email_subscribers, bangla: workspace.email_subscribers_bn }}
                // Only events people can still go to (KAN-298), soonest first.
                events={(events ?? [])
                    .filter((e) => e.event_status === "published" && !e.ended)
                    .sort((a, b) => a.event_starts_at.localeCompare(b.event_starts_at))}
            />
        </ProviderShell>
    );
}
