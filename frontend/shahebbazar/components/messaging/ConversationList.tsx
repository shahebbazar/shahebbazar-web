import Link from "next/link";
import { formatDateTime } from "@/lib/format";
import type { ConversationSummary } from "@/lib/types";
import { Avatar } from "./Avatar";

export function ConversationList({
    conversations,
    hrefFor,
    show,
    empty,
}: {
    conversations: ConversationSummary[];
    hrefFor: (id: number) => string;
    show: "business" | "customer";
    empty: string;
}) {
    if (conversations.length === 0) return <p className="text-sm text-muted">{empty}</p>;

    return (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-card">
            {conversations.map((c) => (
                <li key={c.conversation_id}>
                    <Link href={hrefFor(c.conversation_id)} className="flex gap-3 px-4 py-3 hover:bg-surface-2">
                        <Avatar
                            name={show === "business" ? c.vendor_name : c.customer_name}
                            photo={show === "business" ? c.vendor_logo : c.customer_avatar}
                            business={show === "business" ? { categorySlug: c.vendor_category_slug } : undefined}
                        />
                        <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                                <span className={`truncate text-sm ${c.unread > 0 ? "font-bold" : "font-semibold"}`}>
                                    {show === "business" ? c.vendor_name : c.customer_name}
                                </span>
                                {c.last_message_at && (
                                    <span className="shrink-0 text-xs text-soft">{formatDateTime(c.last_message_at)}</span>
                                )}
                            </span>
                            {c.event_title && (
                                <span className="block truncate text-xs font-medium text-brand-700">Event: {c.event_title}</span>
                            )}
                            {c.listing_title && (
                                <span className="block truncate text-xs font-medium text-brand-700">About: {c.listing_title}</span>
                            )}
                            <span className="flex items-center gap-2">
                                <span className={`truncate text-[0.8125rem] ${c.unread > 0 ? "text-ink" : "text-muted"}`}>
                                    {c.last_message}
                                </span>
                                {c.unread > 0 && (
                                    <span className="ml-auto shrink-0 rounded-full bg-brand-600 px-2 py-0.5 text-[0.6875rem] font-semibold text-white">
                                        {c.unread}
                                    </span>
                                )}
                                {c.status !== "open" && (
                                    <span className="ml-auto shrink-0 rounded-full bg-shut-bg px-2 py-0.5 text-[0.6875rem] font-semibold text-shut-ink">
                                        Closed
                                    </span>
                                )}
                            </span>
                        </span>
                    </Link>
                </li>
            ))}
        </ul>
    );
}
