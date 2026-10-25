"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { registerCustomer, requestVerification } from "@/lib/auth-client";
import { CodeHint } from "./CodeHint";

type Stage = "details" | "verification";

export function CustomerRegistrationForm() {
    const router = useRouter();

    const [stage, setStage] = useState<Stage>("details");
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [code, setCode] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function handleRequestCode(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true);
        setError(null);

        const result = await requestVerification({
            phone,
            purpose: "register",
        });

        setBusy(false);

        if (!result.ok) {
            setError(result.error);
            return;
        }

        setStage("verification");
    }

    async function handleRegistration(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true);
        setError(null);

        const result = await registerCustomer({
            name,
            phone,
            email,
            code,
        });

        setBusy(false);

        if (!result.ok) {
            setError(result.error);
            return;
        }

        router.push("/account");
        router.refresh();
    }

    function returnToDetails() {
        setStage("details");
        setCode("");
        setError(null);
    }

    if (stage === "details") {
        return (
            <form onSubmit={handleRequestCode} className="space-y-4">
                <div>
                    <label
                        htmlFor="customer-register-name"
                        className="mb-1.5 block text-sm font-medium text-ink"
                    >
                        Full name
                    </label>
                    <input
                        id="customer-register-name"
                        name="name"
                        type="text"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Your full name"
                        autoComplete="name"
                        className="form-input mb-0"
                        maxLength={120}
                        required
                    />
                </div>

                <div>
                    <label
                        htmlFor="customer-register-phone"
                        className="mb-1.5 block text-sm font-medium text-ink"
                    >
                        Phone number
                    </label>
                    <input
                        id="customer-register-phone"
                        name="phone"
                        type="tel"
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        placeholder="Local or international mobile number"
                        autoComplete="tel"
                        className="form-input mb-0"
                        required
                    />
                    <p className="mt-1.5 text-xs leading-5 text-muted">
                        Enter your Bangladesh mobile number, for example +8801712345678.
                    </p>
                </div>

                <div>
                    <label
                        htmlFor="customer-register-email"
                        className="mb-1.5 block text-sm font-medium text-ink"
                    >
                        Email address{" "}
                        <span className="font-normal text-muted">(optional)</span>
                    </label>
                    <input
                        id="customer-register-email"
                        name="email"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="name@example.com"
                        autoComplete="email"
                        className="form-input mb-0"
                    />
                </div>

                {error && (
                    <div role="alert" className="form-status-error mb-0">
                        {error}
                    </div>
                )}

                <button
                    type="submit"
                    className="form-button-primary disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={busy}
                >
                    {busy ? "Sending verification code..." : "Continue with phone verification"}
                </button>

                <div className="border-t border-line pt-4 text-center">
                    <p className="mb-3 text-sm text-muted">Already have an account?</p>
                    <Link href="/login" className="text-sm font-medium text-brand hover:underline">
                        Return to login
                    </Link>
                </div>
            </form>
        );
    }

    return (
        <form onSubmit={handleRegistration} className="space-y-4">
            <CodeHint />

            <div>
                <label
                    htmlFor="customer-register-code"
                    className="mb-1.5 block text-sm font-medium text-ink"
                >
                    Verification code
                </label>
                <input
                    id="customer-register-code"
                    name="code"
                    type="text"
                    value={code}
                    onChange={(event) =>
                        setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    placeholder="Enter the six-digit code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    className="form-input mb-0 text-center text-xl tracking-[0.4em]"
                    required
                />
            </div>

            <div className="rounded-lg border border-line bg-surface-2 p-3 text-sm text-muted">
                <p>Creating customer account for:</p>
                <p className="mt-1 font-medium text-ink">{name}</p>
                <p>{phone}</p>
                {email && <p>{email}</p>}
            </div>

            {error && (
                <div role="alert" className="form-status-error mb-0">
                    {error}
                </div>
            )}

            <div className="flex flex-col gap-2">
                <button
                    type="submit"
                    className="form-button-primary disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={busy || code.length !== 6}
                >
                    {busy ? "Verifying..." : "Complete registration"}
                </button>
                
                <button
                    type="button"
                    onClick={returnToDetails}
                    className="text-sm text-muted hover:text-ink underline"
                    disabled={busy}
                >
                    Change details / Resend code
                </button>
            </div>
        </form>
    );
}
