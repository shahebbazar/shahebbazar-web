"use client";

import { useLayoutEffect, useRef, type ChangeEvent } from "react";
import { Info } from "lucide-react";
import { COUNTRY_CODE, PHONE_COPY, caretAfter, displayNational, toNational } from "./phoneInput";

// The mobile number box on sign-in and both sign-up forms: +880 shown in front (as +61 is in
// Australia), the rest typed in the box and grouped as 1712-345678, and what the number is for
// behind an info button rather than under the box. `value` is the national number, the digits after
// +880; the form sends it with toSubmitted().
export function PhoneField({
    id,
    value,
    onChange,
    locale = "en",
    requiredMark = false,
    disabled = false,
}: {
    id: string;
    value: string;
    onChange: (national: string) => void;
    locale?: "en" | "bn";
    /** The red star the business registration form puts on required fields. */
    requiredMark?: boolean;
    disabled?: boolean;
}) {
    const text = PHONE_COPY[locale];
    const hintId = `${id}-hint`;
    const input = useRef<HTMLInputElement>(null);
    // Where the cursor goes once the reformatted number is shown.
    const caret = useRef<number | null>(null);
    const shown = displayNational(value, locale);

    useLayoutEffect(() => {
        const box = input.current;
        if (caret.current === null || !box || document.activeElement !== box) return;
        box.setSelectionRange(caret.current, caret.current);
        caret.current = null;
    }, [shown]);

    function change(event: ChangeEvent<HTMLInputElement>) {
        const raw = event.target.value;
        const at = event.target.selectionStart ?? raw.length;
        let national = toNational(raw);
        let before = toNational(raw.slice(0, at)).length;
        // Backspace or Delete on the dash removed no digit; take the digit before the cursor instead.
        if (national === value && raw.length < shown.length && before > 0 && national.length > 0) {
            national = value.slice(0, before - 1) + value.slice(before);
            before -= 1;
        }
        caret.current = caretAfter(Math.min(before, national.length));
        onChange(national);
    }

    return (
        <div>
            <div className="mb-1.5 flex items-center gap-1.5">
                <label htmlFor={id} className="text-sm font-medium text-ink">
                    {text.label}
                    <span className="sr-only">{text.afterCode}</span>
                    {requiredMark && (
                        <span className="ml-1 text-error-ink" aria-hidden="true">
                            *
                        </span>
                    )}
                </label>
                {/* Shows on hover, on keyboard focus, and on tap (a tap focuses the button), above the
                    button so it never covers the box being typed in. */}
                <span className="group relative inline-flex">
                    <button
                        type="button"
                        aria-label={text.info}
                        aria-describedby={hintId}
                        className="grid size-5 place-items-center rounded-full text-muted outline-none hover:text-ink focus-visible:ring-3 focus-visible:ring-brand-100"
                    >
                        <Info className="size-4" aria-hidden="true" />
                    </button>
                    <span
                        id={hintId}
                        role="tooltip"
                        className="pointer-events-none invisible absolute bottom-full -left-2 z-30 mb-2 w-64 rounded-lg bg-ink px-3 py-2 text-xs leading-5 font-normal text-surface opacity-0 shadow-raised transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
                    >
                        {text.hint}
                    </span>
                </span>
            </div>

            <div className="flex">
                <span
                    className="flex items-center rounded-l-lg border border-r-0 border-line-strong bg-surface-2 px-3 text-ink tabular-nums select-none"
                    aria-hidden="true"
                >
                    {COUNTRY_CODE}
                </span>
                <input
                    ref={input}
                    id={id}
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    value={shown}
                    onChange={change}
                    placeholder={text.placeholder}
                    aria-describedby={hintId}
                    disabled={disabled}
                    className="form-input mb-0 min-w-0 flex-1 rounded-l-none tabular-nums"
                    required
                />
            </div>
        </div>
    );
}
