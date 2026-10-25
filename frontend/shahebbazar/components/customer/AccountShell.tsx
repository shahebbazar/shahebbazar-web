import Link from "next/link";
import { AppShell } from "@/components/public/AppShell";

const TABS = [
    { key: "overview", label: "Overview", href: "/account" },
    { key: "details", label: "My details", href: "/account/details" },
    { key: "saved", label: "Saved businesses", href: "/account/saved" },
    { key: "messages", label: "Messages", href: "/account/messages" },
    { key: "reviews", label: "My reviews", href: "/account/reviews" },
    { key: "events", label: "My events", href: "/account/events" },
];

export function AccountShell({
    current,
    title,
    children,
}: {
    current: string;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <AppShell locale="en" current="/account">
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {/* On phones the tabs wrap as buttons so every one stays visible; from sm up they are an underlined tab row. */}
            <nav aria-label="Account" className="mt-4 sm:border-b sm:border-line">
                <ul className="flex flex-wrap gap-2 sm:flex-nowrap sm:gap-1">
                    {TABS.map((tab) => {
                        const active = tab.key === current;
                        return (
                            <li key={tab.key}>
                                <Link
                                    href={tab.href}
                                    aria-current={active ? "page" : undefined}
                                    className={`block rounded-full border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap sm:-mb-px sm:rounded-none sm:border-0 sm:border-b-2 sm:px-3 sm:py-2.5 ${
                                        active
                                            ? "border-brand-600 bg-brand-50 text-brand-600 sm:bg-transparent"
                                            : "border-line bg-surface text-muted hover:text-ink sm:border-transparent sm:bg-transparent"
                                    }`}
                                >
                                    {tab.label}
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </nav>
            <div className="mt-5">{children}</div>
        </AppShell>
    );
}
