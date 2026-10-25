import { ThemeSelector } from "@/components/theme/ThemeSelector";
import { LogoutButton } from "./LogoutButton";

/** Under the account switcher's list: the theme and Log out, kept out of the header bar. */
export function AccountMenuExtras() {
    return (
        <>
            <div>
                <p className="mb-1.5 px-2 text-[0.75rem] font-medium text-muted">Appearance</p>
                <ThemeSelector className="w-full" />
            </div>
            <LogoutButton />
        </>
    );
}
