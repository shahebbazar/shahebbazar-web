import Link from "next/link";
import {
    Award,
    BadgeCheck,
    Building2,
    Flag,
    CalendarDays,
    ExternalLink,
    Images,
    MapPin,
    MessageSquare,
    MessageSquareText,
    Navigation,
    Phone,
    Star,
} from "lucide-react";
import { SiFacebook, SiInstagram, SiTiktok, SiYoutube } from "@icons-pack/react-simple-icons";
import { assetUrl } from "@/lib/api";
import { t, pick, localeHref, type Locale } from "@/lib/i18n";
import { SITE_URL } from "@/lib/seo";
import { formatClockTime, formatRating, localiseDigits, toNumber } from "@/lib/format";
import type { BusinessDetail, SocialPlatform } from "@/lib/types";
import { SaveButton } from "@/components/customer/SaveButton";
import { ShareMenu } from "@/components/shared/ShareMenu";
import { ReviewForm } from "@/components/customer/ReviewForm";

// Brand marks come from Simple Icons; lucide excludes logos.
const SOCIAL = {
    facebook: { Icon: SiFacebook, label: "Facebook" },
    instagram: { Icon: SiInstagram, label: "Instagram" },
    youtube: { Icon: SiYoutube, label: "YouTube" },
    tiktok: { Icon: SiTiktok, label: "TikTok" },
} satisfies Record<SocialPlatform, unknown>;

// Business profile content column.
export function BusinessProfile({
    locale,
    detail,
}: {
    locale: Locale;
    detail: BusinessDetail;
}) {
    const copy = t(locale);
    const { business, categories, photos, listings, facts, reviews, ratingDistribution } = detail;

    const name = pick(locale, business.vendor_name, business.vendor_name_bn);
    const cover = assetUrl(business.vendor_cover_url);
    const aboutFacts = facts.filter((f) => f.group === "about");
    // Older API responses have no social field.
    const social = detail.social ?? [];
    const reviewCount = toNumber(business.review_count);
    const closes = formatClockTime(business.close_time_today);

    const sections = [
        { id: "overview", label: copy.overview },
        { id: "services", label: copy.services },
        { id: "reviews", label: copy.tabReviews },
        { id: "photos", label: copy.photos },
    ];

    return (
        <div className="min-w-0 space-y-5">
            {/* ---------------------------------------------- header ---- */}
            <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
                <div className="relative h-[200px] bg-gradient-to-br from-brand-100 to-brand-200 sm:h-[260px]">
                    {cover && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={cover}
                            alt={`${name} — cover photograph`}
                            className="size-full object-cover"
                        />
                    )}

                    {photos.length > 0 && (
                        <a
                            href="#photos"
                            className="absolute right-3 bottom-3 inline-flex items-center gap-2 rounded-lg bg-black/60 px-3 py-1.5 text-[0.8125rem] font-medium text-white backdrop-blur transition-colors hover:bg-black/75"
                        >
                            <Images className="size-4" />
                            {copy.seeAllPhotos} ({localiseDigits(String(photos.length), locale)})
                        </a>
                    )}
                </div>

                <div className="px-5 pb-5 sm:px-6">
                    <div className="relative z-10 -mt-10 flex items-end gap-4 sm:-mt-12">
                        <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-full border-4 border-surface bg-brand-50 sm:size-24">
                            {business.vendor_logo_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={assetUrl(business.vendor_logo_url) ?? ""}
                                    alt=""
                                    className="size-full object-cover"
                                />
                            ) : (
                                <span className="text-2xl font-bold text-brand-600">
                                    {name.charAt(0).toUpperCase()}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight">
                                {name}
                                {business.is_verified && (
                                    <BadgeCheck
                                        className="size-5 shrink-0 fill-brand-600 text-white"
                                        aria-label={copy.verified}
                                    />
                                )}
                            </h1>

                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.875rem]">
                                <span className="flex items-center gap-1 font-medium">
                                    <Star className="size-4 fill-star text-star" />
                                    {localiseDigits(formatRating(business.rating), locale)}
                                    <span className="font-normal text-muted">
                                        ({localiseDigits(String(reviewCount), locale)} {copy.reviews})
                                    </span>
                                </span>

                                {business.open_state && (
                                    <span
                                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ${business.open_state === "open"
                                                ? "bg-open-bg text-open-ink"
                                                : "bg-shut-bg text-shut-ink"
                                            }`}
                                    >
                                        {business.open_state === "open" ? copy.open : copy.closed}
                                    </span>
                                )}

                                {business.open_state === "open" && closes && (
                                    <span className="text-muted">
                                        {copy.closesAt} {closes}
                                    </span>
                                )}
                            </div>

                            {categories.length > 0 && (
                                <p className="mt-2 text-[0.875rem] text-muted">
                                    {categories
                                        .map((c) => pick(locale, c.name, c.name_bn))
                                        .join(" • ")}
                                </p>
                            )}

                            {business.vendor_address && (
                                <p className="mt-2 flex items-start gap-1.5 text-[0.875rem] text-muted">
                                    <MapPin className="mt-0.5 size-4 shrink-0" />
                                    {business.vendor_address}
                                </p>
                            )}
                        </div>

                        <ActionButtons locale={locale} detail={detail} />
                    </div>
                </div>

                {/* In-page anchors rather than tab panels. */}
                <nav
                    aria-label="Sections"
                    className="no-scrollbar flex gap-1 overflow-x-auto border-t border-line px-5 sm:px-6"
                >
                    {sections.map((section, index) => (
                        <a
                            key={section.id}
                            href={`#${section.id}`}
                            className={`shrink-0 border-b-2 px-3 py-3 text-[0.875rem] font-medium transition-colors ${index === 0
                                    ? "border-brand-600 text-brand-600"
                                    : "border-transparent text-muted hover:text-ink"
                                }`}
                        >
                            {section.label}
                        </a>
                    ))}
                </nav>
            </section>

            {/* -------------------------------------------- overview ---- */}
            <section
                id="overview"
                className="scroll-mt-20 rounded-xl border border-line bg-surface p-5 shadow-card sm:p-6"
                aria-labelledby="overview-heading"
            >
                <h2 id="overview-heading" className="text-[1.0625rem] font-semibold tracking-tight">
                    {copy.aboutHeading} {name}
                </h2>

                <div className="mt-3 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
                    <p className="text-[0.875rem] leading-relaxed text-muted">
                        {business.vendor_description}
                    </p>

                    {(aboutFacts.length > 0 || business.vendor_website || social.length > 0) && (
                        <dl className="space-y-2.5">
                            {aboutFacts.map((fact) => (
                                <div
                                    key={fact.label}
                                    className="flex items-baseline justify-between gap-4 text-[0.875rem]"
                                >
                                    <dt className="flex items-center gap-2 text-muted">
                                        <FactIcon name={fact.icon} />
                                        {fact.label}
                                    </dt>
                                    <dd className="text-right font-medium">
                                        {localiseDigits(fact.value, locale)}
                                    </dd>
                                </div>
                            ))}

                            {business.vendor_website && (
                                <div className="flex items-baseline justify-between gap-4 text-[0.875rem]">
                                    <dt className="flex items-center gap-2 text-muted">
                                        <ExternalLink className="size-4" />
                                        {copy.website}
                                    </dt>
                                    <dd className="text-right">
                                        <a
                                            href={`https://${business.vendor_website.replace(/^https?:\/\//, "")}`}
                                            target="_blank"
                                            rel="noopener noreferrer nofollow"
                                            className="font-medium text-brand-600 hover:underline"
                                        >
                                            {business.vendor_website}
                                        </a>
                                    </dd>
                                </div>
                            )}

                            {social.length > 0 && (
                                <div className="flex items-center justify-between gap-4 text-[0.875rem]">
                                    <dt className="text-muted">{copy.follow}</dt>
                                    <dd className="flex gap-2">
                                        {social.map((link) => {
                                            const { Icon, label } = SOCIAL[link.platform];
                                            return (
                                                <a
                                                    key={link.platform}
                                                    href={link.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer nofollow"
                                                    aria-label={`${name} on ${label}`}
                                                    title={label}
                                                    className="grid size-8 place-items-center rounded-full bg-brand-600 text-white transition-opacity hover:opacity-85"
                                                >
                                                    <Icon size={15} />
                                                </a>
                                            );
                                        })}
                                    </dd>
                                </div>
                            )}
                        </dl>
                    )}
                </div>
            </section>

            {/* -------------------------------------------- services ---- */}
            <section
                id="services"
                className="scroll-mt-20 rounded-xl border border-line bg-surface p-5 shadow-card sm:p-6"
                aria-labelledby="services-heading"
            >
                <h2 id="services-heading" className="text-[1.0625rem] font-semibold tracking-tight">
                    {copy.servicesHeading}
                </h2>

                {listings.length === 0 ? (
                    <p className="mt-4 text-[0.875rem] text-muted">{copy.noServices}</p>
                ) : (
                    <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {listings.map((item) => {
                            const price = toNumber(item.price);
                            const priceMax = toNumber(item.price_max);
                            const minOrder = item.min_order_qty ?? 0;
                            const photo = assetUrl(item.photo_url);

                            return (
                                <li
                                    key={item.listing_id}
                                    className="overflow-hidden rounded-xl border border-line transition-colors hover:border-brand-200 hover:bg-brand-50"
                                >
                                    {photo && (
                                        <div className="aspect-4/3 overflow-hidden bg-brand-50">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={photo}
                                                alt={pick(locale, item.title, item.title_bn)}
                                                loading="lazy"
                                                className="size-full object-cover"
                                            />
                                        </div>
                                    )}

                                    <div className="p-3.5">
                                        <h3 className="text-[0.875rem] font-semibold">
                                            {pick(locale, item.title, item.title_bn)}
                                        </h3>

                                        {item.description && (
                                            <p className="mt-1 line-clamp-2 text-[0.8125rem] leading-snug text-muted">
                                                {item.description}
                                            </p>
                                        )}

                                        <p className="mt-2 text-[0.8125rem] font-medium text-brand-700">
                                            {price > 0 ? (
                                                <>
                                                    {formatTaka(price, locale)}
                                                    {priceMax > price && (
                                                        <> – {formatTaka(priceMax, locale)}</>
                                                    )}
                                                    {item.unit && (
                                                        <span className="font-normal text-muted">
                                                            {" "}/ {item.unit}
                                                        </span>
                                                    )}
                                                </>
                                            ) : (
                                                <span className="font-normal text-muted">
                                                    {copy.priceOnRequest}
                                                </span>
                                            )}
                                        </p>

                                        {minOrder > 0 && (
                                            <p className="mt-1 text-[0.75rem] text-muted">
                                                {copy.minOrder}: {" "}
                                                {localiseDigits(
                                                    minOrder.toLocaleString("en-US"),
                                                    locale
                                                )}
                                                {item.unit ? ` ${item.unit}` : ""}
                                            </p>
                                        )}

                                        <Link
                                            href={`/account/messages/new?vendor=${business.vendor_slug}&listing=${item.listing_id}`}
                                            className="mt-2.5 inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-brand-600 hover:underline"
                                        >
                                            <MessageSquareText className="size-3.5" />
                                            {copy.askAboutThis}
                                        </Link>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>

            {/* --------------------------------------------- reviews ---- */}
            <section
                id="reviews"
                className="scroll-mt-20 rounded-xl border border-line bg-surface p-5 shadow-card sm:p-6"
                aria-labelledby="reviews-heading"
            >
                <h2 id="reviews-heading" className="text-[1.0625rem] font-semibold tracking-tight">
                    {copy.ratingsReviews}
                </h2>

                <div className="mt-4 grid gap-8 lg:grid-cols-[260px_1fr]">
                    <div>
                        <div className="text-center">
                            <p className="text-[3rem] leading-none font-bold">
                                {localiseDigits(formatRating(business.rating), locale)}
                            </p>
                            <div className="mt-2 flex justify-center gap-0.5">
                                {[1, 2, 3, 4, 5].map((i) => (
                                    <Star
                                        key={i}
                                        className={`size-4 ${i <= Math.round(toNumber(business.rating))
                                                ? "fill-star text-star"
                                                : "fill-slate-200 text-slate-200"
                                            }`}
                                    />
                                ))}
                            </div>
                            <p className="mt-1.5 text-[0.8125rem] text-muted">
                                {localiseDigits(String(reviewCount), locale)} {copy.totalReviews}
                            </p>
                        </div>

                        <ul className="mt-4 space-y-1.5">
                            {ratingDistribution.map((row) => {
                                const pct = reviewCount ? (row.count / reviewCount) * 100 : 0;
                                return (
                                    <li key={row.rating} className="flex items-center gap-2">
                                        <span className="flex w-6 shrink-0 items-center gap-0.5 text-[0.75rem] text-muted">
                                            {localiseDigits(String(row.rating), locale)}
                                            <Star className="size-2.5 fill-star text-star" />
                                        </span>
                                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                                            <span
                                                className="block h-full rounded-full bg-brand-500"
                                                style={{ width: `${pct}%` }}
                                            />
                                        </span>
                                        <span className="w-6 shrink-0 text-right text-[0.75rem] text-muted">
                                            {localiseDigits(String(row.count), locale)}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>

                        <ReviewForm
                            slug={business.vendor_slug}
                            copy={{
                                writeReview: copy.writeReview,
                                updateReview: copy.updateReview,
                                yourRating: copy.yourRating,
                                reviewPlaceholder: copy.reviewPlaceholder,
                                submitReview: copy.submitReview,
                                reviewSaved: copy.reviewSaved,
                                cancel: copy.cancel,
                            }}
                        />
                    </div>

                    <div>
                        <h3 className="text-[0.9375rem] font-semibold">{copy.whatPeopleSay}</h3>
                        {reviews.length === 0 ? (
                            <p className="mt-3 text-[0.875rem] text-muted">{copy.noReviews}</p>
                        ) : (
                            <ul className="mt-3 space-y-4">
                                {reviews.map((review) => (
                                    <li
                                        key={review.review_id}
                                        className="rounded-xl border border-line p-4"
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-100 text-[0.8125rem] font-semibold text-brand-700">
                                                {review.author.charAt(0).toUpperCase()}
                                            </span>
                                            <span className="min-w-0">
                                                <span className="flex items-center gap-1.5 text-[0.875rem] font-semibold">
                                                    {review.author}
                                                    {review.author_verified && (
                                                        <BadgeCheck className="size-3.5 shrink-0 fill-brand-600 text-white" />
                                                    )}
                                                </span>
                                                <span className="block text-[0.75rem] text-soft">
                                                    {relativeTime(review.created_at)}
                                                </span>
                                            </span>
                                            <span className="ml-auto flex shrink-0 gap-0.5">
                                                {[1, 2, 3, 4, 5].map((i) => (
                                                    <Star
                                                        key={i}
                                                        className={`size-3.5 ${i <= review.rating
                                                                ? "fill-star text-star"
                                                                : "fill-slate-200 text-slate-200"
                                                            }`}
                                                    />
                                                ))}
                                            </span>
                                        </div>
                                        <p className="mt-2.5 text-[0.875rem] leading-relaxed text-muted">
                                            {review.body}
                                        </p>
                                        {review.reply && (
                                            <div className="mt-3 rounded-lg border-l-2 border-brand-500 bg-surface-2 px-3 py-2">
                                                <p className="text-[0.75rem] font-semibold text-brand-700">
                                                    {copy.ownerReply}
                                                </p>
                                                <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted">
                                                    {review.reply}
                                                </p>
                                            </div>
                                        )}
                                        <Link
                                            href={`/report?type=review&id=${review.review_id}&back=${business.vendor_slug}`}
                                            className="mt-2 inline-flex items-center gap-1 text-[0.75rem] text-soft hover:text-error-ink"
                                        >
                                            <Flag className="size-3" />
                                            {copy.report}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            </section>

            {/* ---------------------------------------------- photos ---- */}
            {photos.length > 0 && (
                <section
                    id="photos"
                    className="scroll-mt-20 rounded-xl border border-line bg-surface p-5 shadow-card sm:p-6"
                    aria-labelledby="photos-heading"
                >
                    <h2
                        id="photos-heading"
                        className="text-[1.0625rem] font-semibold tracking-tight"
                    >
                        {copy.photos}
                    </h2>
                    <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                        {photos.map((photo, index) => (
                            <li
                                key={`${photo.url}-${index}`}
                                className="aspect-4/3 overflow-hidden rounded-lg bg-brand-50"
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={assetUrl(photo.url) ?? ""}
                                    alt={photo.alt ?? ""}
                                    loading="lazy"
                                    className="size-full object-cover"
                                />
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
}

function formatTaka(value: number, locale: Locale): string {
    return `৳${localiseDigits(value.toLocaleString("en-US"), locale)}`;
}

function ActionButtons({ locale, detail }: { locale: Locale; detail: BusinessDetail }) {
    const copy = t(locale);
    const { business } = detail;
    const lat = business.vendor_lat;
    const lng = business.vendor_lng;

    const directionsUrl =
        lat && lng
            ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                `${business.vendor_name} ${business.vendor_address ?? "Rajshahi"}`
            )}`;

    const pageUrl = `${SITE_URL}${localeHref(`/business/${business.vendor_slug}`, locale)}`;

    return (
        <div className="grid shrink-0 grid-cols-2 gap-2 lg:w-[260px]">
            <a
                href={`tel:${business.vendor_phone}`}
                className="col-span-2 inline-flex items-center justify-center gap-2 rounded-[10px] bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
            >
                <Phone className="size-4" />
                {copy.call}
            </a>

            <Link
                href={`/account/messages/new?vendor=${business.vendor_slug}`}
                className="col-span-2 inline-flex items-center justify-center gap-2 rounded-[10px] border border-line-strong bg-surface px-4 py-2.5 text-sm font-medium text-brand-600 transition-colors hover:border-brand-600 hover:bg-brand-50"
            >
                <MessageSquare className="size-4" />
                {copy.message}
            </Link>

            <a
                href={directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="col-span-2 inline-flex items-center justify-center gap-2 rounded-[10px] border border-line-strong bg-surface px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-brand-600 hover:text-brand-600"
            >
                <Navigation className="size-4" />
                {copy.getDirections}
            </a>

            <SaveButton vendorId={business.vendor_id} label={copy.save} savedLabel={copy.saved} />

            <ShareMenu
                url={pageUrl}
                title={pick(locale, business.vendor_name, business.vendor_name_bn)}
                label={copy.share}
                locale={locale}
            />

            <Link
                href={`/report?type=vendor&id=${business.vendor_id}&back=${business.vendor_slug}`}
                className="col-span-2 inline-flex items-center justify-center gap-1.5 py-1 text-[0.75rem] text-soft hover:text-error-ink"
            >
                <Flag className="size-3" />
                {copy.reportBusiness}
            </Link>
        </div>
    );
}

function FactIcon({ name }: { name: string | null }) {
    const map: Record<string, typeof Award> = {
        calendar: CalendarDays,
        badge: Award,
        building: Building2,
    };
    const Icon = (name && map[name]) || Award;
    return <Icon className="size-4" />;
}

/** Formats a timestamp as a relative description, evaluated on the server. */
function relativeTime(iso: string): string {
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    if (days < 1) return "today";
    if (days === 1) return "yesterday";
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} week${days < 14 ? "" : "s"} ago`;
    if (days < 365) return `${Math.floor(days / 30)} month${days < 60 ? "" : "s"} ago`;
    return `${Math.floor(days / 365)} year${days < 730 ? "" : "s"} ago`;
}
