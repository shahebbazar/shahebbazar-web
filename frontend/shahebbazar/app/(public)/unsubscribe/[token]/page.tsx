import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MailX } from "lucide-react";
import { AppShell } from "@/components/public/AppShell";
import { apiGet, apiPostPublic } from "@/lib/api";
import { fill, localeHref, pick, resolveLocale, t } from "@/lib/i18n";
import type { UnsubscribeLink } from "@/lib/types";

// The page behind the unsubscribe link in every offer (KAN-284). Opening it changes nothing,
// because mail scanners open links; the customer confirms with the button. No sign-in needed.

export const metadata: Metadata = {
    title: "Unsubscribe",
    robots: { index: false, follow: false },
};

type Params = { token: string };
type Query = { lang?: string; done?: string };

async function stopOffers(formData: FormData) {
    "use server";
    const token = String(formData.get("token") ?? "");
    const lang = String(formData.get("lang") ?? "");
    await apiPostPublic(`/unsubscribe/${encodeURIComponent(token)}`);
    redirect(`/unsubscribe/${encodeURIComponent(token)}?done=1${lang === "bn" ? "&lang=bn" : ""}`);
}

export default async function UnsubscribePage({
    params,
    searchParams,
}: {
    params: Promise<Params>;
    searchParams: Promise<Query>;
}) {
    const [{ token }, { lang, done }] = await Promise.all([params, searchParams]);
    const locale = resolveLocale(lang);
    const copy = t(locale);
    const link = await apiGet<UnsubscribeLink>(`/unsubscribe/${encodeURIComponent(token)}`);

    let message: string;
    let canStop = false;
    if (!link) {
        message = copy.unsubInvalid;
    } else {
        const values = {
            name: pick(locale, link.business.vendor_name, link.business.vendor_name_bn),
            channel: link.channel === "email" ? copy.channelEmail : copy.channelSms,
        };
        if (link.subscribed) {
            message = fill(copy.unsubAsk, values);
            canStop = true;
        } else {
            message = fill(done ? copy.unsubDone : copy.unsubAlready, values);
        }
    }

    return (
        <AppShell locale={locale}>
            <div className="mx-auto w-full max-w-lg px-4 py-12">
                <div className="rounded-xl border border-line bg-surface p-6 text-center shadow-card">
                    <span className="mx-auto grid size-12 place-items-center rounded-full bg-brand-50 text-brand-600">
                        <MailX className="size-6" />
                    </span>
                    <h1 className="mt-3 text-xl font-bold">{copy.unsubHeading}</h1>
                    <p role={done ? "status" : undefined} className="mt-2 text-sm text-muted">
                        {message}
                    </p>

                    {canStop && (
                        <form action={stopOffers} className="mt-5">
                            <input type="hidden" name="token" value={token} />
                            <input type="hidden" name="lang" value={locale} />
                            <button
                                type="submit"
                                className="rounded-[10px] bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
                            >
                                {copy.unsubButton}
                            </button>
                        </form>
                    )}

                    <Link
                        href={localeHref("/account/saved", locale)}
                        className="mt-5 inline-block text-[0.8125rem] font-medium text-brand-600 hover:underline"
                    >
                        {copy.unsubManage}
                    </Link>
                </div>
            </div>
        </AppShell>
    );
}
