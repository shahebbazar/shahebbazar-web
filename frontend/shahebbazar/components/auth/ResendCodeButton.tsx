"use client";

import { useEffect, useState } from "react";

// "Send a new code" under a verification-code box, shared by sign-in and both sign-up forms. A code has
// just been sent when it appears, so it waits a minute before it can be used, and again after each new
// code. The API still limits how many codes one number gets.

const RESEND_SECONDS = 60;

const COPY = {
    en: {
        resend: "Send a new code",
        resendIn: (seconds: number) => `Send a new code in ${seconds}s`,
        sending: "Sending code...",
        resent: "A new code is on its way.",
    },
    bn: {
        resend: "নতুন কোড পাঠান",
        resendIn: (seconds: number) => `${seconds} সেকেন্ড পরে নতুন কোড পাঠান`,
        sending: "কোড পাঠানো হচ্ছে...",
        resent: "নতুন কোড পাঠানো হয়েছে।",
    },
};

/** onResend sends a new code and returns whether it went; the form shows any error itself. */
export function ResendCodeButton({
    onResend,
    disabled = false,
    locale = "en",
}: {
    onResend: () => Promise<boolean>;
    disabled?: boolean;
    locale?: "en" | "bn";
}) {
    const text = COPY[locale];
    const [resendAt, setResendAt] = useState(() => Date.now() + RESEND_SECONDS * 1000);
    const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
    const [sending, setSending] = useState(false);
    const [resent, setResent] = useState(false);

    // Counted from the deadline, so it stays right when a phone slows timers in a background tab.
    useEffect(() => {
        const tick = () => setSecondsLeft(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
        tick();
        const timer = setInterval(tick, 1000);
        return () => clearInterval(timer);
    }, [resendAt]);

    async function resend() {
        setSending(true);
        setResent(false);
        const sent = await onResend();
        setSending(false);
        if (sent) {
            setResendAt(Date.now() + RESEND_SECONDS * 1000);
            setResent(true);
        }
    }

    return (
        <>
            {resent && (
                <p role="status" className="text-sm text-muted">
                    {text.resent}
                </p>
            )}
            <button
                type="button"
                className="form-button-secondary disabled:cursor-not-allowed disabled:opacity-60"
                onClick={resend}
                disabled={disabled || sending || secondsLeft > 0}
            >
                {sending ? text.sending : secondsLeft > 0 ? text.resendIn(secondsLeft) : text.resend}
            </button>
        </>
    );
}
