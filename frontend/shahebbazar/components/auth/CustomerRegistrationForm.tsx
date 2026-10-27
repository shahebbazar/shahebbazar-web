"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { registerCustomer, requestVerification } from "@/lib/auth-client";
import { localeHref, type Locale } from "@/lib/i18n";
import { CodeHint } from "./CodeHint";
import { ResendCodeButton } from "./ResendCodeButton";
import { PhoneField } from "./PhoneField";
import { COUNTRY_CODE, displayNational, toSubmitted } from "./phoneInput";

type Stage = "details" | "verification";

const copy = {
    en: {
        name: "Full name",
        namePlaceholder: "Your full name",
        email: "Email address",
        optional: "(optional)",
        requesting: "Sending verification code...",
        continue: "Continue with phone verification",
        haveAccount: "Already have an account?",
        login: "Return to login",
        code: "Verification code",
        codePlaceholder: "Enter the six-digit code",
        creatingFor: "Creating customer account for:",
        verifying: "Verifying...",
        complete: "Complete registration",
        changeDetails: "Change details",
    },
    bn: {
        name: "পুরো নাম",
        namePlaceholder: "আপনার পুরো নাম",
        email: "ইমেইল ঠিকানা",
        optional: "(ঐচ্ছিক)",
        requesting: "যাচাইকরণ কোড পাঠানো হচ্ছে...",
        continue: "ফোন যাচাই করে এগিয়ে যান",
        haveAccount: "আগে থেকেই অ্যাকাউন্ট আছে?",
        login: "লগ ইনে ফিরে যান",
        code: "যাচাইকরণ কোড",
        codePlaceholder: "ছয় সংখ্যার কোড লিখুন",
        creatingFor: "যাঁর জন্য গ্রাহক অ্যাকাউন্ট তৈরি হচ্ছে:",
        verifying: "যাচাই করা হচ্ছে...",
        complete: "নিবন্ধন সম্পন্ন করুন",
        changeDetails: "তথ্য পরিবর্তন করুন",
    },
} as const;

export function CustomerRegistrationForm({ locale = "en" }: { locale?: Locale }) {
    const router = useRouter();
    const text = copy[locale];

    const [stage, setStage] = useState<Stage>("details");
    const [name, setName] = useState("");
    // The national number, the digits after +880 (PhoneField).
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [code, setCode] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    // Sends a code to the phone number; the SMS is in the page's language.
    async function sendCode() {
        setError(null);
        const result = await requestVerification({
            phone: toSubmitted(phone),
            purpose: "register",
            language: locale,
        });
        if (!result.ok) setError(result.error);
        return result.ok;
    }

    async function handleRequestCode(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true);
        const sent = await sendCode();
        setBusy(false);
        if (sent) setStage("verification");
    }

    async function handleResend() {
        setCode("");
        return sendCode();
    }

    async function handleRegistration(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true);
        setError(null);

        const result = await registerCustomer({
            name,
            phone: toSubmitted(phone),
            email,
            code,
            language: locale,
        });

        setBusy(false);

        if (!result.ok) {
            setError(result.error);
            return;
        }

        router.push(localeHref("/account", locale));
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
                        {text.name}
                    </label>
                    <input
                        id="customer-register-name"
                        name="name"
                        type="text"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder={text.namePlaceholder}
                        autoComplete="name"
                        className="form-input mb-0"
                        maxLength={120}
                        required
                    />
                </div>

                <PhoneField id="customer-register-phone" value={phone} onChange={setPhone} locale={locale} />

                <div>
                    <label
                        htmlFor="customer-register-email"
                        className="mb-1.5 block text-sm font-medium text-ink"
                    >
                        {text.email}{" "}
                        <span className="font-normal text-muted">{text.optional}</span>
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
                    {busy ? text.requesting : text.continue}
                </button>

                <div className="border-t border-line pt-4 text-center">
                    <p className="mb-3 text-sm text-muted">{text.haveAccount}</p>
                    <Link href={localeHref("/login", locale)} className="text-sm font-medium text-brand hover:underline">
                        {text.login}
                    </Link>
                </div>
            </form>
        );
    }

    return (
        <form onSubmit={handleRegistration} className="space-y-4">
            <CodeHint locale={locale} />

            <div>
                <label
                    htmlFor="customer-register-code"
                    className="mb-1.5 block text-sm font-medium text-ink"
                >
                    {text.code}
                </label>
                <input
                    id="customer-register-code"
                    name="code"
                    type="text"
                    value={code}
                    onChange={(event) =>
                        setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    placeholder={text.codePlaceholder}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    className="form-input mb-0 text-center text-xl tracking-[0.4em]"
                    required
                />
            </div>

            <div className="rounded-lg border border-line bg-surface-2 p-3 text-sm text-muted">
                <p>{text.creatingFor}</p>
                <p className="mt-1 font-medium text-ink">{name}</p>
                <p>{COUNTRY_CODE} {displayNational(phone, locale)}</p>
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
                    {busy ? text.verifying : text.complete}
                </button>

                <ResendCodeButton onResend={handleResend} disabled={busy} locale={locale} />

                <button
                    type="button"
                    onClick={returnToDetails}
                    className="text-sm text-muted hover:text-ink underline"
                    disabled={busy}
                >
                    {text.changeDetails}
                </button>
            </div>
        </form>
    );
}
