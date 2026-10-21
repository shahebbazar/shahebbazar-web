"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Copy, ExternalLink, Image as ImageIcon, Loader2 } from "lucide-react";
import type { CampaignDetail, CampaignPost, PostChannel } from "@/lib/types";
import { markPosted, unmarkPosted } from "../actions";
import { formatWhen } from "../labels";

const BUTTON =
    "inline-flex items-center gap-1.5 rounded-[10px] border border-line-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-2 disabled:opacity-50";
const NAMES: Record<PostChannel, string> = { facebook: "Facebook", whatsapp: "WhatsApp" };

/**
 * Facebook and WhatsApp aren't connected to Shaheb Bazar, so the owner posts these themselves:
 * copy the text, open WhatsApp with the message filled in (WhatsApp's own wa.me link), or open
 * Facebook's share box with the business page and its preview card, then paste. Afterwards they mark
 * it as posted, with a link to the post if they have one, so it shows in the results. Offered only
 * for saved wording with nothing left to fill in; admins see whether it was posted.
 */
export function ShareKit({
    vendorId,
    campaignId,
    channel,
    text,
    pageUrl,
    photo,
    post,
    blocked,
    viewOnly,
    onChange,
}: {
    vendorId: number;
    campaignId: number;
    channel: PostChannel;
    text: string;
    pageUrl: string;
    photo: string | null;
    post: CampaignPost | null;
    /** Why the tools aren't offered yet (unsaved changes, parts to fill in), or null. */
    blocked: string | null;
    viewOnly: boolean;
    onChange: (campaign: CampaignDetail) => void;
}) {
    const name = NAMES[channel];
    const [copied, setCopied] = useState<string | null>(null);
    const [url, setUrl] = useState(post?.url ?? "");
    const [editing, setEditing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    async function copy() {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(`Copied. Paste it into ${channel === "facebook" ? "your Facebook post" : "WhatsApp"}.`);
        } catch {
            setCopied("Couldn't copy here. Select the text above and copy it instead.");
        }
    }

    function save() {
        setError(null);
        startTransition(async () => {
            const result = await markPosted(vendorId, campaignId, channel, url);
            if (result.ok) {
                onChange(result.data);
                setEditing(false);
                setUrl(result.data.posts[channel]?.url ?? "");
            } else {
                setError(result.errors?.url ?? result.error);
            }
        });
    }

    function undo() {
        setError(null);
        startTransition(async () => {
            const result = await unmarkPosted(vendorId, campaignId, channel);
            if (result.ok) {
                onChange(result.data);
                setUrl("");
            } else {
                setError(result.error);
            }
        });
    }

    const posted = post && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-success-ink">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden />
            <span>
                <span className="font-semibold">Posted on {name}</span> · marked {formatWhen(post.posted_at)}
                {post.version_number ? ` (version ${post.version_number})` : ""}
                {post.marked_by ? ` by ${post.marked_by}` : ""}
            </span>
            {post.url && (
                <a href={post.url} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-600 hover:underline">
                    View post
                </a>
            )}
        </p>
    );

    if (viewOnly) {
        return <div className="mt-3">{posted || <p className="text-xs text-muted">Not marked as posted on {name}.</p>}</div>;
    }

    if (blocked) {
        return (
            <div className="mt-3 space-y-2">
                {posted}
                <p className="text-xs text-muted">{blocked}</p>
            </div>
        );
    }

    const open =
        channel === "whatsapp"
            ? { href: `https://wa.me/?text=${encodeURIComponent(text)}`, label: "Open in WhatsApp" }
            : { href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`, label: "Open Facebook" };

    return (
        <div aria-label={`Post on ${name}`} role="group" className="mt-3 space-y-3 rounded-lg border border-line bg-surface-2 p-3">
            <p className="text-xs text-muted">
                {channel === "whatsapp"
                    ? "Opens WhatsApp with this message filled in; choose who to send it to, or post it to your Status."
                    : "Copy the text, then open Facebook: it starts a post with your business page's link and its preview, and you paste the text above it."}
                {photo && " Add the photo yourself if you want it."}
            </p>
            <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={copy} className={BUTTON}>
                    <Copy className="size-4" aria-hidden /> Copy text
                </button>
                <a href={open.href} target="_blank" rel="noopener noreferrer" className={BUTTON}>
                    <ExternalLink className="size-4" aria-hidden /> {open.label}
                </a>
                {photo && (
                    <a href={photo} target="_blank" rel="noopener noreferrer" className={BUTTON}>
                        <ImageIcon className="size-4" aria-hidden /> Open the photo
                    </a>
                )}
            </div>
            {copied && (
                <p role="status" className="text-xs text-success-ink">
                    {copied}
                </p>
            )}

            <div className="border-t border-line pt-3">
                {posted && !editing ? (
                    <div className="space-y-2">
                        {posted}
                        <div className="flex flex-wrap gap-3 text-[0.8125rem]">
                            <button type="button" onClick={() => setEditing(true)} disabled={pending} className="font-medium text-brand-600 hover:underline">
                                {post?.url ? "Change the link" : "Add a link to the post"}
                            </button>
                            <button type="button" onClick={undo} disabled={pending} className="font-medium text-muted hover:underline">
                                Not posted yet? Undo
                            </button>
                        </div>
                    </div>
                ) : (
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            save();
                        }}
                        className="space-y-2"
                    >
                        <label className="block text-[0.8125rem] font-medium">
                            {post ? "Link to the post" : `Posted it? Mark it here so it shows in your results.`}
                            <input
                                type="text"
                                inputMode="url"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                placeholder={`Link to the ${name} post (optional)`}
                                maxLength={500}
                                aria-invalid={Boolean(error)}
                                className="mt-1 w-full rounded-[10px] border border-line-strong bg-surface px-3 py-2 text-sm font-normal outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-100"
                            />
                        </label>
                        {error && (
                            <p role="alert" className="text-xs text-error-ink">
                                {error}
                            </p>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                            <button type="submit" disabled={pending} className={BUTTON}>
                                {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                                {post ? "Save link" : "Mark as posted"}
                            </button>
                            {editing && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEditing(false);
                                        setUrl(post?.url ?? "");
                                        setError(null);
                                    }}
                                    className="text-[0.8125rem] font-medium text-muted hover:underline"
                                >
                                    Cancel
                                </button>
                            )}
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
