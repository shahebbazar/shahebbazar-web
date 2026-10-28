"use client";

import {
    ChevronDown,
    Monitor,
    Moon,
    Sun,
} from "lucide-react";
import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { t, type Locale } from "@/lib/i18n";

const THEME_OPTIONS = [
    {
        value: "light",
        label: "themeLight",
    },
    {
        value: "dark",
        label: "themeDark",
    },
    {
        value: "system",
        label: "themeSystem",
    },
] as const;

function subscribeToHydration() {
    return () => {};
}

function useHasMounted() {
    return useSyncExternalStore(
        subscribeToHydration,
        () => true,
        () => false
    );
}

export function ThemeSelector({
    className = "",
    locale = "en",
}: {
    className?: string;
    locale?: Locale;
}) {
    const copy = t(locale);
    const {
        theme,
        resolvedTheme,
        setTheme,
    } = useTheme();

    const hasMounted = useHasMounted();

    if (!hasMounted) {
        return (
            <div
                className={`h-9 min-w-[112px] shrink-0 rounded-lg border border-line-strong bg-surface-2 ${className}`}
                aria-hidden="true"
            />
        );
    }

    const selectedTheme = theme ?? "system";

    const SelectedIcon =
        selectedTheme === "system"
            ? Monitor
            : resolvedTheme === "dark"
              ? Moon
              : Sun;

    return (
        <label
            className={`relative inline-flex min-w-[112px] shrink-0 items-center ${className}`}
        >
            <span className="sr-only">
                {copy.appearance}
            </span>

            <SelectedIcon
                className="pointer-events-none absolute left-3 size-4 text-muted"
                aria-hidden="true"
            />

            <select
                aria-label={copy.appearance}
                value={selectedTheme}
                onChange={(event) => {
                    setTheme(event.target.value);
                }}
                className="h-9 w-full appearance-none rounded-lg border border-line-strong bg-surface py-1.5 pr-7 pl-9 text-[0.8125rem] font-medium text-ink outline-none transition-colors hover:border-brand-500 focus:border-brand-500 focus:ring-3 focus:ring-brand-100"
            >
                {THEME_OPTIONS.map((option) => (
                    <option
                        key={option.value}
                        value={option.value}
                    >
                        {copy[option.label]}
                    </option>
                ))}
            </select>

            <ChevronDown
                className="pointer-events-none absolute right-3 size-3.5 text-muted"
                aria-hidden="true"
            />
        </label>
    );
}