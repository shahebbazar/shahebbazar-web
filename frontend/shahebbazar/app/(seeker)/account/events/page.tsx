import type { Metadata } from "next";
import Link from "next/link";
import { AccountShell } from "@/components/customer/AccountShell";
import { EventCard } from "@/components/public/EventCard";
import { authenticatedApiGet } from "@/lib/auth-server";
import { t } from "@/lib/i18n";
import type { MyEvent } from "@/lib/types";

export const metadata: Metadata = {
    title: "My events",
};

// Events the customer marked Interested or Going (KAN-298), upcoming first.
export default async function MyEventsPage() {
    const events = (await authenticatedApiGet<MyEvent[]>("/me/events")) ?? [];
    const copy = t("en");
    const upcoming = events.filter((e) => !e.ended);
    const past = events.filter((e) => e.ended);

    const grid = (list: MyEvent[], isPast = false) => (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((event) => (
                <li key={event.event_id}>
                    <EventCard
                        event={event}
                        locale="en"
                        copy={copy}
                        past={isPast}
                        badge={
                            <span className="rounded-full bg-brand-50 px-2 py-0.5 tracking-normal text-brand-700 normal-case">
                                {event.response_type === "going" ? "You're going" : "You're interested"}
                            </span>
                        }
                    />
                </li>
            ))}
        </ul>
    );

    return (
        <AccountShell current="events" title="My events">
            {events.length === 0 ? (
                <p className="text-sm text-muted">
                    No events yet. Tap Interested or Going on an event to keep it here.{" "}
                    <Link href="/events" className="font-medium text-brand-600 hover:underline">
                        See what&apos;s on
                    </Link>
                </p>
            ) : (
                <>
                    {upcoming.length > 0 ? grid(upcoming) : <p className="text-sm text-muted">Nothing coming up.</p>}
                    {past.length > 0 && (
                        <>
                            <h2 className="mt-8 mb-3 text-[1.0625rem] font-semibold">Past events</h2>
                            {grid(past, true)}
                        </>
                    )}
                </>
            )}
        </AccountShell>
    );
}
