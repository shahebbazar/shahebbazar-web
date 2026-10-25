import Link from "next/link";
import { Check, CheckCheck, Flag } from "lucide-react";
import { MessageForm } from "@/components/customer/MessageForm";
import { formatDateTime } from "@/lib/format";
import type { SendResult } from "@/lib/api";
import type { ConversationThread } from "@/lib/types";

export function ThreadView({
    thread,
    otherName,
    send,
    reportBackHref,
}: {
    thread: ConversationThread;
    otherName: string;
    send: (body: string) => Promise<SendResult>;
    reportBackHref?: string;
}) {
    const { conversation, messages } = thread;

    return (
        <div className="space-y-4">
            <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
                <p className="font-semibold">{otherName}</p>
                {conversation.event_title && conversation.event_slug && (
                    <p className="text-[0.8125rem] text-brand-700">
                        Event:{" "}
                        <Link href={`/events/${conversation.event_slug}`} className="font-medium hover:underline">
                            {conversation.event_title}
                        </Link>
                    </p>
                )}
                {conversation.listing_title && (
                    <p className="text-[0.8125rem] text-brand-700">About: {conversation.listing_title}</p>
                )}
                <Link
                    href={`/business/${conversation.vendor_slug}`}
                    className="text-[0.8125rem] text-muted hover:text-brand-600 hover:underline"
                >
                    View {conversation.vendor_name}
                </Link>
            </div>

            <ol className="space-y-3">
                {messages.map((m) => (
                    <li key={m.message_id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
                        <div
                            className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${
                                m.mine ? "bg-brand-600 text-white" : "border border-line bg-surface"
                            }`}
                        >
                            <p className="whitespace-pre-wrap">{m.body}</p>
                            <p className={`mt-1 flex items-center gap-1 text-[0.6875rem] ${m.mine ? "text-brand-100" : "text-soft"}`}>
                                {formatDateTime(m.created_at)}
                                {m.mine && (m.read_at ? <CheckCheck className="size-3" aria-label="Read" /> : <Check className="size-3" aria-label="Sent" />)}
                                {!m.mine && reportBackHref && (
                                    <Link
                                        href={`/report?type=message&id=${m.message_id}&back=${encodeURIComponent(reportBackHref)}`}
                                        className="ml-2 inline-flex items-center gap-0.5 hover:text-error-ink"
                                    >
                                        <Flag className="size-3" /> Report
                                    </Link>
                                )}
                            </p>
                        </div>
                    </li>
                ))}
            </ol>

            {conversation.status === "open" ? (
                <MessageForm send={send} placeholder={`Reply to ${otherName}…`} />
            ) : (
                <p className="rounded-lg bg-shut-bg px-3 py-2 text-sm text-shut-ink">
                    This conversation has been closed and cannot receive new messages.
                </p>
            )}
        </div>
    );
}
