import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { authenticatedApiGet } from "@/lib/auth-server";
import type {
    VendorProfileWithOptions,
} from "@/lib/types";
import { ProviderShell, parseVendorParam, dashboardFor } from "@/components/provider/ProviderShell";
import { providerText } from "@/lib/i18n-provider";
import { getAccountLocale } from "@/lib/locale-server";
import { BusinessForm } from "./BusinessForm";

export const metadata: Metadata = {
    title: "Edit business",
};

export default async function EditBusinessPage({
    searchParams,
}: {
    searchParams: Promise<{ vendor?: string }>;
}) {
    // Ownership is verified by the protected backend profile route.
    const vendorId = parseVendorParam((await searchParams).vendor);
    if (vendorId === null) redirect(dashboardFor("/vendors/dashboard/business"));

    const profile =
        await authenticatedApiGet<VendorProfileWithOptions>(`/vendors/${vendorId}/profile`);

    if (!profile) notFound();

    const copy = providerText(await getAccountLocale());
    return (
        <ProviderShell vendor={profile.vendor} current="business">
            <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">{copy.businessTitle}</h1>
            <p className="mt-1.5 mb-6 text-[0.9375rem] text-muted">
                {copy.businessIntro}
            </p>
            <BusinessForm initial={profile} />
        </ProviderShell>
    );
}
