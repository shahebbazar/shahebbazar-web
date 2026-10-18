"use client";

import { useState, useTransition } from "react";
import { PAYMENT_METHOD_OPTIONS, PAYMENT_NOTE_MAX_LENGTH } from "@/lib/paymentMethods";
import type { PaymentMethod, PaymentMethodKey } from "@/lib/types";
import { savePaymentMethods } from "./actions";

type FieldState = Record<PaymentMethodKey, { checked: boolean; note: string }>;

type Status = { kind: "success" | "error"; message: string } | null;

function toFieldState(methods: PaymentMethod[]): FieldState {
    const saved = new Map(methods.map((m) => [m.payment_method, m.payment_note]));
    return Object.fromEntries(
        PAYMENT_METHOD_OPTIONS.map(({ key }) => [
            key,
            { checked: saved.has(key), note: saved.get(key) ?? "" },
        ])
    ) as FieldState;
}

export function PaymentMethodsForm({
    vendorId,
    initialMethods,
}: {
    vendorId: number;
    initialMethods: PaymentMethod[];
}) {
    const [fields, setFields] = useState<FieldState>(() => toFieldState(initialMethods));
    // The order the profile shows them in: saved methods keep their place, new ones go last.
    const [savedOrder, setSavedOrder] = useState<PaymentMethodKey[]>(() =>
        initialMethods.map((m) => m.payment_method)
    );
    const [status, setStatus] = useState<Status>(null);
    const [isPending, startTransition] = useTransition();

    function update(key: PaymentMethodKey, change: Partial<FieldState[PaymentMethodKey]>) {
        setFields((current) => ({ ...current, [key]: { ...current[key], ...change } }));
        setStatus(null);
    }

    function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        const position = (key: PaymentMethodKey) => {
            const saved = savedOrder.indexOf(key);
            return saved === -1 ? savedOrder.length + PAYMENT_METHOD_OPTIONS.findIndex((o) => o.key === key) : saved;
        };
        const methods: PaymentMethod[] = PAYMENT_METHOD_OPTIONS.filter(({ key }) => fields[key].checked)
            .map(({ key }) => key)
            .sort((a, b) => position(a) - position(b))
            .map((key) => ({
                payment_method: key,
                payment_note: fields[key].note.trim() || null,
            }));

        startTransition(async () => {
            const result = await savePaymentMethods(vendorId, methods);

            if (result.ok) {
                setFields(toFieldState(result.methods));
                setSavedOrder(result.methods.map((m) => m.payment_method));
                setStatus({
                    kind: "success",
                    message:
                        result.methods.length === 0
                            ? "Saved. No payment methods are listed on your profile."
                            : "Saved. Your profile now shows these payment methods.",
                });
            } else {
                setStatus({ kind: "error", message: result.error });
            }
        });
    }

    return (
        <form onSubmit={handleSubmit} noValidate>
            {status && (
                <p
                    role={status.kind === "error" ? "alert" : "status"}
                    className={
                        status.kind === "error" ? "form-status-error" : "form-status-success"
                    }
                >
                    {status.message}
                </p>
            )}

            <fieldset disabled={isPending} className="space-y-2.5">
                <legend className="mb-3 text-sm text-muted">
                    Tick every method your business accepts.
                </legend>

                {PAYMENT_METHOD_OPTIONS.map(({ key, label, icon: Icon }) => {
                    const field = fields[key];
                    const noteId = `payment-note-${key}`;

                    return (
                        <div
                            key={key}
                            className={`rounded-lg border p-3 transition-colors ${
                                field.checked
                                    ? "border-brand-200 bg-brand-50"
                                    : "border-line bg-surface"
                            }`}
                        >
                            <label className="flex cursor-pointer items-center gap-3">
                                <input
                                    type="checkbox"
                                    checked={field.checked}
                                    onChange={(e) => update(key, { checked: e.target.checked })}
                                    className="size-4 accent-brand-600"
                                />
                                <Icon className="size-4 text-muted" />
                                <span className="text-sm font-medium text-ink">{label}</span>
                            </label>

                            {field.checked && (
                                <div className="mt-2.5 pl-7">
                                    <label htmlFor={noteId} className="sr-only">
                                        Note for {label}
                                    </label>
                                    <input
                                        id={noteId}
                                        type="text"
                                        value={field.note}
                                        maxLength={PAYMENT_NOTE_MAX_LENGTH}
                                        onChange={(e) => update(key, { note: e.target.value })}
                                        placeholder="Optional note, e.g. Orders above 5,000 BDT"
                                        className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-100"
                                    />
                                </div>
                            )}
                        </div>
                    );
                })}
            </fieldset>

            <p className="mt-4 text-xs leading-relaxed text-muted">
                Do not put phone, wallet or bank account numbers in a note. Customers confirm
                payment details with you directly, which protects them from fake listings.
            </p>

            <button type="submit" disabled={isPending} className="form-button-primary mt-5 disabled:opacity-60">
                {isPending ? "Saving…" : "Save payment methods"}
            </button>
        </form>
    );
}
