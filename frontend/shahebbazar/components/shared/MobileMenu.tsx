"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { t, type Locale } from "@/lib/i18n";

// Hamburger menu for phones and tablets; the side rail takes over from lg up.
export function MobileMenu({ label, locale = "en", children }: { label?: string; locale?: Locale; children: React.ReactNode }) {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
        document.addEventListener("keydown", onKey);
        document.body.style.overflow = "hidden";
        return () => {
            document.removeEventListener("keydown", onKey);
            document.body.style.overflow = "";
        };
    }, [open]);

    return (
        <div className="lg:hidden">
            <button
                type="button"
                aria-label={open ? t(locale).closeMenu : (label ?? t(locale).menu)}
                aria-expanded={open}
                aria-controls="mobile-menu"
                onClick={() => setOpen(!open)}
                className="grid size-10 place-items-center rounded-[10px] border border-line-strong text-ink transition-colors hover:bg-surface-2"
            >
                {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>

            {open && (
                <>
                    <div
                        aria-hidden
                        onClick={() => setOpen(false)}
                        className="fixed inset-x-0 top-16 bottom-0 z-40 bg-ink/30"
                    />
                    <div
                        id="mobile-menu"
                        // Close after picking a link so the menu doesn't linger over the next page.
                        onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}
                        className="fixed inset-x-0 top-16 z-50 max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-line bg-surface p-4 shadow-lg"
                    >
                        {children}
                    </div>
                </>
            )}
        </div>
    );
}
