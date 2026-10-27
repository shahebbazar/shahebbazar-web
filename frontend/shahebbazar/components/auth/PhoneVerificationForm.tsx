"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import {
    requestVerification,
    verifyCode,
} from "@/lib/auth-client";
import { localeHref, type Locale } from "@/lib/i18n";
import { safeNext } from "@/lib/safeNext";
import { CodeHint } from "./CodeHint";

type LoginAudience =
    | "customer"
    | "vendor"
    | "admin";

type PhoneVerificationFormProps = {
    locale: Locale;
    audience: LoginAudience;
    /** A path on this site to go to after logging in (checked with safeNext), instead of the account's home. */
    next?: string | null;
};

type Stage = "phone" | "code";

// How long the "Send a new code" button waits after a code is sent. The API still limits requests per hour.
const RESEND_SECONDS = 60;

const copy = {
    en: {
        phone: "Phone number",
        phonePlaceholder: "e.g. 01700000100",
        sendCode: "Send verification code",
        code: "Verification code",
        codePlaceholder: "Enter the six-digit code",
        verify: "Verify and log in",
        changePhone: "Change phone number",
        resend: "Send a new code",
        resendIn: (seconds: number) => `Send a new code in ${seconds}s`,
        resent: "A new code is on its way.",
        requesting: "Sending code...",
        verifying: "Verifying...",
        customerRegister: "New to Shahebbazar?",
        customerRegisterLink: "Create an account",
        vendorRegister: "Registering a new business?",
        vendorRegisterLink: "Register a business",
        wrongCustomerRole:
            "This phone number is not connected to a customer account.",
        wrongVendorRole:
            "This phone number is not connected to a vendor account.",
    },
    bn: {
        phone: "ফোন নম্বর",
        phonePlaceholder: "যেমন ০১৭০০০০০১০০",
        sendCode: "যাচাইকরণ কোড পাঠান",
        code: "যাচাইকরণ কোড",
        codePlaceholder: "ছয় সংখ্যার কোড লিখুন",
        verify: "যাচাই করে লগ ইন করুন",
        changePhone: "ফোন নম্বর পরিবর্তন করুন",
        resend: "নতুন কোড পাঠান",
        resendIn: (seconds: number) => `${seconds} সেকেন্ড পরে নতুন কোড পাঠান`,
        resent: "নতুন কোড পাঠানো হয়েছে।",
        requesting: "কোড পাঠানো হচ্ছে...",
        verifying: "যাচাই করা হচ্ছে...",
        customerRegister: "সাহেববাজারে নতুন?",
        customerRegisterLink: "অ্যাকাউন্ট তৈরি করুন",
        vendorRegister: "নতুন ব্যবসা নিবন্ধন করছেন?",
        vendorRegisterLink: "ব্যবসা নিবন্ধন করুন",
        wrongCustomerRole:
            "এই ফোন নম্বরটি কোনো গ্রাহক অ্যাকাউন্টের সঙ্গে যুক্ত নয়।",
        wrongVendorRole:
            "এই ফোন নম্বরটি কোনো ব্যবসায়িক অ্যাকাউন্টের সঙ্গে যুক্ত নয়।",
    },
} as const;

type AuthCopy = (typeof copy)[Locale];

export function PhoneVerificationForm({
    locale,
    audience,
    next,
}: PhoneVerificationFormProps) {
    const router = useRouter();
    const text: AuthCopy = copy[locale];

    const [stage, setStage] = useState<Stage>("phone");
    const [phone, setPhone] = useState("");
    const [code, setCode] = useState("");
    //const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [resendAt, setResendAt] = useState(0);
    const [resendIn, setResendIn] = useState(0);
    const [resent, setResent] = useState(false);

    // Counted from the deadline, so it stays right when a phone slows timers in a background tab.
    useEffect(() => {
        if (!resendAt) return;
        const tick = () => setResendIn(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
        tick();
        const timer = setInterval(tick, 1000);
        return () => clearInterval(timer);
    }, [resendAt]);

    async function sendCode() {
        setBusy(true);
        setError(null);

        const result = await requestVerification({
            phone,
            purpose: "login",
            expectedRole: audience,
            language: locale,
        });

        setBusy(false);

        if (!result.ok) {
            setError(result.error);
            return false;
        }

        setResendAt(Date.now() + RESEND_SECONDS * 1000);
        return true;
    }

    async function handleRequest(
        event: FormEvent<HTMLFormElement>
    ) {
        event.preventDefault();

        setResent(false);
        if (await sendCode()) setStage("code");
    }

    async function handleResend() {
        setCode("");
        setResent(await sendCode());
    }

    async function handleVerify(
        event: FormEvent<HTMLFormElement>
    ) {
        event.preventDefault();

        setBusy(true);
        setError(null);

        const result = await verifyCode({
            phone,
            purpose: "login",
            code,
            expectedRole: audience,
        });

        setBusy(false);

        if (!result.ok) {
            setError(result.error);
            return;
        }

        const destinationByRole = {
            customer: "/account",
            vendor: "/vendors/dashboard",
            admin: "/admin",
        } as const;

        // A vendor who used the customer login goes to their customer account.
        const destination =
            audience === "customer"
                ? "/account"
                : destinationByRole[result.user.user_role];

        // Back to where they were going (e.g. messaging a business from an email), except for admins.
        const back = audience !== "admin" && result.user.user_role !== "admin" ? safeNext(next) : null;

        // An account brought back from deletion goes to its account page, which says so.
        router.replace(
            result.reactivated
                ? "/account?welcome=back"
                : back ?? localeHref(destination, locale)
        );
    }

    function resetPhoneStage() {
        setStage("phone");
        setCode("");
        setError(null);
        setResent(false);
        //setMessage(null);
    }

    if (stage === "phone") {
        return (
            <form onSubmit={handleRequest} className="space-y-4">
                <div>
                    <label
                        htmlFor={`${audience}-login-phone`}
                        className="mb-1.5 block text-sm font-medium text-ink"
                    >
                        {text.phone}
                    </label>

                    <input
                        id={`${audience}-login-phone`}
                        name="phone"
                        type="tel"
                        value={phone}
                        onChange={(event) =>
                            setPhone(event.target.value)
                        }
                        placeholder={text.phonePlaceholder}
                        autoComplete="tel"
                        className="form-input mb-0"
                        required
                    />
                </div>

                <p className="mt-1.5 text-xs leading-5 text-muted">
                    Enter your Bangladesh mobile number, for example +8801712345678.
                </p>

                {error && (
                    <div
                        role="alert"
                        className="form-status-error mb-0"
                    >
                        {error}
                    </div>
                )}

                <button
                    type="submit"
                    className="form-button-primary disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={busy}
                >
                    {busy ? text.requesting : text.sendCode}
                </button>

                {audience !== "admin" && (
                    <RegistrationPrompt
                        locale={locale}
                        audience={audience}
                        text={text}
                    />
                )}
            </form>
        );
    }

    return (
        <form onSubmit={handleVerify} className="space-y-4">

            <CodeHint locale={locale} />

            <div>
                <label
                    htmlFor={`${audience}-login-code`}
                    className="mb-1.5 block text-sm font-medium text-ink"
                >
                    {text.code}
                </label>

                <input
                    id={`${audience}-login-code`}
                    name="code"
                    type="text"
                    value={code}
                    onChange={(event) =>
                        setCode(
                            event.target.value
                                .replace(/\D/g, "")
                                .slice(0, 6)
                        )
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

            {error && (
                <div
                    role="alert"
                    className="form-status-error mb-0"
                >
                    {error}
                </div>
            )}

            {resent && !error && (
                <p role="status" className="text-sm text-muted">
                    {text.resent}
                </p>
            )}

            <button
                type="submit"
                className="form-button-primary disabled:cursor-not-allowed disabled:opacity-60"
                disabled={busy || code.length !== 6}
            >
                {busy ? text.verifying : text.verify}
            </button>

            <button
                type="button"
                className="form-button-secondary disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleResend}
                disabled={busy || resendIn > 0}
            >
                {resendIn > 0 ? text.resendIn(resendIn) : text.resend}
            </button>

            <button
                type="button"
                className="form-button-secondary"
                onClick={resetPhoneStage}
                disabled={busy}
            >
                {text.changePhone}
            </button>
        </form>
    );
}
function RegistrationPrompt({
    locale,
    audience,
    text,
}: {
    locale: Locale;
    audience: "customer" | "vendor";
    text: AuthCopy;
}) {
    const isCustomer = audience === "customer";

    const prompt = isCustomer
        ? text.customerRegister
        : text.vendorRegister;

    const label = isCustomer
        ? text.customerRegisterLink
        : text.vendorRegisterLink;

    const href = isCustomer
        ? localeHref("/register/customer", locale)
        : localeHref("/vendors/register", locale);
    return (
        <p className="text-center text-sm text-muted">
            {prompt}{" "}
            <Link href={href}>
                {label}
            </Link>
        </p>
    );
}