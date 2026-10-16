"use client";
import { useEffect, useState } from "react";
import ListingForm from "./ListingForm";
import { BROWSER_API_BASE, browserAssetUrl } from "@/lib/apiBase";

// The earlier version read listing.title, listing.price and listing.category,
// none of which exist in v2, so every card showed a blank name and no price.
//
// Editing is inline because /vendors/listings/:id/edit, which the old buttons
// linked to, was never built.

function priceLabel(listing) {
    const price = listing.listing_price === null ? null : Number(listing.listing_price);
    const max = listing.listing_price_max === null ? null : Number(listing.listing_price_max);
    if (price === null || Number.isNaN(price)) return "Price on request";

    const unit = listing.listing_price_unit ? ` / ${listing.listing_price_unit}` : "";
    const money = (n) => `৳${n.toLocaleString("en-US")}`;
    if (max !== null && !Number.isNaN(max) && max > price) {
        return `${money(price)} – ${money(max)}${unit}`;
    }
    return `${money(price)}${unit}`;
}

// So a vendor can see why a listing is not public yet.
function StatusBadge({ status }) {
    const tints = {
        approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
        pending: "bg-amber-50 text-amber-700 border-amber-200",
        rejected: "bg-red-50 text-red-700 border-red-200",
        draft: "bg-neutral-100 text-neutral-600 border-neutral-200",
        archived: "bg-neutral-100 text-neutral-600 border-neutral-200",
    };
    const labels = {
        approved: "Live",
        pending: "Awaiting approval",
        rejected: "Rejected",
        draft: "Draft",
        archived: "Archived",
    };

    return (
        <span
            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${
                tints[status] || tints.draft
            }`}
        >
            {labels[status] || status}
        </span>
    );
}

// The listing's main photo, so a vendor can confirm an upload worked.
function ListingThumbnail({ listing }) {
    const src = browserAssetUrl(listing.photo_url);
    // A stored path whose file is missing falls back to the placeholder rather than a broken image.
    const [failed, setFailed] = useState(false);
    return (
        <div className="size-20 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-2 sm:size-24">
            {src && !failed ? (
                // A plain <img>, because next/image needs the environment-dependent asset host declared at build time.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={src}
                    alt={listing.listing_title}
                    loading="lazy"
                    onError={() => setFailed(true)}
                    className="size-full object-cover"
                />
            ) : (
                <div className="grid size-full place-items-center px-1 text-center text-xs text-muted">
                    No photo
                </div>
            )}
        </div>
    );
}

export default function VendorListings({ vendorId, refresh }) {
    const [listings, setListings] = useState([]);
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState(null);

    // Bumped after a save to re-run the effect. The fetch stays inside the
    // effect so it is not called synchronously during render.
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                // The API checks the signed-in owner, so the session cookie must be sent.
                const res = await fetch(
                    `${BROWSER_API_BASE}/api/vendors/${vendorId}/listings`,
                    { credentials: "include" }
                );
                if (res.status === 401 || res.status === 403) {
                    if (!cancelled) {
                        setStatus({ type: "error", message: "Sign in as this business's owner to see its listings." });
                    }
                    return;
                }
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                if (!cancelled) setListings(data);
            } catch (err) {
                console.error("Could not load listings:", err);
                if (!cancelled) {
                    setStatus({ type: "error", message: "Could not load your listings." });
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, [vendorId, refresh, reloadKey]);

    async function deleteListing(id) {
        try {
            const res = await fetch(`${BROWSER_API_BASE}/api/listings/${id}`, {
                method: "DELETE",
                credentials: "include",
            });
            const data = await res.json();

            if (!res.ok) {
                setStatus({ type: "error", message: data.error || "Could not delete." });
                return;
            }
            setListings(listings.filter((l) => l.listing_id !== id));
        } catch (err) {
            console.error("Delete failed:", err);
            setStatus({ type: "error", message: "Could not reach the server." });
        }
    }

    if (loading) {
        return <div className="mt-10 text-gray-400">Loading your listings…</div>;
    }

    if (listings.length === 0) {
        return (
            <div className="mt-10">
                {status && <div className="form-status-error">{status.message}</div>}
                <p className="text-gray-400">
                    No listings yet. Add your first product or service above.
                </p>
            </div>
        );
    }

    return (
        <div className="mt-10">
            <h3 className="text-lg font-semibold mb-3">Your Listings</h3>

            {status && (
                <div
                    className={
                        status.type === "error" ? "form-status-error" : "form-status-success"
                    }
                >
                    {status.message}
                </div>
            )}

            <div className="flex flex-col gap-4">
                {listings.map((listing) =>
                    editingId === listing.listing_id ? (
                        <div
                            key={listing.listing_id}
                            className="p-4 border border-neutral-700 rounded-md"
                        >
                            <ListingForm
                                vendorId={vendorId}
                                listing={listing}
                                onSaved={() => {
                                    setEditingId(null);
                                    setReloadKey((k) => k + 1);
                                }}
                                onCancel={() => setEditingId(null)}
                                onPhotosChanged={() => setReloadKey((k) => k + 1)}
                            />
                        </div>
                    ) : (
                        <div
                            key={listing.listing_id}
                            className="flex gap-4 p-4 border border-neutral-700 rounded-md"
                        >
                            <ListingThumbnail listing={listing} />

                            <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-3">
                                    <h4 className="text-md font-semibold">
                                        {listing.listing_title}
                                    </h4>
                                    <StatusBadge status={listing.listing_status} />
                                </div>

                                <p className="text-gray-400">{priceLabel(listing)}</p>
                                {listing.listing_min_order_qty && (
                                    <p className="text-gray-400">
                                        Min order: {listing.listing_min_order_qty}
                                        {listing.listing_price_unit
                                            ? ` ${listing.listing_price_unit}`
                                            : ""}
                                    </p>
                                )}
                                <p className="text-gray-400">
                                    {listing.category_name || "Uncategorised"}
                                </p>

                                {listing.listing_status === "rejected" &&
                                    listing.listing_rejection_reason && (
                                        <p className="mt-2 text-sm text-red-600">
                                            {listing.listing_rejection_reason}
                                        </p>
                                    )}

                                <div className="flex gap-3 mt-3">
                                    <button
                                        type="button"
                                        className="form-button-secondary"
                                        onClick={() => setEditingId(listing.listing_id)}
                                    >
                                        Edit
                                    </button>

                                    <button
                                        type="button"
                                        className="form-button-danger"
                                        onClick={() => deleteListing(listing.listing_id)}
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                )}
            </div>
        </div>
    );
}
