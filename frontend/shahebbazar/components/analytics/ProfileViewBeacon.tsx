"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { sendAnalytics, viewSource, type ViewSource } from "@/lib/analytics";

// Where a marked link came from: the Sponsored results (?from=sponsored), or a marketing campaign's
// email, Facebook or WhatsApp link (?from=email&c=<campaign>, KAN-287).
const MARKED: ViewSource[] = ["sponsored", "email", "facebook", "whatsapp"];

// Reports one view of a business profile once it is on screen. A marked link is counted with its
// source (and campaign), then the marks are taken out of the address, so a reload or a copied link
// isn't counted that way again.
export function ProfileViewBeacon({ slug }: { slug: string }) {
    const pathname = usePathname();

    useEffect(() => {
        const url = new URL(window.location.href);
        const from = url.searchParams.get("from") as ViewSource | null;
        const marked = from && MARKED.includes(from) ? from : null;
        const campaign = Number(url.searchParams.get("c"));
        if (url.searchParams.has("from") || url.searchParams.has("c")) {
            url.searchParams.delete("from");
            url.searchParams.delete("c");
            window.history.replaceState(window.history.state, "", url);
        }
        sendAnalytics("/api/track/view", {
            slug,
            source: marked ?? viewSource(pathname),
            ...(marked && marked !== "sponsored" && Number.isSafeInteger(campaign) && campaign > 0 ? { campaign } : {}),
        });
    }, [slug, pathname]);

    return null;
}
