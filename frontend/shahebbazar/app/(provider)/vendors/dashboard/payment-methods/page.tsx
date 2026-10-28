import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { authenticatedApiGet } from "@/lib/auth-server";
import type { VendorPaymentMethods } from "@/lib/types";
import { ProviderShell, parseVendorParam, dashboardFor } from "@/components/provider/ProviderShell";
import { providerText } from "@/lib/i18n-provider";
import { getAccountLocale } from "@/lib/locale-server";
import { PaymentMethodsForm } from "./PaymentMethodsForm";

export const metadata: Metadata = {
    title: "Payment methods",
};

type Query = { vendor?: string };

export default async function PaymentMethodsPage({
    searchParams,
}: {
    searchParams: Promise<Query>;
}) {
    // The API only returns the business to its owner or an admin.
    const vendorId = parseVendorParam((await searchParams).vendor);
    if (vendorId === null) redirect(dashboardFor("/vendors/dashboard/payment-methods"));

    const data = await authenticatedApiGet<VendorPaymentMethods>(`/vendors/${vendorId}/payment-methods`);
    if (!data) notFound();

    const { vendor: business, methods } = data;
    const isApproved = business.vendor_status === "approved";

    const copy = providerText(await getAccountLocale());
    return (
        <ProviderShell vendor={business} current="payments">
            <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">{copy.navPayments}</h1>
            <p className="mt-1.5 max-w-2xl text-[0.9375rem] leading-relaxed text-muted">
                {copy.paymentsIntro}
            </p>

            <div className="mt-6 max-w-md rounded-xl border border-line bg-surface p-5 shadow-card">
                {!isApproved && (
                    <p className="mb-5 rounded-lg bg-sponsor-bg p-3 text-sm text-sponsor-ink">
                        Your business is awaiting approval. Methods you save now appear on your
                        profile once it is approved.
                    </p>
                )}

                <PaymentMethodsForm vendorId={business.vendor_id} initialMethods={methods} />

                {isApproved && (
                    <Link
                        href={`/business/${business.vendor_slug}`}
                        className="form-button-secondary mt-3"
                    >
                        View public profile
                    </Link>
                )}
            </div>
        </ProviderShell>
    );
}
