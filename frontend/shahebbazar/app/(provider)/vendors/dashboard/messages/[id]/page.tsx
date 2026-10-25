import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { authenticatedApiGet } from "@/lib/auth-server";
import {
    ProviderShell,
    parseVendorParam,
    providerHref,
} from "@/components/provider/ProviderShell";
import { ThreadView } from "@/components/messaging/ThreadView";
import type { ConversationThread, VendorSummary } from "@/lib/types";
import { replyAsOwner } from "../../owner-actions";

export const metadata: Metadata = {
    title: "Conversation",
};

interface PageProps {
    params: Promise<{
        id: string;
    }>;
    searchParams: Promise<{
        vendor?: string;
    }>;
}

export default async function OwnerConversationPage({
    params,
    searchParams,
}: PageProps) {
    const [{ id }, query] = await Promise.all([params, searchParams]);

    const vendorId = parseVendorParam(query.vendor);

    if (vendorId === null) {
        redirect("/vendors/dashboard");
    }

    if (!/^\d{1,10}$/.test(id)) {
        notFound();
    }


    const conversationId = Number(id);

    const [vendor, thread] = await Promise.all([
        authenticatedApiGet<VendorSummary>(`/vendors/${vendorId}/summary`),
        authenticatedApiGet<ConversationThread>(
            `/vendors/${vendorId}/conversations/${conversationId}`
        ),
    ]);

    if (!vendor || !thread) {
        notFound();
    }

    return (
        <ProviderShell vendor={vendor} current="messages">
            <Link
                href={
                    providerHref(
                        "/vendors/dashboard/messages",
                        vendorId
                    )
                }
                className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"
            >
                <ChevronLeft className="size-4" aria-hidden="true" />
                All messages
            </Link>

            <ThreadView
                thread={thread}
                otherName={thread.conversation.customer_name}
                otherPhoto={thread.conversation.customer_avatar}
                send={replyAsOwner.bind(null, vendorId, conversationId)}
            />
        </ProviderShell>
    );
}
