import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { authenticatedApiGet } from "@/lib/auth-server";
import { ProviderShell, parseVendorParam, providerHref, dashboardFor } from "@/components/provider/ProviderShell";
import { providerText } from "@/lib/i18n-provider";
import { getAccountLocale } from "@/lib/locale-server";
import { ConversationList } from "@/components/messaging/ConversationList";
import type { ConversationSummary, VendorSummary } from "@/lib/types";

export const metadata: Metadata = {
    title: "Inquiries",
};

export default async function InquiriesPage({ searchParams }: { searchParams: Promise<{ vendor?: string }> }) {
    const vendorId = parseVendorParam((await searchParams).vendor);
    if (vendorId === null) redirect(dashboardFor("/vendors/dashboard/inquiries"));
    const [vendor, conversations] = await Promise.all([
        authenticatedApiGet<VendorSummary>(`/vendors/${vendorId}/summary`),
        authenticatedApiGet<ConversationSummary[]>(`/vendors/${vendorId}/conversations?type=inquiries`),
    ]);
    if (!vendor) notFound();

    const copy = providerText(await getAccountLocale());
    return (
        <ProviderShell vendor={vendor} current="inquiries">
            <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">{copy.inquiriesTitle}</h1>
            <p className="mt-1.5 mb-5 text-[0.9375rem] text-muted">
                {copy.inquiriesIntro}
            </p>
            <ConversationList
                conversations={conversations ?? []}
                hrefFor={(id) => providerHref(`/vendors/dashboard/messages/${id}`, vendorId)}
                show="customer"
                empty="No product inquiries yet."
            />
        </ProviderShell>
    );
}
