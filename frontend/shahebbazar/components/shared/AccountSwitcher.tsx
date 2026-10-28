import Link from "next/link";
import { ChevronDown, Plus } from "lucide-react";
import { switchHref } from "@/lib/activeBusiness";
import { fill, t, type Locale } from "@/lib/i18n";
import { browserAssetUrl } from "@/lib/apiBase";
import type { VendorPickerRow } from "@/lib/types";

// One account switcher for the whole site: the public header (customer side) and the business
// dashboard use the same control. The button shows where you are now (your customer account, or a
// business); the list has your customer account and each business you run, so you can move between
// them from anywhere, plus registering a business.

export type AccountSide = { kind: "customer" } | { kind: "business"; vendorId: number };

type Props = {
    userName: string;
    side: AccountSide;
    businesses: VendorPickerRow[];
    // The dashboard page to open in another business, e.g. "/vendors/dashboard/marketing".
    businessPath?: string;
    /** The customer's profile photo, shown on the customer side in place of their first letter (a business shows its own). */
    avatarUrl?: string | null;
    /** Under the account list in the dropdown: the theme choice and Log out, so the header itself stays short. */
    extras?: React.ReactNode;
    locale?: Locale;
};

const ROW = "flex items-center gap-3 rounded-[10px] px-3.5 py-2.5 text-sm font-medium";
const ROW_ACTIVE = "bg-brand-50 text-brand-700";
const ROW_IDLE = "text-muted hover:bg-surface-2 hover:text-ink";

/** Who you are on this side: your name as a customer, or the business and your role in it. */
function current({ userName, side, businesses, locale = "en" }: Props) {
    const copy = t(locale);
    if (side.kind === "customer") return { name: userName, role: copy.accountRoleCustomer };
    const business = businesses.find((b) => b.vendor_id === side.vendorId);
    return {
        name: business?.vendor_name ?? userName,
        role: business?.member_role === "manager" ? copy.accountRoleManager : copy.accountRoleOwner,
    };
}

/**
 * An account's picture: the photo when there is one, otherwise the name's first letter. The button and
 * the list both use it, so an account looks the same in each (KAN-315).
 */
function Avatar({ name, photo, className }: { name: string; photo: string | null | undefined; className: string }) {
    const src = browserAssetUrl(photo ?? null);
    return (
        <span aria-hidden className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-brand-100 font-semibold text-brand-700 ${className}`}>
            {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt="" className="size-full object-cover" />
            ) : (
                name.trim().charAt(0).toUpperCase() || "?"
            )}
        </span>
    );
}

const ROW_AVATAR = "size-5 text-[0.625rem]";

/** The choices, for the dropdown and for the phone menu drawer. */
export function AccountSwitcherList({ userName, side, businesses, businessPath = "/vendors/dashboard", avatarUrl, locale = "en" }: Omit<Props, "extras">) {
    const copy = t(locale);
    const isCustomer = side.kind === "customer";
    return (
        <div>
            <p className="px-3.5 pb-1 text-[0.75rem] font-medium text-muted">{copy.accountSwitchTo}</p>
            <ul className="space-y-0.5">
                <li>
                    <Link href="/account" aria-current={isCustomer ? "true" : undefined} className={`${ROW} ${isCustomer ? ROW_ACTIVE : ROW_IDLE}`}>
                        <Avatar name={userName} photo={avatarUrl} className={ROW_AVATAR} />
                        <span className="min-w-0 flex-1 truncate">{copy.accountCustomer}</span>
                    </Link>
                </li>
                {businesses.map((b) => {
                    const active = side.kind === "business" && side.vendorId === b.vendor_id;
                    return (
                        <li key={b.vendor_id}>
                            <Link
                                href={switchHref(b.vendor_id, businessPath)}
                                aria-current={active ? "true" : undefined}
                                className={`${ROW} ${active ? ROW_ACTIVE : ROW_IDLE}`}
                            >
                                <Avatar name={b.vendor_name} photo={b.vendor_photo} className={ROW_AVATAR} />
                                <span className="min-w-0 flex-1 truncate">{b.vendor_name}</span>
                                {b.member_role === "manager" && <span className="text-[0.6875rem] text-soft">{copy.accountRoleManager}</span>}
                            </Link>
                        </li>
                    );
                })}
            </ul>
            <div className="my-2 border-t border-line" />
            <Link href="/vendors/register" className={`${ROW} ${ROW_IDLE}`}>
                <Plus className="size-4 shrink-0" aria-hidden />
                {businesses.length ? copy.accountRegisterAnother : copy.accountRegisterBusiness}
            </Link>
        </div>
    );
}

/**
 * The header's account button: picture, name and role, opening a dropdown of `children` with `extras`
 * (theme and Log out) under it. The same control for customers, business owners and admins.
 * From tablet width up; on phones its contents are in the menu drawer.
 */
export function AccountMenu({
    name,
    role,
    photo = null,
    label,
    extras,
    children,
}: {
    name: string;
    role: string;
    photo?: string | null;
    /** The button's accessible name. */
    label: string;
    extras?: React.ReactNode;
    children?: React.ReactNode;
}) {
    return (
        <details className="group relative min-w-0">
            <summary
                aria-label={label}
                className="flex min-w-0 cursor-pointer list-none items-center gap-2.5 rounded-[10px] px-1.5 py-1 hover:bg-surface-2 [&::-webkit-details-marker]:hidden"
            >
                <Avatar name={name} photo={photo} className="size-9 text-sm" />
                <span className="hidden min-w-0 leading-tight min-[420px]:block">
                    <span className="block max-w-44 truncate text-sm font-semibold">{name}</span>
                    <span className="block text-[0.75rem] text-muted">{role}</span>
                </span>
                <ChevronDown className="hidden size-4 shrink-0 text-soft transition-transform group-open:rotate-180 md:block" aria-hidden />
            </summary>
            <div className="absolute right-0 z-50 mt-2 hidden w-72 rounded-xl border border-line bg-surface p-2 shadow-raised md:block">
                {children}
                {extras && <div className={`${children ? "mt-2 border-t border-line pt-3" : "pt-1"} space-y-2 px-1.5 pb-1`}>{extras}</div>}
            </div>
        </details>
    );
}

/** The account menu for customers and business owners: where you are, and the list to switch. */
export function AccountSwitcher(props: Props) {
    const { name, role } = current(props);
    const side = props.side;
    const photo = side.kind === "customer"
        ? props.avatarUrl
        : props.businesses.find((b) => b.vendor_id === side.vendorId)?.vendor_photo;
    return (
        <AccountMenu
            name={name}
            role={role}
            photo={photo}
            label={fill(t(props.locale ?? "en").accountSwitchLabel, { name, role })}
            extras={props.extras}
        >
            <AccountSwitcherList userName={props.userName} side={props.side} businesses={props.businesses} businessPath={props.businessPath} avatarUrl={props.avatarUrl} locale={props.locale} />
        </AccountMenu>
    );
}
