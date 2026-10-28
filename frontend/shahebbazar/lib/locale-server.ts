import { cache } from "react";
import { cookies } from "next/headers";
import { getViewer } from "@/lib/auth-server";
import { LANGUAGE_COOKIE, type Locale } from "@/lib/i18n";

/**
 * Language of the signed-in areas (KAN-328): the one last picked with the English / বাংলা switch,
 * otherwise the account's own language (My details), otherwise English.
 */
export const getAccountLocale = cache(async (): Promise<Locale> => {
    const chosen = (await cookies()).get(LANGUAGE_COOKIE)?.value;
    if (chosen === "en" || chosen === "bn") return chosen;
    return (await getViewer())?.user_language === "bn" ? "bn" : "en";
});
