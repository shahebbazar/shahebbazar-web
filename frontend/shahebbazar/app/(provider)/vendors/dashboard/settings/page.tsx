import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { authenticatedApiGet, getViewer } from "@/lib/auth-server";
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
    const [vendor, owner, members, viewer] = await Promise.all([
        authenticatedApiGet<VendorSummary>(`/vendors/${vendorId}/summary`),
        authenticatedApiGet<OwnerDetails>(`/vendors/${vendorId}/owner`),
        authenticatedApiGet<BusinessMember[]>(`/vendors/${vendorId}/members`),
        getViewer(),
    ]);
    if (!vendor || !owner) notFound();
    // Admins see the owner's details and the team read-only; each member edits their own details.
    const adminView = viewer?.user_role === "admin";

    return (
        <ProviderShell vendor={vendor} current="settings">
            <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">Settings</h1>
            <p className="mt-1.5 mb-5 text-[0.9375rem] text-muted">
                {adminView ? "The owner's contact details, and who manages this business." : "Your own contact details, and who can manage this business."}
            </p>
            {adminView ? (
                <dl className="max-w-md rounded-xl border border-line bg-surface p-5 text-sm shadow-card">
                    <dt className="text-muted">Owner</dt>
                    <dd className="font-medium">{owner.user_name}</dd>
                    <dt className="mt-3 text-muted">Phone</dt>
                    <dd className="font-medium">{owner.user_phone}</dd>
                    <dt className="mt-3 text-muted">Email</dt>
                    <dd className="font-medium">{owner.user_email ?? "Not added"}</dd>
                </dl>
            ) : (
                <SettingsForm vendorId={vendorId} owner={owner} />
            )}
            <TeamSection vendorId={vendorId} members={members ?? []} isOwner={!adminView && owner.member_role === "owner"} />
        </ProviderShell>
    );
}
