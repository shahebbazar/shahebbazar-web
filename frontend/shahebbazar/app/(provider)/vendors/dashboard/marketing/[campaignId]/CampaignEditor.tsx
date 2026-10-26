"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Info, Link2, Loader2, Mail, MapPin, Moon, PenLine, RotateCcw, Send, Sun, Ticket } from "lucide-react";
import { browserAssetUrl } from "@/lib/apiBase";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { channelsFromMessage, messageFromFacebook } from "@/lib/campaignMessage";
import { formatPhone, localiseDigits } from "@/lib/format";
import type { CampaignContent, CampaignDetail, CampaignSnapshot } from "@/lib/types";
import { deleteCampaign, saveCampaignContent, sendCampaign } from "../actions";
import { ShareButtons } from "./ShareButtons";
import { ShareKit } from "./ShareKit";
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
// The email's colours, light and dark: the website's own (app/globals.css), as in the sent email
// (backend/services/marketing/emailMessage.js). Mail apps pick light or dark themselves; the switch
// above the preview shows both.
const EMAIL_THEME = {
    light: {
        page: "bg-[#f6f8fc]", card: "border-[#e6eaf2] bg-white text-[#0f172a]", line: "border-[#e6eaf2]", soft: "bg-[#f8fafc]",
        ink: "text-[#0f172a]", muted: "text-[#64748b]", link: "text-[#2563eb]", outline: "border-[#d8dfec]", price: "text-[#15803d]",
        coupon: "border-[#93c5fd] bg-[#eff6ff]", code: "text-[#1d4ed8]",
    },
    dark: {
        page: "bg-[#0b1120]", card: "border-[#263244] bg-[#111827] text-[#f1f5f9]", line: "border-[#263244]", soft: "bg-[#182233]",
        ink: "text-[#f1f5f9]", muted: "text-[#a8b3c4]", link: "text-[#60a5fa]", outline: "border-[#354258]", price: "text-[#86efac]",
        coupon: "border-[#1e40af] bg-[#172554]", code: "text-[#93c5fd]",
    },
};

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

/** A product's price as the email's card shows it: "৳2,800–৳4,200 per maund"; null when it has none. */
function priceOf(l: CampaignSnapshot["listings"][number], bangla: boolean): string | null {
    if (l.price == null) return null;
    const money = (n: number) => localiseDigits(`৳${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`, bangla ? "bn" : "en");
    const range = l.price_max != null && Number(l.price_max) > Number(l.price) ? `${money(l.price)}–${money(l.price_max)}` : money(l.price);
    return range + (l.price_unit ? (bangla ? ` (প্রতি ${l.price_unit})` : ` per ${l.price_unit}`) : "");
}

/**
 * Content with every field present, so versions saved before the photo switch compare equal. A version
 * saved before there was one message starts from its Facebook post without the hashtags.
 */
const complete = (c: CampaignContent): CampaignContent => ({
    message: c.message ?? messageFromFacebook(c.facebook.text),
    email: { subject: c.email.subject, body: c.email.body, photos: c.email.photos !== false },
    facebook: { text: c.facebook.text, photos: c.facebook.photos !== false },
    whatsapp: { text: c.whatsapp.text, photos: c.whatsapp.photos !== false },
});
const sameContent = (a: CampaignContent, b: CampaignContent) => JSON.stringify(complete(a)) === JSON.stringify(complete(b));

type Channel = "email" | "facebook" | "whatsapp";
const CHANNEL_NAMES: Record<Channel, string> = { email: "the email", facebook: "Facebook", whatsapp: "WhatsApp" };
const textOf = (c: CampaignContent, channel: Channel) => (channel === "email" ? c.email.body : c[channel].text);
const withText = (c: CampaignContent, channel: Channel, text: string): CampaignContent =>
    channel === "email" ? { ...c, email: { ...c.email, body: text } } : { ...c, [channel]: { ...c[channel], text } };

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

// The editor for one campaign: one message for all three channels, their previews (each can be changed
// on its own), sharing, versions and sending.
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
    // Channels whose own box the owner opened, to change that channel alone.
    const [editing, setEditing] = useState<Record<Channel, boolean>>({ email: false, facebook: false, whatsapp: false });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
    const [asking, setAsking] = useState<"delete" | "send" | null>(null);
    const [emailScheme, setEmailScheme] = useState<"light" | "dark">("light");
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
    // Facebook, WhatsApp and X are posted by the owner, from saved wording with nothing left to fill in.
    const shareBlocked = !["draft", "approved", "sent"].includes(campaign.status)
        ? "Sharing isn't available while the campaign is being sent."
        : placeholders.length
            ? "Replace the highlighted parts marked [[like this]] to get the share buttons."
            : dirty
                ? "Save your changes first, so what you share is the saved version."
                : null;
    const posted = Boolean(campaign.posts.facebook || campaign.posts.whatsapp);
    const { snapshot } = campaign;
    const bangla = campaign.brief.language === "bn";
    const name = bangla && snapshot.business.name_bn ? snapshot.business.name_bn : snapshot.business.name;
    const logo = browserAssetUrl(snapshot.business.logo_url);
    const cover = browserAssetUrl(snapshot.business.cover_url);
    const photos = snapshot.listings.map((l) => browserAssetUrl(l.photo_url)).filter(Boolean) as string[];
    // A campaign about one of the business's events links to the event's page, with its cover photo.
    const event = snapshot.event;
    const pageUrl = event?.page_url ?? snapshot.business.page_url;
    // Facebook and WhatsApp carry one picture: the event's cover, the first product photo, or the business's cover.
    const socialPhoto = browserAssetUrl(event?.cover_url ?? null) ?? photos[0] ?? cover;
    // The email's large photo under its header: the event's cover, or the business's (as in emailMessage.js).
    const emailHero = browserAssetUrl(event?.cover_url ?? null) ?? cover;
    // Facts copied from the business's saved details, longest first so a whole name wins over part of it.
    const facts = [
        snapshot.business.name, snapshot.business.name_bn, snapshot.business.address, snapshot.business.phone, snapshot.business.page_url,
        event?.title, event?.title_bn, event?.page_url,
        ...snapshot.listings.flatMap((l) => [l.title, l.title_bn]),
        campaign.coupon?.code,
    ].filter((f): f is string => Boolean(f && f.length > 2)).sort((a, b) => b.length - a.length);
    const { coupon } = campaign;

    // Each channel made from the one message, and whether its wording still matches.
    const derive = (message: string) => channelsFromMessage(message, { lang: bangla ? "bn" : "en", name });
    const made = derive(content.message ?? "");
    const follows = (channel: Channel) => textOf(content, channel) === made[channel];
    const savedMessage = complete(latest.version_content).message ?? "";
    const headline = (content.message ?? "").split("\n")[0] ?? "";

    /** A new message updates every channel that still matches the old one; a channel changed on its own keeps its words. */
    function setMessage(next: string) {
        setContent((c) => {
            const before = derive(c.message ?? "");
            const after = derive(next);
            let out: CampaignContent = { ...c, message: next };
            for (const channel of ["email", "facebook", "whatsapp"] as const) {
                if (textOf(c, channel) === before[channel]) out = withText(out, channel, after[channel]);
            }
            return out;
        });
    }

    const setPhotos = (channel: Channel, on: boolean) => setContent((c) => ({ ...c, [channel]: { ...c[channel], photos: on } }));

    function done(result: Awaited<ReturnType<typeof saveCampaignContent>>, okText: string) {
        if (result.ok) {
            setCampaign(result.data);
            setContent(complete(result.data.versions[0].version_content));
            setErrors({});
            setNotice({ ok: true, text: okText });
        } else {
            setErrors(result.errors ?? {});
            setNotice({ ok: false, text: result.error });
        }
    }

    function save() {
        setNotice(null);
        startTransition(async () => {
            const result = await saveCampaignContent(vendorId, campaign.campaign_id, content);
            done(result, result.ok ? `Saved as version ${result.data.versions[0].version_number}.` : "");
        });
    }

    function send() {
        setAsking(null);
        setNotice(null);
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
                setNotice({ ok: false, text: result.error });
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
            else setNotice({ ok: false, text: result.error });
        });
    }

    const fieldError = (key: string) =>
        errors[key] && (
            <span role="alert" className="mt-1 block text-xs text-error-ink">
                {errors[key]}
            </span>
        );

    /**
     * Above a channel's preview: whether it matches the message, a button to change it alone (its own
     * box), and a way back to the message's wording.
     */
    function channelWording(channel: Channel, label: string, rows: number, max: number) {
        const own = !follows(channel);
        return (
            <div className="mt-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    {own ? (
                        <span className="inline-flex items-center gap-1 font-medium text-sponsor-ink">
                            <PenLine className="size-3.5" aria-hidden /> Changed for {CHANNEL_NAMES[channel]} only
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1 text-muted">
                            <Link2 className="size-3.5" aria-hidden /> Made from your message
                        </span>
                    )}
                    {!readOnly && !own && !editing[channel] && (
                        <button type="button" onClick={() => setEditing((e) => ({ ...e, [channel]: true }))} className="font-medium text-brand-600 hover:underline">
                            Change for {CHANNEL_NAMES[channel]} only
                        </button>
                    )}
                    {!readOnly && own && (
                        <button
                            type="button"
                            onClick={() => {
                                setContent((c) => withText(c, channel, made[channel]));
                                setEditing((e) => ({ ...e, [channel]: false }));
                            }}
                            className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline"
                        >
                            <RotateCcw className="size-3.5" aria-hidden /> Use my message again
                        </button>
                    )}
                </div>
                {(own || editing[channel]) && (
                    <>
                        <textarea
                            aria-label={label}
                            value={textOf(content, channel)}
                            onChange={(e) => setContent((c) => withText(c, channel, e.target.value))}
                            readOnly={readOnly}
                            rows={rows}
                            maxLength={max}
                            className={AREA}
                        />
                        {fieldError(channel === "email" ? "email.body" : `${channel}.text`)}
                    </>
                )}
            </div>
        );
    }

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

            {"results" in campaign.send ? (
                <section aria-label="Sent" className="flex gap-2 rounded-xl border border-success-ink/30 bg-success-bg p-4 text-sm text-success-ink">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>
                        <span className="font-semibold">Sent {formatWhen(campaign.send.sent_at)}</span> to{" "}
                        {customers(campaign.send.results?.sent ?? 0)} by email
                        {campaign.send.results?.failed ? `; ${campaign.send.results.failed} couldn't be delivered` : ""}.{" "}
                        <span className="font-semibold">
                            {campaign.visits.email} visit{campaign.visits.email === 1 ? "" : "s"} to your page from this email so far.
                        </span>{" "}
                        A sent campaign can&apos;t be changed or sent again; start a new campaign for your next message.
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
                            Check the previews below, then use the Send button at the bottom. Sending approves the wording as it is then.
                            Only the email is sent from here: you share on Facebook, WhatsApp and X yourself, with the buttons below.
                        </p>
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

            {/* One message, written once */}
            <section aria-labelledby="message-heading" className="rounded-xl border border-line bg-surface p-5 shadow-card">
                <h2 id="message-heading" className="font-semibold">Your message</h2>
                <p className="mt-1 text-[0.8125rem] text-muted">
                    Write it once: the email, Facebook post and WhatsApp message below are made from it as you type. The email adds a greeting
                    and your business&apos;s name, Facebook adds hashtags, and WhatsApp makes the first line bold. If one needs different words,
                    change it on its own under its preview.
                </p>
                <label className="mt-3 block text-sm font-semibold">
                    Email subject
                    <input
                        value={content.email.subject}
                        onChange={(e) => setContent((c) => ({ ...c, email: { ...c.email, subject: e.target.value } }))}
                        readOnly={readOnly}
                        maxLength={150}
                        className={AREA}
                    />
                    {fieldError("email.subject")}
                </label>
                <label className="mt-3 block text-sm font-semibold">
                    Message
                    <textarea
                        value={content.message ?? ""}
                        onChange={(e) => setMessage(e.target.value)}
                        readOnly={readOnly}
                        rows={12}
                        maxLength={5000}
                        className={AREA}
                    />
                    {fieldError("message")}
                </label>
                {!readOnly && content.message !== savedMessage && (
                    <p className="mt-1 text-xs text-soft">Not saved yet: use Save changes at the bottom.</p>
                )}
                <p className="mt-3 flex gap-2 text-[0.8125rem] text-muted">
                    <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>
                        In the previews, <span className="rounded bg-blue-100 px-0.5 text-blue-900">blue</span> parts come from your saved
                        business and product details. If something is wrong, update it in Products &amp; Services or My Business, then start
                        a new campaign: this one keeps the details it was made with.
                    </span>
                </p>
            </section>

            {/* Email */}
            <section aria-labelledby="email-heading" className="rounded-xl border border-line bg-surface p-5 shadow-card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 id="email-heading" className="font-semibold">Email</h2>
                    {(photos.length > 0 || emailHero) && (
                        <PhotoSwitch
                            label="Include photos in the email"
                            checked={content.email.photos !== false}
                            disabled={readOnly}
                            onChange={(on) => setPhotos("email", on)}
                        />
                    )}
                </div>
                {channelWording("email", "Email message", 14, 5000)}
                <div className="mt-4 flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">Preview</p>
                    <div role="group" aria-label="Preview colours" className="inline-flex rounded-[10px] border border-line p-0.5 text-xs font-medium">
                        {(["light", "dark"] as const).map((scheme) => (
                            <button
                                key={scheme}
                                type="button"
                                aria-pressed={emailScheme === scheme}
                                onClick={() => setEmailScheme(scheme)}
                                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 ${emailScheme === scheme ? "bg-brand-600 text-white" : "text-muted hover:text-ink"}`}
                            >
                                {scheme === "light" ? <Sun className="size-3.5" aria-hidden /> : <Moon className="size-3.5" aria-hidden />}
                                {scheme === "light" ? "Light" : "Dark"}
                            </button>
                        ))}
                    </div>
                </div>
                {/* Laid out like the sent email (backend/services/marketing/emailMessage.js). */}
                {(() => {
                    const t = EMAIL_THEME[emailScheme];
                    return (
                        <div aria-label="Email preview" data-scheme={emailScheme} className={`mx-auto mt-2 max-w-[600px] rounded-xl p-3 text-[0.8125rem] sm:p-4 ${t.page}`}>
                            <div className={`overflow-hidden rounded-xl border ${t.card}`}>
                                <div className={`flex items-center gap-2.5 border-b px-4 py-3 ${t.line}`}>
                                    {logo ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={logo} alt="" className="size-9 shrink-0 rounded-full object-cover" />
                                    ) : (
                                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#dbeafe] font-semibold text-[#1d4ed8]">{name.charAt(0)}</span>
                                    )}
                                    <span className="min-w-0 flex-1 leading-tight font-semibold">{name}</span>
                                    <span className={`inline-flex shrink-0 items-center gap-1 font-bold tracking-tight ${t.link}`}>
                                        <MapPin className="size-4 fill-current" strokeWidth={1.5} aria-hidden />
                                        Shahebbazar
                                    </span>
                                </div>
                                {content.email.photos !== false && emailHero && (
                                    <div className="px-4 pt-4">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={emailHero} alt="" className="block max-h-48 w-full rounded-lg object-cover" />
                                    </div>
                                )}
                                <div className="px-4 pt-4 pb-1">
                                    <p className={`text-xs ${t.muted}`}>
                                        Subject: <Marked text={content.email.subject} facts={facts} />
                                    </p>
                                    {follows("email") ? (
                                        <>
                                            <p className={`mt-3 ${t.muted}`}>{content.email.body.split("\n")[0]}</p>
                                            <p className="mt-1.5 text-base leading-snug font-bold">
                                                <Marked text={headline} facts={facts} />
                                            </p>
                                            <p className="mt-1.5 whitespace-pre-line">
                                                <Marked text={content.email.body.split("\n").slice(3).join("\n").replace(/^\n+/, "")} facts={facts} />
                                            </p>
                                        </>
                                    ) : (
                                        <p className="mt-3 whitespace-pre-line">
                                            <Marked text={content.email.body} facts={facts} />
                                        </p>
                                    )}
                                    {content.email.photos !== false && snapshot.listings.length > 0 && (
                                        <ul className="mt-3 space-y-2">
                                            {snapshot.listings.map((l) => {
                                                const src = browserAssetUrl(l.photo_url);
                                                const price = priceOf(l, bangla);
                                                return (
                                                    <li key={l.listing_id} className={`flex items-center gap-3 rounded-xl border p-2 ${t.line}`}>
                                                        {src && (
                                                            // eslint-disable-next-line @next/next/no-img-element
                                                            <img src={src} alt="" className="size-14 shrink-0 rounded-lg object-cover" />
                                                        )}
                                                        <span className="min-w-0">
                                                            <span className="block font-semibold">{bangla && l.title_bn ? l.title_bn : l.title}</span>
                                                            {price && <span className={`block font-semibold ${t.price}`}>{price}</span>}
                                                            <span className={`block text-xs font-semibold ${t.link}`}>{bangla ? "দেখুন" : "View"} →</span>
                                                        </span>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                    {coupon && coupon.status !== "expired" && (
                                        <div className={`mt-3 rounded-xl border-2 border-dashed p-3 text-center ${t.coupon}`}>
                                            <span className={`block text-[0.6875rem] font-semibold tracking-wider uppercase ${t.muted}`}>
                                                {bangla ? "আপনার কোড" : "Your code"}
                                            </span>
                                            <span className={`block text-lg font-bold tracking-[0.15em] ${t.code}`}>{coupon.code}</span>
                                        </div>
                                    )}
                                    {/* As in the sent email: replies come to your Messages on Shahebbazar. */}
                                    <span className="mt-4 inline-block rounded-lg bg-[#2563eb] px-4 py-2 text-[0.8125rem] font-bold text-white">
                                        {bangla ? "সাহেব বাজারে উত্তর দিন" : "Reply on Shahebbazar"}
                                    </span>
                                    <span className="mt-2 flex flex-wrap gap-1.5 pb-3 text-xs font-semibold">
                                        <span className={`rounded-lg border px-2.5 py-1 ${t.outline}`}>{bangla ? "আমাদের পেজ দেখুন" : "View our page"}</span>
                                        {snapshot.business.phone && (
                                            <span className={`rounded-lg border px-2.5 py-1 ${t.outline}`}>
                                                {bangla ? "কল করুন" : "Call"} {formatPhone(snapshot.business.phone)}
                                            </span>
                                        )}
                                        {snapshot.business.address && (
                                            <span className={`rounded-lg border px-2.5 py-1 ${t.outline}`}>{bangla ? "পথ দেখুন" : "Get directions"}</span>
                                        )}
                                    </span>
                                </div>
                                <div className={`flex flex-wrap items-center gap-1.5 border-t px-4 py-2.5 text-xs ${t.line} ${t.muted}`}>
                                    {bangla ? "পরিচিত কারও কাজে লাগবে? পাঠিয়ে দিন:" : "Know someone who'd like this? Send it on:"}
                                    <span className="rounded-full bg-green-600 px-2.5 py-0.5 font-semibold text-white">WhatsApp</span>
                                    <span className="rounded-full bg-[#1877f2] px-2.5 py-0.5 font-semibold text-white">Facebook</span>
                                </div>
                                <p className={`border-t px-4 py-3 text-[0.6875rem] ${t.line} ${t.soft} ${t.muted}`}>
                                    <span className={`font-semibold ${t.ink}`}>{name}</span>
                                    {snapshot.business.address ? ` · ${snapshot.business.address}` : ""}
                                    <br />
                                    You get this because you chose offers from {name}. <span className={`underline ${t.link}`}>Unsubscribe</span>
                                </p>
                            </div>
                        </div>
                    );
                })()}
                <p className="mt-1.5 text-center text-xs text-muted">Customers&apos; replies come to your Messages.</p>
            </section>

            {/* Facebook and WhatsApp */}
            <div className="grid gap-5 lg:grid-cols-2">
                <section aria-labelledby="facebook-heading" className="rounded-xl border border-line bg-surface p-5 shadow-card">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 id="facebook-heading" className="flex items-center gap-2 font-semibold">
                            Facebook post <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[0.6875rem] font-medium text-muted">You post this</span>
                        </h2>
                        {socialPhoto && (
                            <PhotoSwitch
                                label="Include a photo in the Facebook post"
                                checked={content.facebook.photos !== false}
                                disabled={readOnly}
                                onChange={(on) => setPhotos("facebook", on)}
                            />
                        )}
                    </div>
                    {channelWording("facebook", "Facebook post", 9, 2000)}
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
                    <ShareKit
                        vendorId={vendorId}
                        campaignId={campaign.campaign_id}
                        channel="facebook"
                        post={campaign.posts.facebook}
                        visits={campaign.visits.facebook}
                        blocked={shareBlocked}
                        viewOnly={viewOnly}
                        onChange={setCampaign}
                    />
                </section>
                <section aria-labelledby="whatsapp-heading" className="rounded-xl border border-line bg-surface p-5 shadow-card">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 id="whatsapp-heading" className="flex items-center gap-2 font-semibold">
                            WhatsApp message <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[0.6875rem] font-medium text-muted">You post this</span>
                        </h2>
                        {socialPhoto && (
                            <PhotoSwitch
                                label="Include a photo in the WhatsApp message"
                                checked={content.whatsapp.photos !== false}
                                disabled={readOnly}
                                onChange={(on) => setPhotos("whatsapp", on)}
                            />
                        )}
                    </div>
                    {channelWording("whatsapp", "WhatsApp message", 9, 1000)}
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
                    <ShareKit
                        vendorId={vendorId}
                        campaignId={campaign.campaign_id}
                        channel="whatsapp"
                        post={campaign.posts.whatsapp}
                        visits={campaign.visits.whatsapp}
                        blocked={shareBlocked}
                        viewOnly={viewOnly}
                        onChange={setCampaign}
                    />
                </section>
            </div>

            {/* Sharing, like the share menu on business and event pages */}
            {!viewOnly && (
                <section aria-labelledby="share-heading" className="rounded-xl border border-line bg-surface p-5 shadow-card">
                    <h2 id="share-heading" className="font-semibold">Share it</h2>
                    {shareBlocked ? (
                        <p className="mt-1.5 text-sm text-muted">{shareBlocked}</p>
                    ) : (
                        <div className="mt-3">
                            <ShareButtons
                                campaignId={campaign.campaign_id}
                                pageUrl={pageUrl}
                                facebook={content.facebook.text}
                                whatsapp={content.whatsapp.text}
                                headline={headline}
                                photo={content.facebook.photos !== false ? socialPhoto : null}
                            />
                        </div>
                    )}
                </section>
            )}

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
                    {notice && (
                        <span role={notice.ok ? "status" : "alert"} className={`text-sm ${notice.ok ? "text-success-ink" : "text-error-ink"}`}>
                            {notice.text}
                        </span>
                    )}
                    {["draft", "approved"].includes(campaign.status) && !posted && (
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
