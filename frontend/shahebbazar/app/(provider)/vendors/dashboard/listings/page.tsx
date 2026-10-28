import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { authenticatedApiGet } from "@/lib/auth-server";
import { apiGet } from "@/lib/api";
import type { PublicSettings, VendorSummary } from "@/lib/types";
import { ProviderShell, parseVendorParam, dashboardFor } from "@/components/provider/ProviderShell";
import { providerText } from "@/lib/i18n-provider";
import { getAccountLocale } from "@/lib/locale-server";
import { ListingsManager } from "./ListingsManager";

export const metadata: Metadata = {
    title: "Products & services",
};

// Add, edit and delete listings.
export default async function ListingsPage({
    searchParams,
}: {
    searchParams: Promise<{ vendor?: string }>;
}) {
    // The API only returns the business to its owner or an admin.
    const vendorId = parseVendorParam((await searchParams).vendor);
    if (vendorId === null) redirect(dashboardFor("/vendors/dashboard/listings"));

    const [vendor, settings] = await Promise.all([
        authenticatedApiGet<VendorSummary>(`/vendors/${vendorId}/summary`),
        apiGet<PublicSettings>("/settings/public").catch(() => null),
    ]);
    if (!vendor) notFound();

    const copy = providerText(await getAccountLocale());
    return (
        <ProviderShell vendor={vendor} current="listings">
            <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">
                {copy.navListings}
            </h1>
            <p className="mt-1.5 text-[0.9375rem] text-muted">
                {settings?.require_listing_approval ? copy.listingsIntroApproval : copy.listingsIntroDirect}
            </p>

            <ListingsManager vendorId={vendor.vendor_id} />
        </ProviderShell>
    );
}
