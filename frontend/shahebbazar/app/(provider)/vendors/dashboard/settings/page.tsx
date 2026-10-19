import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { authenticatedApiGet } from "@/lib/auth-server";
import { ProviderShell, parseVendorParam } from "@/components/provider/ProviderShell";
import type { BusinessMember, OwnerDetails, VendorSummary } from "@/lib/types";
import { SettingsForm } from "./SettingsForm";
import { TeamSection } from "./TeamSection";

export const metadata: Metadata = {
    title: "Settings",
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ vendor?: string }> }) {
    const vendorId = parseVendorParam((await searchParams).vendor);
    if (vendorId === null) redirect("/vendors/dashboard");
    const [vendor, owner, members] = await Promise.all([
        authenticatedApiGet<VendorSummary>(`/vendors/${vendorId}/summary`),
        authenticatedApiGet<OwnerDetails>(`/vendors/${vendorId}/owner`),
        authenticatedApiGet<BusinessMember[]>(`/vendors/${vendorId}/members`),
    ]);
    if (!vendor || !owner) notFound();

    return (
        <ProviderShell vendor={vendor} current="settings">
            <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">Settings</h1>
            <p className="mt-1.5 mb-5 text-[0.9375rem] text-muted">Your own contact details, and who can manage this business.</p>
            <SettingsForm vendorId={vendorId} owner={owner} />
            <TeamSection vendorId={vendorId} members={members ?? []} isOwner={owner.member_role === "owner"} />
        </ProviderShell>
    );
}
