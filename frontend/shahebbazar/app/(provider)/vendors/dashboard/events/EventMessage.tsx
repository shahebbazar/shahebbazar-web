"use client";

import { useState, useTransition } from "react";
import { Loader2, Send } from "lucide-react";
import { messageGoing } from "./actions";

// Writes to everyone marked Going (KAN-298). Each person gets it in their Messages, with an email when
// they have an address, and can reply there.
export function EventMessage({ eventId, going, open }: { eventId: number; going: number; open: boolean }) {
    const [body, setBody] = useState("");
    const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
    const [pending, startTransition] = useTransition();

    function send() {
        setMessage(null);
        startTransition(async () => {
            const result = await messageGoing(eventId, body);
            if (!result.ok) return setMessage({ type: "error", text: result.error });
            const sent = result.data.sent;
            setBody("");
            setMessage({ type: "success", text: `Sent to ${sent} ${sent === 1 ? "person" : "people"}. Replies arrive in Messages.` });
        });
    }

    return (
        <section className="rounded-xl border border-line bg-surface p-5 shadow-card">
            <h2 className="text-[1.0625rem] font-semibold">Message people going</h2>
            <p className="mt-1 text-[0.8125rem] text-muted">
                {going === 0
                    ? "Nobody has said they're going yet."
                    : `${going} ${going === 1 ? "person is" : "people are"} going. They get your message in their Messages and can reply. If you change the time or place, or cancel, they're told automatically.`}
            </p>
            {open && going > 0 && (
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        send();
                    }}
                    className="mt-3 space-y-2"
                >
                    <label className="block text-[0.8125rem] font-medium">
                        Message
                        <textarea
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            rows={3}
                            maxLength={1000}
                            placeholder="For example: gates open at 9am, parking is behind the market."
                            className="mt-1 w-full rounded-[10px] border border-line-strong bg-surface px-3 py-2 text-sm font-normal outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-100"
                        />
                    </label>
                    <button
                        type="submit"
                        disabled={pending || !body.trim()}
                        className="inline-flex items-center gap-1.5 rounded-[10px] bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                        {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Send to everyone going
                    </button>
                </form>
            )}
            {message && (
                <p
                    role={message.type === "error" ? "alert" : "status"}
                    className={`mt-3 rounded-lg p-3 text-[0.8125rem] ${message.type === "error" ? "bg-error-bg text-error-ink" : "bg-success-bg text-success-ink"}`}
                >
                    {message.text}
                </p>
            )}
        </section>
    );
}
