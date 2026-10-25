import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { AccountShell } from "@/components/customer/AccountShell";
import { ThreadView } from "@/components/messaging/ThreadView";
import { authenticatedApiGet } from "@/lib/auth-server";
import type { ConversationThread } from "@/lib/types";
import { replyAsCustomer } from "../../../actions";

export const metadata: Metadata = {
    title: "Conversation",
};

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    if (!/^\d{1,10}$/.test(id)) notFound();
    const thread = await authenticatedApiGet<ConversationThread>(`/me/conversations/${id}`);
    if (!thread) notFound();

    return (
        <AccountShell current="messages" title="Messages">
            <Link href="/account/messages" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
                <ChevronLeft className="size-4" /> All messages
            </Link>
            <ThreadView
                thread={thread}
                otherName={thread.conversation.vendor_name}
                otherPhoto={thread.conversation.vendor_logo}
                send={replyAsCustomer.bind(null, Number(id))}
                reportBackHref={`/account/messages/${id}`}
            />
        </AccountShell>
    );
}
