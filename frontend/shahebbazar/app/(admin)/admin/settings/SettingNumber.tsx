"use client";

import { useId, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import type { AdminSetting } from "@/lib/types";
import { changeSetting } from "./actions";

const when = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Dhaka" });

// One number setting, for example the free plan's email campaigns a month (KAN-286). Saved with a
// button, so typing doesn't change the live value one keystroke at a time.
export function SettingNumber({ setting }: { setting: AdminSetting }) {
    const inputId = useId();
    const [saved, setSaved] = useState(Number(setting.value));
    const [draft, setDraft] = useState(String(setting.value));
    const [meta, setMeta] = useState({ updated_at: setting.updated_at, updated_by: setting.updated_by });
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
    const [pending, startTransition] = useTransition();

    const value = Number(draft);
    const valid = draft.trim() !== "" && Number.isInteger(value) && value >= (setting.min ?? 0) && value <= (setting.max ?? Infinity);

    function save() {
        setMessage(null);
        startTransition(async () => {
            const result = await changeSetting(setting.key, value);
            if (result.ok) {
                setSaved(value);
                setMeta({ updated_at: result.data.setting.updated_at, updated_by: result.data.setting.updated_by });
                setMessage({ ok: true, text: "Saved." });
            } else {
                setMessage({ ok: false, text: result.error });
            }
        });
    }

    return (
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
            <div className="min-w-0 flex-1">
                <label htmlFor={inputId} className="font-semibold">
                    {setting.label}
                </label>
                <p className="mt-1 text-sm text-muted">{setting.help}</p>
                {meta.updated_at && (
                    <p className="mt-1.5 text-xs text-soft">
                        Last changed {when.format(new Date(meta.updated_at))}
                        {meta.updated_by ? ` by ${meta.updated_by}` : ""}.
                    </p>
                )}
                {message && (
                    <p role={message.ok ? "status" : "alert"} className={`mt-1.5 text-xs ${message.ok ? "text-success-ink" : "text-error-ink"}`}>
                        {message.text}
                    </p>
                )}
            </div>
            <div className="flex items-center gap-2">
                <input
                    id={inputId}
                    type="number"
                    inputMode="numeric"
                    min={setting.min}
                    max={setting.max}
                    step={1}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    aria-invalid={!valid}
                    className="w-20 rounded-[10px] border border-line-strong bg-surface px-3 py-2 text-sm"
                />
                <button
                    type="button"
                    onClick={save}
                    disabled={pending || !valid || value === saved}
                    className="inline-flex items-center gap-1.5 rounded-[10px] bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                    {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                    Save
                </button>
            </div>
        </div>
    );
}
