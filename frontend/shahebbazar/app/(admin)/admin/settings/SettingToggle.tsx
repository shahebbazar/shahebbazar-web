"use client";

import { useId, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import type { AdminSetting } from "@/lib/types";
import { changeSetting } from "./actions";

const when = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Dhaka" });

// One on/off setting. Switching approval off asks for confirmation first (in-page, not a browser box),
// because new businesses or listings then go public without review.
export function SettingToggle({ setting }: { setting: AdminSetting }) {
    const labelId = useId();
    const [value, setValue] = useState(setting.value);
    const [meta, setMeta] = useState({ updated_at: setting.updated_at, updated_by: setting.updated_by });
    const [error, setError] = useState<string | null>(null);
    const [confirming, setConfirming] = useState(false);
    const [pending, startTransition] = useTransition();

    function toggle() {
        if (value) setConfirming(true);
        else save(true);
    }

    function save(next: boolean) {
        setConfirming(false);
        setError(null);
        setValue(next);
        startTransition(async () => {
            const result = await changeSetting(setting.key, next);
            if (result.ok) {
                setMeta({ updated_at: result.data.setting.updated_at, updated_by: result.data.setting.updated_by });
            } else {
                setValue(!next);
                setError(result.error);
            }
        });
    }

    return (
        <div className="flex items-start justify-between gap-4 p-5">
            <div className="min-w-0">
                <p id={labelId} className="font-semibold">
                    {setting.label}
                </p>
                <p className="mt-1 text-sm text-muted">{setting.help}</p>
                <p className="mt-1.5 text-xs text-soft">
                    {value ? "On: an admin approves each one in Approvals." : "Off: they go public without review."}
                    {meta.updated_at && ` Last changed ${when.format(new Date(meta.updated_at))}${meta.updated_by ? ` by ${meta.updated_by}` : ""}.`}
                </p>
                {error && (
                    <p role="alert" className="mt-1.5 text-xs text-error-ink">
                        {error}
                    </p>
                )}
            </div>
            <button
                type="button"
                role="switch"
                aria-checked={value}
                aria-labelledby={labelId}
                disabled={pending}
                onClick={toggle}
                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
                    value ? "bg-brand-600" : "bg-line-strong"
                }`}
            >
                <span
                    className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${value ? "translate-x-6" : "translate-x-1"}`}
                />
                {pending && <Loader2 className="absolute -left-6 size-4 animate-spin text-muted" aria-hidden />}
            </button>
            <ConfirmDialog
                open={confirming}
                title={`Turn off "${setting.label}"?`}
                body={`${setting.help} Anything already waiting stays in Approvals.`}
                confirmLabel="Turn off"
                onConfirm={() => save(false)}
                onCancel={() => setConfirming(false)}
            />
        </div>
    );
}
