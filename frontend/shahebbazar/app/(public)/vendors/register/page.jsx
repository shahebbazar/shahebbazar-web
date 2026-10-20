import Link from "next/link";
import { Building2 } from "lucide-react";
import { AppShell } from "@/components/public/AppShell";
import { VendorRegistrationForm } from "@/components/auth/VendorRegistrationForm";
import { authenticatedApiGet } from "@/lib/auth-server";
import { apiGet } from "@/lib/api";

export const metadata = {
    title: "Register your business",
    description:
        "Create a Shahebbazar business account and list your business in Rajshahi's local directory.",
};

export default async function VendorRegisterPage() {
    const [session, settings] = await Promise.all([
        authenticatedApiGet("/auth/me"),
        apiGet("/settings/public").catch(() => null),
    ]);
    // What happens after registering depends on the admin's approval setting (KAN-293).
    const next =
        settings && settings.require_business_approval === false
            ? "Your business is public as soon as you register."
            : "Your business appears publicly once our team approves it.";
    const user = session?.user ?? null;
    // Signed-in customers and vendors add the business to their own account (KAN-249).
    const account = user && user.user_role !== "admin" ? { name: user.user_name, phone: user.user_phone } : undefined;

    return (
        <AppShell locale="en" current="add-business">
            <div className="mx-auto w-full max-w-3xl py-6 sm:py-10">
                <header className="text-center">
                    <span className="mx-auto grid size-12 place-items-center rounded-xl bg-brand-50 text-brand-600">
                        <Building2 className="size-6" />
                    </span>

                    <h1 className="mt-4 text-3xl font-bold text-ink">
                        {account ? "Add a business to your account" : "Register your business"}
                    </h1>

                    <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted">
                        {account
                            ? `Fill in the business details below. ${next}`
                            : `Create a business account for Shahebbazar. ${next}`}
                    </p>

                    {!user && (
                        <p className="mt-3 text-sm text-muted">
                            Already have a customer account?{" "}
                            <Link href="/login" className="font-medium text-brand-600 hover:underline">
                                Log in
                            </Link>{" "}
                            first and the business will be added to it.
                        </p>
                    )}
                </header>

                <div className="mt-8">
                    {user?.user_role === "admin" ? (
                        <p className="form-status-error">Administrator accounts cannot register a business.</p>
                    ) : (
                        <VendorRegistrationForm account={account} />
                    )}
                </div>
            </div>
        </AppShell>
    );
}
