import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { authenticatedApiGet, getViewer } from "@/lib/auth-server";
import { ProviderShell, parseVendorParam, providerHref } from "@/components/provider/ProviderShell";
import type { CampaignDetail, VendorSummary } from "@/lib/types";
import { CampaignEditor } from "./CampaignEditor";

export const metadata: Metadata = {
    title: "Campaign",
};

export default async function CampaignPage({
    params,
    searchParams,
}: {
    params: Promise<{ campaignId: string }>;
    searchParams: Promise<{ vendor?: string }>;
}) {
    const [{ campaignId }, { vendor: rawVendor }] = await Promise.all([params, searchParams]);
    const vendorId = parseVendorParam(rawVendor);
    if (vendorId === null || !/^\d{1,10}$/.test(campaignId)) redirect("/vendors/dashboard");
    const [vendor, campaign, viewer] = await Promise.all([
        authenticatedApiGet<VendorSummary>(`/vendors/${vendorId}/summary`),
        authenticatedApiGet<CampaignDetail>(`/vendors/${vendorId}/marketing/campaigns/${campaignId}`),
        getViewer(),
    ]);
    if (!vendor || !campaign) notFound();

    return (
        <ProviderShell vendor={vendor} current="marketing">
            <Link
                href={providerHref("/vendors/dashboard/marketing", vendorId)}
                className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-brand-600 hover:underline"
            >
                <ChevronLeft className="size-4" /> Marketing
            </Link>
            <h1 className="mt-2 text-[1.75rem] leading-tight font-bold tracking-tight">{campaign.title}</h1>
            {/* Campaigns are written as the business, so an admin sees them but cannot change them. */}
            <CampaignEditor key={campaign.campaign_id} vendorId={vendorId} initial={campaign} readOnly={viewer?.user_role === "admin"} />
        </ProviderShell>
    );
}
