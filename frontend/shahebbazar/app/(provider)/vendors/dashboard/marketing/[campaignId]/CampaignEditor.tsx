"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Info, Loader2, Mail, Send, Ticket } from "lucide-react";
import { browserAssetUrl } from "@/lib/apiBase";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import type { CampaignContent, CampaignDetail } from "@/lib/types";
import { deleteCampaign, saveCampaignContent, sendCampaign } from "../actions";
import { STATUS, couponState, ctaLabel, formatDay, formatWhen, goalLabel } from "../labels";

const AREA =
    "mt-1.5 w-full rounded-[10px] border border-line-strong bg-surface px-3 py-2.5 text-[0.8125rem] leading-relaxed outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-100 read-only:bg-surface-2";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Prices as the templates write them: ৳2,800, ৳2,800–৳4,200, ৳২,৮০০.
const PRICE = "৳[0-9০-৯,.]+(?:–৳[0-9০-৯,.]+)?";

/**
 * Shows text keeping line breaks, with [[placeholders]] (must fill in) in yellow and facts from the
 * business's saved details (name, products, prices, address, phone, page, coupon) in blue.
 */
function Marked({ text, facts }: { text: string; facts: string[] }) {
    const parts = ["\\[\\[[^\\]]+\\]\\]", PRICE, ...facts.map(escape)];
    const splitter = new RegExp(`(${parts.join("|")})`, "g");
    return (
        <>
            {text.split(splitter).map((part, i) =>
                /^\[\[.*\]\]$/.test(part) ? (
                    <mark key={i} className="rounded bg-sponsor-bg px-0.5 text-sponsor-ink">
                        {part}
                    </mark>
                ) : i % 2 === 1 && part ? (
                    <span key={i} data-fact className="rounded bg-blue-100 px-0.5 text-blue-900">
                        {part}
                    </span>
                ) : (
                    <Fragment key={i}>{part}</Fragment>
                )
            )}
        </>
    );
}

/** Content with every field present, so versions saved before the photo switch compare equal. */
const complete = (c: CampaignContent): CampaignContent => ({
    email: { subject: c.email.subject, body: c.email.body, photos: c.email.photos !== false },
    facebook: { text: c.facebook.text, photos: c.facebook.photos !== false },
    whatsapp: { text: c.whatsapp.text, photos: c.whatsapp.photos !== false },
});
const sameContent = (a: CampaignContent, b: CampaignContent) => JSON.stringify(complete(a)) === JSON.stringify(complete(b));

/** The "Include photos" switch beside a channel's heading. */
function PhotoSwitch({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: (on: boolean) => void }) {
    return (
        <label className="inline-flex items-center gap-2 text-sm font-medium">
            <input
                type="checkbox"
                role="switch"
                aria-label={label}
                checked={checked}
                disabled={disabled}
                onChange={(e) => onChange(e.target.checked)}
                className="peer sr-only"
            />
            <span
                aria-hidden
                className="relative h-5 w-9 rounded-full bg-line-strong transition-colors after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-brand-600 peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-600 peer-disabled:opacity-60"
            />
            Include photos
        </label>
    );
}

// The editor for one campaign: wording for each channel beside its preview, versions and approval.
const customers = (n: number) => `${n} customer${n === 1 ? "" : "s"}`;

/** Which allowance a send uses, in the owner's words. */
function allowanceText(send: { plan: "active" | "free" | "expired" | null; left_after: number | null }) {
    if (send.plan === "active") return `Uses 1 of your pass's email campaigns (${send.left_after} left after this).`;
    if (send.plan === "free") return "Uses your free email campaign for this month.";
    if (send.plan === "expired") return "Uses your free email campaign for this week.";
    return "";
}

export function CampaignEditor({ vendorId, initial, readOnly: viewOnly }: { vendorId: number; initial: CampaignDetail; readOnly: boolean }) {
    const router = useRouter();
    const [campaign, setCampaign] = useState(initial);
    const latest = campaign.versions[0];
    const [content, setContent] = useState<CampaignContent>(complete(latest.version_content));
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
    const [asking, setAsking] = useState<"delete" | "send" | null>(null);
    const [pending, startTransition] = useTransition();

    // Admins only look; a campaign that has gone out can't be changed.
    const readOnly = viewOnly || campaign.status === "sending" || campaign.status === "sent";
    const dirty = !sameContent(content, latest.version_content);
    // Parts still marked [[like this]] in the wording as it is now, saved or not; they block sending.
    const placeholders = [...new Set(
        [content.email.subject, content.email.body, content.facebook.text, content.whatsapp.text].flatMap((t) => t.match(/\[\[[^\]]+\]\]/g) ?? [])
    )];
    // No separate approval: the owner previews, then confirms the send, which approves what goes out.
    const unsent = campaign.status === "draft" || campaign.status === "approved";
    const canSend = !readOnly && unsent && "can_send" in campaign.send && campaign.send.can_send && placeholders.length === 0;
    const { snapshot } = campaign;
    const name = campaign.brief.language === "bn" && snapshot.business.name_bn ? snapshot.business.name_bn : snapshot.business.name;
    const logo = browserAssetUrl(snapshot.business.logo_url);
    const cover = browserAssetUrl(snapshot.business.cover_url);
    const photos = snapshot.listings.map((l) => browserAssetUrl(l.photo_url)).filter(Boolean) as string[];
    // Facebook and WhatsApp carry one picture: the first product photo, or else the business's cover photo.
    const socialPhoto = photos[0] ?? cover;
    // Facts copied from the business's saved details, longest first so a whole name wins over part of it.
    const facts = [
        snapshot.business.name, snapshot.business.name_bn, snapshot.business.address, snapshot.business.phone, snapshot.business.page_url,
        ...snapshot.listings.flatMap((l) => [l.title, l.title_bn]),
        campaign.coupon?.code,
    ].filter((f): f is string => Boolean(f && f.length > 2)).sort((a, b) => b.length - a.length);
    const { coupon } = campaign;

    const set = (channel: "email" | "facebook" | "whatsapp", field: string, value: string | boolean) =>
        setContent((c) => ({ ...c, [channel]: { ...c[channel], [field]: value } }));

    function done(result: Awaited<ReturnType<typeof saveCampaignContent>>, okText: string) {
        if (result.ok) {
            setCampaign(result.data);
            setContent(complete(result.data.versions[0].version_content));
            setErrors({});
            setMessage({ ok: true, text: okText });
        } else {
            setErrors(result.errors ?? {});
            setMessage({ ok: false, text: result.error });
        }
    }

    function save() {
        setMessage(null);
        startTransition(async () => {
            const result = await saveCampaignContent(vendorId, campaign.campaign_id, content);
            done(result, result.ok ? `Saved as version ${result.data.versions[0].version_number}.` : "");
        });
    }

    function send() {
        setAsking(null);
        setMessage(null);
        startTransition(async () => {
            // Unsaved changes (wording or a photo switch) are saved as a new version first, so what was
            // previewed is what goes out.
            if (dirty) {
                const saved = await saveCampaignContent(vendorId, campaign.campaign_id, content);
                if (!saved.ok) {
                    done(saved, "");
                    return;
                }
                done(saved, `Saved as version ${saved.data.versions[0].version_number}.`);
            }
            const result = await sendCampaign(vendorId, campaign.campaign_id);
            // On success the "Sent" box replaces the send panel and the editor locks.
            if (result.ok) {
                setCampaign(result.data.campaign);
            } else {
                setMessage({ ok: false, text: result.error });
                // The page's figures (audience, allowance) may have changed; reload them.
                router.refresh();
            }
        });
    }

    function remove() {
        setAsking(null);
        startTransition(async () => {
            const result = await deleteCampaign(vendorId, campaign.campaign_id);
            if (result.ok) router.push(`/vendors/dashboard/marketing?vendor=${vendorId}`);
            else setMessage({ ok: false, text: result.error });
        });
    }

    const fieldError = (key: string) =>
        errors[key] && (
            <span role="alert" className="mt-1 block text-xs text-error-ink">
                {errors[key]}
            </span>
        );

    return (
        <div className="mt-4 space-y-5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS[campaign.status].className}`}>{STATUS[campaign.status].label}</span>
                <span className="text-muted">
                    {goalLabel(campaign.brief.goal)} · {campaign.brief.language === "bn" ? "Bangla" : "English"} · {ctaLabel(campaign.brief.call_to_action)}
                    {campaign.brief.offer ? ` · Offer: ${campaign.brief.offer}` : ""}
                    {campaign.brief.starts_on || campaign.brief.ends_on
                        ? ` · ${formatDay(campaign.brief.starts_on)} to ${formatDay(campaign.brief.ends_on)}`
                        : ""}
                </span>
            </div>

            {coupon && (
                <section aria-label="Coupon" className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-4 shadow-card">
                    <Ticket className="size-5 text-brand-600" aria-hidden />
                    <span className="text-sm">
                        Coupon <span className="rounded bg-surface-2 px-1.5 py-0.5 font-semibold tracking-wide">{coupon.code}</span>
                    </span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${couponState(coupon).className}`}>{couponState(coupon).label}</span>
                    <span className="text-xs text-muted">
                        Customers show the code when they visit or order. It stops working after the offer&apos;s last day.
                    </span>
                </section>
            )}

            <p className="flex gap-2 text-[0.8125rem] text-muted">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                    In the previews, <span className="rounded bg-blue-100 px-0.5 text-blue-900">blue</span> parts come from your saved
                    business and product details. If something is wrong, update it in Products &amp; Services or My Business, then start
                    a new campaign: this one keeps the details it was made with.
                </span>
            </p>

            {"results" in campaign.send ? (
                <section aria-label="Sent" className="flex gap-2 rounded-xl border border-success-ink/30 bg-success-bg p-4 text-sm text-success-ink">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>
                        <span className="font-semibold">Sent {formatWhen(campaign.send.sent_at)}</span> to{" "}
                        {customers(campaign.send.results?.sent ?? 0)} by email
                        {campaign.send.results?.failed ? `; ${campaign.send.results.failed} couldn't be delivered` : ""}. A sent
                        campaign can&apos;t be changed or sent again; start a new campaign for your next message.
                    </span>
                </section>
            ) : (
                unsent && (
                    <section aria-labelledby="send-heading" className="rounded-xl border border-line bg-surface p-5 shadow-card">
                        <h2 id="send-heading" className="flex items-center gap-2 font-semibold">
                            <Mail className="size-4 text-brand-600" aria-hidden /> Send by email
                        </h2>
                        <p className="mt-1.5 text-sm text-muted">
                            Goes to the {customers(campaign.send.audience)} who chose to get your offers by email, each with a link to
                            unsubscribe. {allowanceText(campaign.send)}
                        </p>
                        {campaign.send.reason && (
                            <p className="mt-2 flex gap-2 text-sm text-sponsor-ink">
                                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {campaign.send.reason}
                            </p>
                        )}
                        <p className="mt-2 text-xs text-soft">
                            Check the previews below, then use the Send button at the bottom. Sending approves the wording as it is then.{" "}Only the email is sent. The Facebook and WhatsApp versions below are previews; posting them from here comes in a later release.</p>
                    </section>
                )
            )}
            {placeholders.length > 0 && (
                <div className="rounded-lg border border-sponsor-ink/30 bg-sponsor-bg p-3 text-sm text-sponsor-ink">
                    <p className="flex items-center gap-2 font-semibold">
                        <AlertTriangle className="size-4" aria-hidden /> Before sending
                    </p>
                    <p className="mt-1">Replace the highlighted parts marked [[like this]] with your own words:</p>
                    <ul className="mt-1 list-disc pl-6">
                        {placeholders.map((p) => (
                            <li key={p}>{p.slice(2, -2)}</li>
                        ))}
                    </ul>
                </div>
            )}
            {campaign.warnings.length > 0 && (
                <div className="rounded-lg border border-line bg-surface-2 p-3 text-sm text-muted">
                    <p className="font-semibold text-ink">Good to know</p>
                    <ul className="mt-1 list-disc pl-6">
                        {campaign.warnings.map((w) => (
                            <li key={w}>{w}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Email */}
            <section aria-labelledby="email-heading" className="grid gap-4 rounded-xl border border-line bg-surface p-5 shadow-card lg:grid-cols-2">
                <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 id="email-heading" className="font-semibold">Email</h2>
                        {photos.length > 0 && (
                            <PhotoSwitch
                                label="Include photos in the email"
                                checked={content.email.photos !== false}
                                disabled={readOnly}
                                onChange={(on) => set("email", "photos", on)}
                            />
                        )}
                    </div>
                    <label className="mt-3 block text-sm font-semibold">
                        Subject
                        <input
                            value={content.email.subject}
                            onChange={(e) => set("email", "subject", e.target.value)}
                            readOnly={readOnly}
                            maxLength={150}
                            className={AREA}
                        />
                        {fieldError("email.subject")}
                    </label>
                    <label className="mt-3 block text-sm font-semibold">
                        Message
                        <textarea
                            value={content.email.body}
                            onChange={(e) => set("email", "body", e.target.value)}
                            readOnly={readOnly}
                            rows={14}
                            maxLength={5000}
                            className={AREA}
                        />
                        {fieldError("email.body")}
                    </label>
                </div>
                <div aria-label="Email preview" className="rounded-lg border border-line bg-white p-4 text-[0.8125rem] text-slate-800">
                    <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                        {logo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={logo} alt="" className="size-8 rounded-full object-cover" />
                        ) : (
                            <span className="grid size-8 place-items-center rounded-full bg-blue-100 font-semibold text-blue-700">{name.charAt(0)}</span>
                        )}
                        <span>
                            <span className="block font-semibold">{name} via Shaheb Bazar</span>
                            <span className="block text-xs text-slate-500">
                                <Marked text={content.email.subject} facts={facts} />
                            </span>
                        </span>
                    </div>
                    {content.email.photos !== false && photos.length > 0 && (
                        <div className="mt-3 flex gap-2">
                            {photos.map((src) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img key={src} src={src} alt="" className="h-20 min-w-0 flex-1 rounded-md object-cover" />
                            ))}
                        </div>
                    )}
                    <p className="mt-3 whitespace-pre-line">
                        <Marked text={content.email.body} facts={facts} />
                    </p>
                    <p className="mt-4 border-t border-slate-200 pt-2 text-[0.6875rem] text-slate-500">
                        You get this because you chose offers from {name}. An unsubscribe link is added here when it&apos;s sent.
                    </p>
                </div>
            </section>

            {/* Facebook and WhatsApp */}
            <div className="grid gap-5 lg:grid-cols-2">
                <section aria-labelledby="facebook-heading" className="rounded-xl border border-line bg-surface p-5 shadow-card">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 id="facebook-heading" className="flex items-center gap-2 font-semibold">
                            Facebook post <span className="rounded-full bg-sponsor-bg px-2 py-0.5 text-[0.6875rem] font-medium text-sponsor-ink">Preview only</span>
                        </h2>
                        {socialPhoto && (
                            <PhotoSwitch
                                label="Include a photo in the Facebook post"
                                checked={content.facebook.photos !== false}
                                disabled={readOnly}
                                onChange={(on) => set("facebook", "photos", on)}
                            />
                        )}
                    </div>
                    <textarea
                        aria-labelledby="facebook-heading"
                        value={content.facebook.text}
                        onChange={(e) => set("facebook", "text", e.target.value)}
                        readOnly={readOnly}
                        rows={9}
                        maxLength={2000}
                        className={AREA}
                    />
                    {fieldError("facebook.text")}
                    <div aria-label="Facebook preview" className="mt-3 overflow-hidden rounded-lg border border-line bg-white text-[0.8125rem] text-slate-800">
                        <p className="px-3 pt-3 font-semibold">{name}</p>
                        <p className="whitespace-pre-line px-3 py-2">
                            <Marked text={content.facebook.text} facts={facts} />
                        </p>
                        {content.facebook.photos !== false && socialPhoto && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={socialPhoto} alt="" className="h-36 w-full object-cover" />
                        )}
                    </div>
                    <p className="mt-3 flex gap-2 text-xs text-muted">
                        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        <span>
                            This is a preview of how it could look. Posting to Facebook from Shaheb Bazar comes in a later release; for now
                            you can copy the text and post it yourself.
                        </span>
                    </p>
                </section>
                <section aria-labelledby="whatsapp-heading" className="rounded-xl border border-line bg-surface p-5 shadow-card">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 id="whatsapp-heading" className="flex items-center gap-2 font-semibold">
                            WhatsApp message <span className="rounded-full bg-sponsor-bg px-2 py-0.5 text-[0.6875rem] font-medium text-sponsor-ink">Preview only</span>
                        </h2>
                        {socialPhoto && (
                            <PhotoSwitch
                                label="Include a photo in the WhatsApp message"
                                checked={content.whatsapp.photos !== false}
                                disabled={readOnly}
                                onChange={(on) => set("whatsapp", "photos", on)}
                            />
                        )}
                    </div>
                    <textarea
                        aria-labelledby="whatsapp-heading"
                        value={content.whatsapp.text}
                        onChange={(e) => set("whatsapp", "text", e.target.value)}
                        readOnly={readOnly}
                        rows={9}
                        maxLength={1000}
                        className={AREA}
                    />
                    {fieldError("whatsapp.text")}
                    <div aria-label="WhatsApp preview" className="mt-3 rounded-lg bg-[#e5ddd5] p-3">
                        <div className="ml-auto max-w-[85%] overflow-hidden rounded-lg bg-[#dcf8c6] text-[0.8125rem] text-slate-800 shadow-sm">
                            {content.whatsapp.photos !== false && socialPhoto && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={socialPhoto} alt="" className="h-36 w-full rounded-md object-cover p-1 pb-0" />
                            )}
                            <p className="px-3 py-2 whitespace-pre-line">
                                <Marked text={content.whatsapp.text.replace(/\*(.+?)\*/g, "$1")} facts={facts} />
                            </p>
                        </div>
                    </div>
                    <p className="mt-3 flex gap-2 text-xs text-muted">
                        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        <span>
                            This is a preview of how it could look. Posting to WhatsApp from Shaheb Bazar comes in a later release; for now
                            you can copy the text and post it yourself.
                        </span>
                    </p>
                </section>
            </div>

            {!readOnly && (
                <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface/95 p-3 shadow-float backdrop-blur">
                    <button
                        type="button"
                        onClick={save}
                        disabled={pending || !dirty}
                        className="inline-flex items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-2 disabled:opacity-50"
                    >
                        {pending && <Loader2 className="size-4 animate-spin" />}
                        Save changes
                    </button>
                    {"audience" in campaign.send && (
                        <button
                            type="button"
                            onClick={() => setAsking("send")}
                            disabled={pending || !canSend}
                            title={placeholders.length ? "Replace the highlighted parts first" : campaign.send.reason ?? undefined}
                            className="inline-flex items-center gap-2 rounded-[10px] bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                        >
                            <Send className="size-4" />
                            {dirty ? "Save and send" : "Send"} to {customers(campaign.send.audience)}
                        </button>
                    )}
                    {message && (
                        <span role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-success-ink" : "text-error-ink"}`}>
                            {message.text}
                        </span>
                    )}
                    {["draft", "approved"].includes(campaign.status) && (
                        <button
                            type="button"
                            onClick={() => setAsking("delete")}
                            disabled={pending}
                            className="ml-auto text-sm font-medium text-error-ink hover:underline disabled:opacity-50"
                        >
                            Delete campaign
                        </button>
                    )}
                </div>
            )}

            <section aria-labelledby="versions-heading">
                <h2 id="versions-heading" className="font-semibold">Versions</h2>
                <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-surface text-sm shadow-card">
                    {campaign.versions.map((v) => (
                        <li key={v.version_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                            <span className="font-medium">Version {v.version_number}</span>
                            <span className="text-muted">
                                {v.version_method === "template" ? "Written from your details" : "Edited"}
                                {v.created_by ? ` by ${v.created_by}` : ""} · {formatWhen(v.version_created_at)}
                            </span>
                            {v.version_id === campaign.approved_version_id && (
                                <span className="rounded-full bg-success-bg px-2 py-0.5 text-xs font-medium text-success-ink">
                                    {campaign.status === "sent" ? "Sent" : "Approved"}
                                </span>
                            )}
                        </li>
                    ))}
                </ul>
                <p className="mt-2 text-xs text-soft">
                    Product names, prices and photos were copied in on {formatWhen(snapshot.taken_at)}; later changes to your products don&apos;t
                    change this campaign.
                </p>
            </section>

            {"audience" in campaign.send && (
                <ConfirmDialog
                    open={asking === "send"}
                    title={`Send this email to ${customers(campaign.send.audience)}?`}
                    body={`${dirty ? "Your changes are saved first. " : ""}It goes out now, exactly as in the email preview, and can't be changed or sent again. ${allowanceText(campaign.send)}`}
                    confirmLabel="Send now"
                    tone="primary"
                    onConfirm={send}
                    onCancel={() => setAsking(null)}
                />
            )}
            <ConfirmDialog
                open={asking === "delete"}
                title="Delete this campaign?"
                body="Its drafts and every version are deleted. This can't be undone."
                confirmLabel="Delete"
                onConfirm={remove}
                onCancel={() => setAsking(null)}
            />
        </div>
    );
}
