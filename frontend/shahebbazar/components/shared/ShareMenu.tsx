"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, Link2, Share2 } from "lucide-react";
import { SiFacebook, SiWhatsapp, SiX } from "@icons-pack/react-simple-icons";

// Share links for a page (KAN-245). Plain links work without JavaScript;
// "Copy link" and the phone's own share sheet are added once it loads.

const TEXT = {
    en: { copy: "Copy link", copied: "Link copied", more: "More options" },
    bn: { copy: "লিংক কপি করুন", copied: "লিংক কপি হয়েছে", more: "আরও অপশন" },
};

export function ShareMenu({
    url,
    title,
    label,
    locale = "en",
    align = "right",
    className = "",
}: {
    /** Absolute URL of the page being shared. */
    url: string;
    title: string;
    label: string;
    locale?: "en" | "bn";
    /** Which edge of the button the menu lines up with. */
    align?: "left" | "right";
    className?: string;
}) {
    const text = TEXT[locale];
    const [copied, setCopied] = useState(false);
    // False on the server, then whatever the browser supports.
    const canShare = useSyncExternalStore(
        () => () => {},
        () => typeof navigator.share === "function",
        () => false
    );

    const encoded = encodeURIComponent(url);
    const links = [
        { name: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(`${title} — ${url}`)}`, Icon: SiWhatsapp },
        { name: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encoded}`, Icon: SiFacebook },
        { name: "X", href: `https://x.com/intent/post?url=${encoded}&text=${encodeURIComponent(title)}`, Icon: SiX },
    ];
    const item = "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink hover:bg-surface-2";

    async function copy() {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            window.prompt(text.copy, url);
        }
    }

    return (
        <details className={`group relative ${className}`}>
            <summary className="inline-flex w-full cursor-pointer list-none items-center justify-center gap-2 rounded-[10px] border border-line-strong bg-surface px-3 py-2.5 text-sm font-medium text-ink transition-colors hover:border-brand-600 hover:text-brand-600 [&::-webkit-details-marker]:hidden">
                <Share2 className="size-4" />
                {label}
            </summary>

            <div className={`absolute ${align === "left" ? "left-0" : "right-0"} z-30 mt-2 w-56 rounded-xl border border-line bg-surface p-1.5 shadow-raised`}>
                {links.map(({ name, href, Icon }) => (
                    <a key={name} href={href} target="_blank" rel="noopener noreferrer" className={item}>
                        <Icon size={16} />
                        {name}
                    </a>
                ))}
                <button type="button" onClick={copy} className={item}>
                    {copied ? <Check className="size-4 text-success-ink" /> : <Link2 className="size-4" />}
                    {copied ? text.copied : text.copy}
                </button>
                {canShare && (
                    <button type="button" onClick={() => navigator.share({ title, url }).catch(() => {})} className={item}>
                        <Share2 className="size-4" />
                        {text.more}
                    </button>
                )}
            </div>
        </details>
    );
}
