"use client";

import { useState } from "react";
import { Copy, Image as ImageIcon } from "lucide-react";
import { SiFacebook, SiWhatsapp, SiX } from "@icons-pack/react-simple-icons";
import { campaignLink, swapPageUrl } from "@/lib/analytics";

const BUTTON =
    "inline-flex items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:border-brand-600 hover:text-brand-600";

/**
 * One row of share buttons for a campaign, like the share menu on business and event pages: each opens
 * that site's own share page in a new tab. WhatsApp and X fill in the wording; Facebook only takes a
 * link (it shows the page's preview card), so its post text is copied first for the owner to paste.
 * Facebook and WhatsApp links carry the channel and campaign, so their visits count in the results;
 * X isn't one of the tracked channels, so its link is the plain page.
 */
export function ShareButtons({
    campaignId,
    pageUrl,
    facebook,
    whatsapp,
    headline,
    photo,
}: {
    campaignId: number;
    pageUrl: string;
    /** The saved Facebook post and WhatsApp message. */
    facebook: string;
    whatsapp: string;
    /** A short line for X: the message's first line. */
    headline: string;
    photo: string | null;
}) {
    const [note, setNote] = useState<string | null>(null);
    const fbLink = campaignLink(pageUrl, "facebook", campaignId);
    const waLink = campaignLink(pageUrl, "whatsapp", campaignId);
    const fbText = swapPageUrl(facebook, pageUrl, fbLink);
    const waText = swapPageUrl(whatsapp, pageUrl, waLink);
    // X allows 280 characters, with a link counted as 23.
    const xText = headline.replace(/\*/g, "").slice(0, 240);

    async function copy(text: string, done: string) {
        try {
            await navigator.clipboard.writeText(text);
            setNote(done);
        } catch {
            setNote("Couldn't copy here. Select the text in the preview and copy it instead.");
        }
    }

    return (
        <div aria-label="Share" role="group" className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
                <a
                    href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(fbLink)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => copy(fbText, "Your Facebook post is copied: paste it above the link in the box that opened.")}
                    className={BUTTON}
                >
                    <SiFacebook size={16} color="#1877F2" aria-hidden /> Facebook
                </a>
                <a href={`https://wa.me/?text=${encodeURIComponent(waText)}`} target="_blank" rel="noopener noreferrer" className={BUTTON}>
                    <SiWhatsapp size={16} color="#25D366" aria-hidden /> WhatsApp
                </a>
                <a
                    href={`https://x.com/intent/post?text=${encodeURIComponent(xText)}&url=${encodeURIComponent(pageUrl)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={BUTTON}
                >
                    <SiX size={14} aria-hidden /> X
                </a>
                <button type="button" onClick={() => copy(fbText, "Copied. Paste it wherever you like.")} className={BUTTON}>
                    <Copy className="size-4" aria-hidden /> Copy text
                </button>
                {photo && (
                    <a href={photo} target="_blank" rel="noopener noreferrer" className={BUTTON}>
                        <ImageIcon className="size-4" aria-hidden /> Open the photo
                    </a>
                )}
            </div>
            <p className="text-xs text-muted">
                Each opens in a new tab. WhatsApp and X start with your wording filled in; Facebook starts a post with your page&apos;s
                preview, and your post text is copied for you to paste.{photo && " Add the photo yourself if you want it."}
            </p>
            {note && (
                <p role="status" className="text-xs text-success-ink">
                    {note}
                </p>
            )}
        </div>
    );
}
