import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { authenticatedApiGet } from "@/lib/auth-server";
import { 
    ProviderShell, 
    parseVendorParam, 
    providerHref,
    dashboardFor,
} from "@/components/provider/ProviderShell";
import { providerText } from "@/lib/i18n-provider";
import { getAccountLocale } from "@/lib/locale-server";
import { ConversationList } from "@/components/messaging/ConversationList";
import type {
    ConversationSummary,
    VendorSummary,
} from "@/lib/types";

export const metadata: Metadata = {
    title: "Messages",
};

export default async function OwnerMessagesPage({ searchParams }: { searchParams: Promise<{ vendor?: string }> }) {
    const vendorId = parseVendorParam((await searchParams).vendor);
    if (vendorId === null) redirect(dashboardFor("/vendors/dashboard/messages"));
    const [vendor, conversations] = await Promise.all([
        authenticatedApiGet<VendorSummary>(`/vendors/${vendorId}/summary`),
        authenticatedApiGet<ConversationSummary[]>(`/vendors/${vendorId}/conversations`),
    ]);
    if (!vendor) notFound();

    const copy = providerText(await getAccountLocale());
    return (
        <ProviderShell vendor={vendor} current="messages">
            <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">{copy.navMessages}</h1>
            <p className="mt-1.5 mb-5 text-[0.9375rem] text-muted">{copy.messagesIntro}</p>
            <ConversationList
                conversations={conversations ?? []}
                hrefFor={(id) => providerHref(`/vendors/dashboard/messages/${id}`, vendorId)}
                show="customer"
                empty="No messages yet. Customers can message you from your public page."
            />
        </ProviderShell>
    );
}
