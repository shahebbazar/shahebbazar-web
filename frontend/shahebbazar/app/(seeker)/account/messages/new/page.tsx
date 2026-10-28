import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { AccountShell } from "@/components/customer/AccountShell";
import { MessageForm } from "@/components/customer/MessageForm";
import { Avatar } from "@/components/messaging/Avatar";
import { getBusiness } from "@/lib/api";
import { startConversation } from "../../../actions";

export const metadata: Metadata = {
    title: "New message",
};

export default async function NewMessagePage({
    searchParams,
}: {
    searchParams: Promise<{ vendor?: string; listing?: string }>;
}) {
    const { vendor, listing } = await searchParams;
    if (!vendor) notFound();
    const detail = await getBusiness(vendor);
    if (!detail) notFound();

    const item = detail.listings.find((l) => String(l.listing_id) === listing) ?? null;
    const { business } = detail;

    return (
        <AccountShell current="messages" title="New message">
            <Link
                href={`/business/${business.vendor_slug}`}
                className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"
            >
                <ChevronLeft className="size-4" /> Back to {business.vendor_name}
            </Link>
            <div className="mb-4 rounded-xl border border-line bg-surface p-4 shadow-card">
                <p className="text-sm text-muted">To</p>
                {/* The same picture as the conversation once it starts, and every logo spot: the logo, or else
                    the main category's picture (KAN-333). */}
                <div className="mt-1 flex items-center gap-3">
                    <Avatar name={business.vendor_name} photo={business.vendor_logo_url} business={{ categorySlug: detail.categories[0]?.slug ?? business.primary_category_slug }} />
                    <p className="font-semibold">{business.vendor_name}</p>
                </div>
                {item && <p className="mt-1 text-[0.8125rem] text-brand-700">About: {item.title}</p>}
                <p className="mt-2 text-xs text-soft">
                    The business is alerted in its dashboard, and by SMS if it has not read your message within a few minutes.
                </p>
            </div>
            <MessageForm
                send={startConversation.bind(null, business.vendor_id, item?.listing_id ?? null)}
                placeholder={item ? `Ask about ${item.title}…` : "Write your question…"}
                redirectTo="/account/messages"
            />
        </AccountShell>
    );
}
