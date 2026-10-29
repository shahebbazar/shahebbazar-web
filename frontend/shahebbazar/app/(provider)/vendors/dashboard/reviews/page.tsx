import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Star } from "lucide-react";
import { authenticatedApiGet, getViewer } from "@/lib/auth-server";
import { formatDateTime } from "@/lib/format";
import { ProviderShell, parseVendorParam, dashboardFor } from "@/components/provider/ProviderShell";
import { providerText } from "@/lib/i18n-provider";
import { getAccountLocale } from "@/lib/locale-server";
import { fill } from "@/lib/i18n";
import { localiseDigits } from "@/lib/format";
import type { OwnerReview, VendorSummary} from "@/lib/types";
import { ReplyForm } from "./ReplyForm";

export const metadata: Metadata = {
    title: "Reviews",
};

export default async function OwnerReviewsPage({ searchParams }: { searchParams: Promise<{ vendor?: string }> }) {
    const vendorId = parseVendorParam((await searchParams).vendor);
    if (vendorId === null) redirect(dashboardFor("/vendors/dashboard/reviews"));
    const [vendor, reviews, viewer] = await Promise.all([
        authenticatedApiGet<VendorSummary>(`/vendors/${vendorId}/summary`),
        authenticatedApiGet<OwnerReview[]>(`/vendors/${vendorId}/reviews`),
        getViewer(),
    ]);
    if (!vendor) notFound();
    const adminView = viewer?.user_role === "admin";

    const written = (reviews ?? []).filter((r) => r.body);
    const average = reviews && reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;

    const locale = await getAccountLocale();
    const copy = providerText(locale);
    return (
        <ProviderShell vendor={vendor} current="reviews">
            <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">{copy.navReviews}</h1>
            <p className="mt-1.5 text-[0.9375rem] text-muted">
                {fill(copy.reviewsIntro, {
                    ratings: localiseDigits(String(reviews?.length ?? 0), locale),
                    average: localiseDigits(average.toFixed(1), locale),
                    written: localiseDigits(String(written.length), locale),
                })}
            </p>

            {written.length === 0 ? (
                <p className="mt-5 text-sm text-muted">No written reviews yet.</p>
            ) : (
                <ul className="mt-5 space-y-3">
                    {written.map((review) => (
                        <li key={review.review_id} className="rounded-xl border border-line bg-surface p-4 shadow-card">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-semibold">{review.author}</span>
                                <span className="text-xs text-soft">
                                    {review.status === "pending" ? "Awaiting moderation · " : ""}
                                    {formatDateTime(review.created_at)}
                                </span>
                            </div>
                            <div className="mt-1 flex gap-0.5">
                                {[1, 2, 3, 4, 5].map((i) => (
                                    <Star
                                        key={i}
                                        className={`size-3.5 ${i <= review.rating ? "fill-star text-star" : "fill-slate-200 text-slate-200"}`}
                                    />
                                ))}
                            </div>
                            <p className="mt-2 text-sm text-muted">{review.body}</p>
                            {/* Replies are written as the business, so admins see them but cannot write one. */}
                            {adminView ? (
                                review.reply && (
                                    <p className="mt-3 border-l-2 border-line pl-3 text-sm text-muted">
                                        <span className="font-medium text-ink">Owner&apos;s reply: </span>
                                        {review.reply}
                                    </p>
                                )
                            ) : (
                                <ReplyForm vendorId={vendorId} reviewId={review.review_id} initial={review.reply} />
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </ProviderShell>
    );
}
