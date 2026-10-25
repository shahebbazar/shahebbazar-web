import Link from "next/link";
import {
    ChevronRight,
    Eye,
    ExternalLink,
    MapPin,
    Minus,
    Package,
    Plus,
    Search,
    Star,
    TrendingDown,
    TrendingUp,
    Wallet,
    type LucideIcon,
} from "lucide-react";
import { assetUrl } from "@/lib/api";
import { formatClockTime, toNumber, formatPhone } from "@/lib/format";
import type { PeriodCount, VendorDashboard } from "@/lib/types";
import { providerHref } from "./ProviderShell";
import { StatusBadge } from "./StatusBadge";

/** Panels of the provider dashboard. Server components; no interactivity. */

const fmt = (n: number) => n.toLocaleString("en-US");

const joinedFormat = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Dhaka",
});

export function Panel({
    title,
    action,
    id,
    className = "",
    children,
}: {
    title: string;
    action?: React.ReactNode;
    id?: string;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <section
            id={id}
            aria-labelledby={id ? `${id}-heading` : undefined}
            className={`scroll-mt-24 rounded-xl border border-line bg-surface p-5 shadow-card ${className}`}
        >
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id={id ? `${id}-heading` : undefined} className="text-[1.0625rem] font-semibold tracking-tight">
                    {title}
                </h2>
                {action}
            </div>
            <div className="mt-4">{children}</div>
        </section>
    );
}

// Change against the previous period

// "+18%", "−5%", "No change", "New" or nothing.
export function Change({ count }: { count: PeriodCount }) {
    const { current, previous } = count;

    if (previous === 0) {
        return current > 0 ? (
            <span className="inline-flex items-center gap-1 font-semibold text-success-ink">
                <TrendingUp className="size-3.5" /> New
            </span>
        ) : (
            <span className="text-muted">No data yet</span>
        );
    }

    const pct = Math.round(((current - previous) / previous) * 100);

    if (pct === 0) {
        return (
            <span className="inline-flex items-center gap-1 font-semibold text-muted">
                <Minus className="size-3.5" /> No change
            </span>
        );
    }

    const up = pct > 0;
    const Arrow = up ? TrendingUp : TrendingDown;
    return (
        <span
            className={`inline-flex items-center gap-1 font-semibold ${up ? "text-success-ink" : "text-error-ink"}`}
        >
            <Arrow className="size-3.5" />
            {up ? "+" : "−"}
            {Math.abs(pct)}%
        </span>
    );
}

// Stat cards

function StatCard({
    Icon,
    tint,
    value,
    label,
    footer,
}: {
    Icon: LucideIcon;
    tint: string;
    value: string;
    label: string;
    footer: React.ReactNode;
}) {
    return (
        <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
            <div className="flex items-center gap-4">
                <span className={`grid size-12 shrink-0 place-items-center rounded-full ${tint}`}>
                    <Icon className="size-5" strokeWidth={1.9} />
                </span>
                <div className="min-w-0">
                    <p className="text-[1.625rem] leading-tight font-bold tracking-tight tabular-nums">{value}</p>
                    <p className="text-[0.8125rem] text-muted">{label}</p>
                </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem]">{footer}</div>
        </div>
    );
}

export function StatCards({ data }: { data: VendorDashboard }) {
    const { stats, days } = data;
    // "vs previous N days" only when there is something to compare.
    const period = (count: PeriodCount) =>
        count.current > 0 || count.previous > 0 ? (
            <span className="text-muted">vs previous {days} days</span>
        ) : null;
    const rating = stats.rating.average;

    return (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
                Icon={Eye}
                tint="bg-brand-50 text-brand-600"
                value={fmt(stats.profileViews.current)}
                label="Profile Views"
                footer={
                    <>
                        <Change count={stats.profileViews} /> {period(stats.profileViews)}
                    </>
                }
            />
            <StatCard
                Icon={Search}
                tint="bg-brand-50 text-brand-600"
                value={fmt(stats.searchAppearances.current)}
                label="Search Appearances"
                footer={
                    <>
                        <Change count={stats.searchAppearances} /> {period(stats.searchAppearances)}
                    </>
                }
            />
            <StatCard
                Icon={Package}
                tint="bg-open-bg text-open-ink"
                value={fmt(stats.listings.active)}
                label="Active Listings"
                footer={
                    <>
                        <span className="font-semibold text-ink">+{fmt(stats.listings.addedInPeriod)}</span>
                        <span className="text-muted">in the last {days} days</span>
                        {stats.listings.pending > 0 && (
                            <span className="text-sponsor-ink">· {fmt(stats.listings.pending)} awaiting approval</span>
                        )}
                    </>
                }
            />
            <StatCard
                Icon={Star}
                tint="bg-sponsor-bg text-star"
                value={rating === null ? "—" : rating.toFixed(1)}
                label="Average Rating"
                footer={
                    rating === null ? (
                        <span className="text-muted">No reviews yet</span>
                    ) : (
                        <>
                            <Stars rating={rating} />
                            <span className="text-muted">
                                ({fmt(stats.rating.count)} {stats.rating.count === 1 ? "review" : "reviews"})
                            </span>
                        </>
                    )
                }
            />
        </div>
    );
}

/** Five stars, filled to the nearest half; the number is always shown beside it. */
function Stars({ rating }: { rating: number }) {
    const halves = Math.round(rating * 2);
    return (
        <span className="inline-flex items-center gap-0.5" aria-hidden>
            {[1, 2, 3, 4, 5].map((i) => {
                const fill = halves >= i * 2 ? "full" : halves === i * 2 - 1 ? "half" : "none";
                return (
                    <span key={i} className="relative inline-block size-3.5">
                        <Star className="absolute inset-0 size-3.5 text-line-strong" fill="currentColor" strokeWidth={0} />
                        {fill !== "none" && (
                            <span
                                className="absolute inset-y-0 left-0 overflow-hidden"
                                style={{ width: fill === "full" ? "100%" : "50%" }}
                            >
                                <Star className="size-3.5 text-star" fill="currentColor" strokeWidth={0} />
                            </span>
                        )}
                    </span>
                );
            })}
        </span>
    );
}

// Business preview

export function BusinessPreview({ data }: { data: VendorDashboard }) {
    const { vendor, stats } = data;
    const cover = assetUrl(vendor.vendor_cover_url);
    const isLive = vendor.vendor_status === "approved";
    const closes = formatClockTime(vendor.close_time_today);

    return (
        <Panel
            title="My Business Preview"
            action={
                isLive ? (
                    <Link
                        href={`/business/${vendor.vendor_slug}`}
                        className="inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-brand-600 hover:underline"
                    >
                        View Public Profile <ExternalLink className="size-3.5" />
                    </Link>
                ) : undefined
            }
        >
            <div className="flex flex-col gap-5 sm:flex-row">
                <div className="aspect-[4/3] w-full shrink-0 overflow-hidden rounded-lg bg-surface-2 sm:w-56">
                    {cover ? (
                        // A plain <img>: the asset host differs per environment and next/image needs it declared at build time.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cover} alt="" className="size-full object-cover" />
                    ) : (
                        <div className="grid size-full place-items-center bg-gradient-to-br from-brand-100 to-brand-200">
                            <span className="text-4xl font-bold text-brand-600 opacity-70">
                                {vendor.vendor_name.trim().charAt(0).toUpperCase() || "?"}
                            </span>
                        </div>
                    )}
                </div>

                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[1.25rem] leading-tight font-semibold tracking-tight">
                            {vendor.vendor_name}
                        </h3>
                        {isLive && vendor.is_verified ? (
                            <span className="rounded-full bg-open-bg px-2 py-0.5 text-[0.6875rem] font-semibold text-open-ink">
                                Verified
                            </span>
                        ) : (
                            <StatusBadge status={vendor.vendor_status} />
                        )}
                    </div>

                    {vendor.primary_category && (
                        <p className="mt-1 text-[0.875rem] text-muted">{vendor.primary_category}</p>
                    )}
                    {vendor.area_name && (
                        <p className="mt-2 flex items-center gap-1.5 text-[0.875rem] text-muted">
                            <MapPin className="size-4 shrink-0" /> {vendor.area_name}, Rajshahi
                        </p>
                    )}
                    {stats.rating.average !== null && (
                        <p className="mt-2 flex items-center gap-2 text-[0.875rem]">
                            <span className="font-semibold">{stats.rating.average.toFixed(1)}</span>
                            <Stars rating={stats.rating.average} />
                            <span className="text-muted">({fmt(stats.rating.count)} reviews)</span>
                        </p>
                    )}
                    {vendor.open_state && (
                        <p className="mt-2 flex items-center gap-2 text-[0.8125rem]">
                            <span
                                className={`rounded-full px-2 py-0.5 font-semibold ${
                                    vendor.open_state === "open"
                                        ? "bg-open-bg text-open-ink"
                                        : "bg-shut-bg text-shut-ink"
                                }`}
                            >
                                {vendor.open_state === "open" ? "Open" : "Closed"}
                            </span>
                            {vendor.open_state === "open" && closes && (
                                <span className="text-muted">Closes {closes}</span>
                            )}
                        </p>
                    )}
                </div>
            </div>

            {vendor.vendor_description && (
                <div className="mt-5">
                    <h3 className="text-[0.8125rem] font-semibold">Short Description</h3>
                    <p className="mt-1 line-clamp-3 text-[0.875rem] leading-relaxed text-muted">
                        {vendor.vendor_description}
                    </p>
                </div>
            )}

            <dl className="mt-5 grid gap-4 border-t border-line pt-4 text-[0.8125rem] sm:grid-cols-3">
                <div className="min-w-0">
                    <dt className="text-muted">Phone</dt>
                    <dd className="mt-0.5 truncate font-medium">{formatPhone(vendor.vendor_phone)}</dd>
                </div>
                <div className="min-w-0">
                    <dt className="text-muted">Email</dt>
                    <dd className="mt-0.5 truncate font-medium">{vendor.vendor_email ?? "Not added"}</dd>
                </div>
                <div className="min-w-0">
                    <dt className="text-muted">Joined</dt>
                    <dd className="mt-0.5 font-medium">
                        {joinedFormat.format(new Date(vendor.vendor_created_at))}
                    </dd>
                </div>
            </dl>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Link
                    href={providerHref("/vendors/dashboard/business", vendor.vendor_id)}
                    className="inline-flex items-center justify-center rounded-[10px] bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
                >
                    Edit Business
                </Link>
                {isLive ? (
                    <Link
                        href={`/business/${vendor.vendor_slug}`}
                        className="inline-flex items-center justify-center rounded-[10px] border border-line-strong bg-surface px-4 py-2.5 text-sm font-medium text-brand-600 hover:border-brand-600 hover:bg-brand-50"
                    >
                        View Public Profile
                    </Link>
                ) : (
                    <span className="inline-flex items-center justify-center rounded-[10px] border border-line bg-surface-2 px-4 py-2.5 text-center text-sm text-muted">
                        Public profile appears once approved
                    </span>
                )}
            </div>
        </Panel>
    );
}

// Products & services

type ListingRow = VendorDashboard["listings"][number];

/** "৳2,800 – ৳4,200 / maund", or "Price on request" when no price is set. */
export function listingPrice(listing: Pick<ListingRow, "listing_price" | "listing_price_max" | "listing_price_unit">): string {
    if (listing.listing_price === null) return "Price on request";
    const price = toNumber(listing.listing_price);
    const max = listing.listing_price_max === null ? null : toNumber(listing.listing_price_max);
    const unit = listing.listing_price_unit ? ` / ${listing.listing_price_unit}` : "";
    const taka = (n: number) => `৳${n.toLocaleString("en-US")}`;
    return max !== null && max > price ? `${taka(price)} – ${taka(max)}${unit}` : `${taka(price)}${unit}`;
}

export function ListingsPreview({ data }: { data: VendorDashboard }) {
    const id = data.vendor.vendor_id;
    const manage = providerHref("/vendors/dashboard/listings", id);

    return (
        <Panel
            title="Products & Services"
            action={
                data.stats.listings.total > 0 ? (
                    <Link href={manage} className="text-[0.8125rem] font-medium text-brand-600 hover:underline">
                        Manage All
                    </Link>
                ) : undefined
            }
        >
            {data.listings.length === 0 ? (
                <p className="text-[0.875rem] text-muted">
                    Nothing listed yet. Add the products or services customers can ask you about.
                </p>
            ) : (
                <ul className="divide-y divide-line">
                    {data.listings.map((listing) => {
                        const photo = assetUrl(listing.photo_url);
                        return (
                            <li key={listing.listing_id} className="flex items-center gap-3 py-3 first:pt-0">
                                <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-brand-50 text-brand-600">
                                    {photo ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={photo} alt="" className="size-full object-cover" />
                                    ) : (
                                        <Package className="size-5" strokeWidth={1.75} />
                                    )}
                                </span>
                                {/* Price moves under the name on narrow screens, so neither is truncated to a few letters. */}
                                <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-[0.875rem] font-medium">{listing.listing_title}</p>
                                        <p className="truncate text-[0.75rem] text-muted">
                                            {listing.category_name ?? "Uncategorised"}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 sm:block sm:shrink-0 sm:text-right">
                                        <p className="text-[0.8125rem] font-medium">{listingPrice(listing)}</p>
                                        <div className="sm:mt-0.5">
                                            <StatusBadge status={listing.listing_status} />
                                        </div>
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            <Link
                href={providerHref("/vendors/dashboard/listings", id, "add")}
                className="mt-4 flex items-center justify-center gap-2 rounded-[10px] border border-line-strong px-4 py-2.5 text-sm font-medium text-brand-600 hover:border-brand-600 hover:bg-brand-50"
            >
                <Plus className="size-4" /> Add New Service
            </Link>
        </Panel>
    );
}

// Quick actions

export function QuickActions({ data }: { data: VendorDashboard }) {
    const { vendor } = data;
    const id = vendor.vendor_id;
    const isLive = vendor.vendor_status === "approved";

    const actions: {
        Icon: LucideIcon;
        title: string;
        body: string;
        href?: string;
        soon?: boolean;
    }[] = [
        {
            Icon: Plus,
            title: "Add New Service",
            body: "List a new service or product",
            href: providerHref("/vendors/dashboard/listings", id, "add"),
        },
        {
            Icon: Wallet,
            title: "Payment Methods",
            body: "Show customers how they can pay",
            href: providerHref("/vendors/dashboard/payment-methods", id),
        },
        {
            Icon: ExternalLink,
            title: "View Public Profile",
            body: isLive ? "See your page as customers do" : "Available once your business is approved",
            href: isLive ? `/business/${vendor.vendor_slug}` : undefined,
        },
        {
            Icon: Star,
            title: "View & Reply Reviews",
            body: "Engage with your customers",
            href: providerHref("/vendors/dashboard/reviews", id),
        },
    ];

    return (
        <Panel title="Quick Actions">
            <ul className="divide-y divide-line">
                {actions.map(({ Icon, title, body, href, soon }) => {
                    const inner = (
                        <>
                            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
                                <Icon className="size-4" strokeWidth={1.9} />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-[0.875rem] font-medium">{title}</span>
                                <span className="block text-[0.75rem] text-muted">{body}</span>
                            </span>
                            {soon ? (
                                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[0.6875rem] font-medium text-muted">
                                    Soon
                                </span>
                            ) : href ? (
                                <ChevronRight className="size-4 shrink-0 text-soft" />
                            ) : null}
                        </>
                    );

                    return (
                        <li key={title}>
                            {href ? (
                                <Link href={href} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-surface-2">
                                    {inner}
                                </Link>
                            ) : (
                                <div aria-disabled="true" className="flex items-center gap-3 py-3 opacity-70">
                                    {inner}
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
        </Panel>
    );
}
