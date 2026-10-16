"use client";
import { useEffect, useState } from "react";
import { BROWSER_API_BASE, browserAssetUrl } from "@/lib/apiBase";

// Shared by the add-listing page and the inline editor, so the two cannot
// drift apart. Field names match schema v2 — the earlier form posted title,
// price and a free-text category, none of which are columns any more.

const EMPTY = {
    listing_title: "",
    listing_title_bn: "",
    listing_description: "",
    category_id: "",
    listing_price: "",
    listing_price_max: "",
    listing_price_unit: "",
    listing_min_order_qty: "",
};

export default function ListingForm({
    vendorId,
    listing = null,
    onSaved,
    onCancel,
    onPhotosChanged = null,
}) {
    const editing = Boolean(listing);

    const [form, setForm] = useState(() =>
        listing
            ? {
                listing_title: listing.listing_title ?? "",
                listing_title_bn: listing.listing_title_bn ?? "",
                listing_description: listing.listing_description ?? "",
                category_id: listing.category_id ?? "",
                listing_price: listing.listing_price ?? "",
                listing_price_max: listing.listing_price_max ?? "",
                listing_price_unit: listing.listing_price_unit ?? "",
                listing_min_order_qty: listing.listing_min_order_qty ?? "",
            }
            : EMPTY
    );

    const [categories, setCategories] = useState([]);
    const [photos, setPhotos] = useState([]);
    // Bumped to clear the file picker after a save, so the same files are not uploaded twice.
    const [fileInputKey, setFileInputKey] = useState(0);
    // The listing's saved photos, managed in the editor.
    const [savedPhotos, setSavedPhotos] = useState(listing?.photos ?? []);
    const [photoBusy, setPhotoBusy] = useState(false);
    const [status, setStatus] = useState(null);
    const [saving, setSaving] = useState(false);

    // Category is a foreign key now, so it is picked from the taxonomy.
    useEffect(() => {
        let cancelled = false;

        async function loadCategories() {
            try {
                const res = await fetch(`${BROWSER_API_BASE}/api/categories`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                if (!cancelled) setCategories(data);
            } catch (err) {
                console.error("Could not load categories:", err);
                if (!cancelled) {
                    setStatus({
                        type: "error",
                        message: "Could not load categories. Refresh and try again.",
                    });
                }
            }
        }

        loadCategories();
        return () => {
            cancelled = true;
        };
    }, []);

    const handleChange = (e) => {
        setForm({ ...form, [e.target.name]: e.target.value });
    };

    const handlePhotoUpload = (e) => {
        setPhotos([...e.target.files]);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatus(null);

        if (!form.listing_title.trim()) {
            setStatus({ type: "error", message: "Please enter a name." });
            return;
        }
        if (!form.category_id) {
            setStatus({ type: "error", message: "Please choose a category." });
            return;
        }

        // A blank price is fine — it shows as "Price on request" publicly.
        for (const [field, label] of [
            ["listing_price", "price"],
            ["listing_price_max", "maximum price"],
        ]) {
            if (form[field] !== "" && isNaN(Number(form[field]))) {
                setStatus({ type: "error", message: `Please enter a valid ${label}.` });
                return;
            }
        }

        setSaving(true);
        try {
            const url = editing
                ? `${BROWSER_API_BASE}/api/listings/${listing.listing_id}`
                : `${BROWSER_API_BASE}/api/vendors/${vendorId}/listings`;

            // The API checks the signed-in owner, so the session cookie must be sent.
            const res = await fetch(url, {
                method: editing ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(form),
            });
            const data = await res.json();

            if (!res.ok || !data.success) {
                setStatus({
                    type: "error",
                    message: data.error || "Could not save the listing.",
                });
                return;
            }

            if (photos.length > 0) {
                const formData = new FormData();
                photos.forEach((file) => formData.append("photos", file));

                const photoRes = await fetch(
                    `${BROWSER_API_BASE}/api/listings/${data.listing_id}/photos`,
                    { method: "POST", body: formData, credentials: "include" }
                );
                const photoData = await photoRes.json().catch(() => ({}));

                if (!photoRes.ok) {
                    // The listing itself was saved, so the list still refreshes to show it.
                    setStatus({
                        type: "error",
                        message: `The listing was saved, but the photos were not: ${photoData.error || "try adding them again."}`,
                    });
                    if (!editing) setForm(EMPTY);
                    if (onSaved) onSaved(data);
                    return;
                }
                setSavedPhotos(photoData.photos ?? []);
            }

            setStatus({
                type: "success",
                message: editing
                    ? "Listing updated."
                    : "Listing created. It appears publicly once an admin approves it.",
            });
            if (!editing) setForm(EMPTY);
            setPhotos([]);
            setFileInputKey((k) => k + 1);
            if (onSaved) onSaved(data);
        } catch (err) {
            console.error("Save failed:", err);
            setStatus({ type: "error", message: "Could not reach the server." });
        } finally {
            setSaving(false);
        }
    };

    // Makes a saved photo the main one, or removes it, then shows the updated set.
    async function changePhoto(photoId, action) {
        setPhotoBusy(true);
        setStatus(null);
        try {
            const res = await fetch(
                `${BROWSER_API_BASE}/api/listings/${listing.listing_id}/photos/${photoId}${action === "main" ? "/primary" : ""}`,
                { method: action === "main" ? "PUT" : "DELETE", credentials: "include" }
            );
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setStatus({ type: "error", message: data.error || "Could not update the photo." });
                return;
            }
            setSavedPhotos(data.photos ?? []);
            if (onPhotosChanged) onPhotosChanged();
        } catch (err) {
            console.error("Photo change failed:", err);
            setStatus({ type: "error", message: "Could not reach the server." });
        } finally {
            setPhotoBusy(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {status && (
                <div className={status.type === "error" ? "form-status-error" : "form-status-success"}>
                    {status.message}
                </div>
            )}

            <input
                name="listing_title"
                placeholder="Item name"
                value={form.listing_title}
                onChange={handleChange}
                className="form-input"
            />

            <input
                name="listing_title_bn"
                placeholder="Item name in Bangla (optional)"
                value={form.listing_title_bn}
                onChange={handleChange}
                className="form-input"
            />

            <select
                name="category_id"
                value={form.category_id}
                onChange={handleChange}
                className="form-input"
            >
                <option value="">Choose a category</option>
                {categories.map((c) => (
                    <option key={c.category_id} value={c.category_id}>
                        {c.category_parent_id ? `— ${c.category_name}` : c.category_name}
                    </option>
                ))}
            </select>

            <div className="flex gap-4">
                <input
                    name="listing_price"
                    placeholder="Price in BDT (leave blank for on request)"
                    value={form.listing_price}
                    onChange={handleChange}
                    className="form-input flex-1"
                />
                <input
                    name="listing_price_max"
                    placeholder="Up to (optional)"
                    value={form.listing_price_max}
                    onChange={handleChange}
                    className="form-input flex-1"
                />
            </div>

            <div className="flex gap-4">
                <input
                    name="listing_price_unit"
                    placeholder="Per unit, e.g. kg, piece"
                    value={form.listing_price_unit}
                    onChange={handleChange}
                    className="form-input flex-1"
                />
                <input
                    name="listing_min_order_qty"
                    placeholder="Minimum order (optional)"
                    value={form.listing_min_order_qty}
                    onChange={handleChange}
                    className="form-input flex-1"
                />
            </div>

            <textarea
                name="listing_description"
                placeholder="Description"
                value={form.listing_description}
                onChange={handleChange}
                className="form-input"
            />

            {editing && savedPhotos.length > 0 && (
                <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium">Current photos</span>
                    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {savedPhotos.map((photo) => (
                            <li
                                key={photo.photo_id}
                                className="overflow-hidden rounded-lg border border-line bg-surface-2"
                            >
                                <div className="relative aspect-4/3">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={browserAssetUrl(photo.photo_url) ?? ""}
                                        alt=""
                                        className="size-full object-cover"
                                    />
                                    {photo.photo_is_primary && (
                                        <span className="absolute top-1.5 left-1.5 rounded-md bg-brand-600 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-white">
                                            Main photo
                                        </span>
                                    )}
                                </div>
                                <div className="flex gap-2 p-2">
                                    {!photo.photo_is_primary && (
                                        <button
                                            type="button"
                                            className="form-button-secondary flex-1 px-2 py-1 text-xs"
                                            disabled={photoBusy}
                                            onClick={() => changePhoto(photo.photo_id, "main")}
                                        >
                                            Make main
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className="form-button-danger flex-1 px-2 py-1 text-xs"
                                        disabled={photoBusy}
                                        onClick={() => changePhoto(photo.photo_id, "remove")}
                                    >
                                        Remove
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium">{editing ? "Add photos" : "Photos"}</span>
                <input
                    key={fileInputKey}
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handlePhotoUpload}
                    className="form-input"
                />
                <span className="text-[0.8125rem] text-muted">
                    JPG, PNG or WEBP, up to 5 MB each and 8 per listing. The first photo becomes the main one.
                </span>
            </label>

            <div className="flex gap-3">
                <button type="submit" className="form-button-primary" disabled={saving}>
                    {saving ? "Saving…" : editing ? "Save changes" : "Publish listing"}
                </button>

                {onCancel && (
                    <button type="button" className="form-button-secondary" onClick={onCancel}>
                        Cancel
                    </button>
                )}
            </div>
        </form>
    );
}
