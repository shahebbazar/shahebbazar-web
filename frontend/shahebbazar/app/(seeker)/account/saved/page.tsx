import type { Metadata } from "next";
import Link from "next/link";
import { AccountShell } from "@/components/customer/AccountShell";
import { BusinessCard } from "@/components/shared/BusinessCard";
import { OfferChoices } from "@/components/customer/OfferChoices";
import { authenticatedApiGet } from "@/lib/auth-server";
import type { Customer, SavedBusiness } from "@/lib/types";

export const metadata: Metadata = {
    title: "Saved businesses",
};

export default async function SavedPage() {
    const [saved, me] = await Promise.all([
        authenticatedApiGet<SavedBusiness[]>("/me/saved").then((rows) => rows ?? []),
        authenticatedApiGet<Customer>("/me"),
    ]);
    const hasEmail = Boolean(me?.user_email);
    return (
        <AccountShell current="saved" title="Saved businesses">
            {saved.length > 0 && (
                <p className="mb-4 text-sm text-muted">
                    Tick SMS or email under a business to get its offers. Untick to stop them at any time; every
                    offer also has a link to stop it. Offers by SMS are coming soon: until then, businesses send them by email.
                    {!hasEmail && (
                        <>
                            {" "}For offers by email,{" "}
                            <Link href="/account/details#email" className="font-medium text-brand-600 hover:underline">
                                add an email address
                            </Link>
                            .
                        </>
                    )}
                </p>
            )}
            {saved.length === 0 ? (
                <p className="text-sm text-muted">
                    Nothing saved yet. Tap the bookmark on any business to keep it here.{" "}
                    <Link href="/search" className="font-medium text-brand-600 hover:underline">
                        Find businesses
                    </Link>
                </p>
            ) : (
                <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {saved.map((business) => (
                        <li key={business.vendor_id} className="flex flex-col">
                            {/* The card fills the space above its offer choices, so rows line up without overlapping. */}
                            <div className="flex-1">
                                <BusinessCard locale="en" business={business} />
                            </div>
                            <OfferChoices
                                vendorId={business.vendor_id}
                                businessName={business.vendor_name}
                                initial={business.offer_channels}
                                hasEmail={hasEmail}
                            />
                        </li>
                    ))}
                </ul>
            )}
        </AccountShell>
    );
}
