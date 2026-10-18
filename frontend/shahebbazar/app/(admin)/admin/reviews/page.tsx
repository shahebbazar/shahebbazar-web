import type { Metadata } from "next";
import Link from "next/link";
import { Star } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { ActionButton } from "@/components/admin/ActionButton";
import { authenticatedApiGet } from "@/lib/auth-server";
import { formatDateTime } from "@/lib/format";
import type { AdminReview } from "@/lib/types";
import { setReviewStatus } from "../moderation-actions";

export const metadata: Metadata = {
    title: "Reviews",
};

export default async function AdminReviewsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
    const status = (await searchParams).status === "hidden" ? "hidden" : "published";
    const reviews = (await authenticatedApiGet<AdminReview[]>(`/admin/reviews?status=${status}`)) ?? [];

    return (
        <AdminShell current="reviews">
            <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">Reviews</h1>
            <p className="mt-1.5 text-[0.9375rem] text-muted">
                Hide fake or abusive reviews. Hidden reviews stop counting towards the business&apos;s rating.
            </p>

            <nav className="mt-4 flex gap-1 border-b border-line">
                {(["published", "hidden"] as const).map((tab) => (
                    <Link
                        key={tab}
                        href={tab === "published" ? "/admin/reviews" : "/admin/reviews?status=hidden"}
                        aria-current={tab === status ? "page" : undefined}
                        className={`border-b-2 px-3 py-2.5 text-sm font-medium capitalize ${
                            tab === status ? "border-brand-600 text-brand-600" : "border-transparent text-muted hover:text-ink"
                        }`}
                    >
                        {tab}
                    </Link>
                ))}
            </nav>

            {reviews.length === 0 ? (
                <p className="mt-4 text-sm text-muted">No {status} reviews.</p>
            ) : (
                <ul className="mt-4 space-y-3">
                    {reviews.map((review) => (
                        <li key={review.review_id} className="rounded-xl border border-line bg-surface p-4 shadow-card">
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                                <span className="font-semibold">{review.author}</span>
                                <span className="text-muted">on</span>
                                <Link href={`/business/${review.vendor_slug}#reviews`} target="_blank" className="font-medium text-brand-600 hover:underline">
                                    {review.vendor_name}
                                </Link>
                                <span className="text-xs text-soft">{formatDateTime(review.created_at)}</span>
                                {review.open_reports > 0 && (
                                    <span className="rounded-full bg-shut-bg px-2 py-0.5 text-[0.6875rem] font-semibold text-shut-ink">
                                        {review.open_reports} open report{review.open_reports > 1 ? "s" : ""}
                                    </span>
                                )}
                            </div>
                            <div className="mt-1 flex gap-0.5">
                                {[1, 2, 3, 4, 5].map((i) => (
                                    <Star key={i} className={`size-3.5 ${i <= review.rating ? "fill-star text-star" : "fill-slate-200 text-slate-200"}`} />
                                ))}
                            </div>
                            {review.body && <p className="mt-2 text-sm text-muted">{review.body}</p>}
                            <div className="mt-3">
                                {status === "published" ? (
                                    <ActionButton action={setReviewStatus.bind(null, review.review_id, "hidden")} label="Hide review" tone="danger" />
                                ) : (
                                    <ActionButton action={setReviewStatus.bind(null, review.review_id, "published")} label="Restore review" tone="primary" />
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </AdminShell>
    );
}
