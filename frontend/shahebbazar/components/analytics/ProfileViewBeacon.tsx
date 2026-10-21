"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { sendAnalytics, viewSource } from "@/lib/analytics";

// Reports one view of a business profile once it is on screen. A link from the Sponsored results
// carries ?from=sponsored; it is counted as a sponsored view and then taken out of the address, so a
// reload or a copied link isn't counted as sponsored again.
export function ProfileViewBeacon({ slug }: { slug: string }) {
    const pathname = usePathname();

    useEffect(() => {
        const url = new URL(window.location.href);
        const sponsored = url.searchParams.get("from") === "sponsored";
        if (sponsored) {
            url.searchParams.delete("from");
            window.history.replaceState(window.history.state, "", url);
        }
        sendAnalytics("/api/track/view", { slug, source: sponsored ? "sponsored" : viewSource(pathname) });
    }, [slug, pathname]);

    return null;
}
