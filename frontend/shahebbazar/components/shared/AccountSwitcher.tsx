import Link from "next/link";
import { ChevronDown, Plus, Store, UserRound } from "lucide-react";
import { switchHref } from "@/lib/activeBusiness";
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
};

const ROW = "flex items-center gap-3 rounded-[10px] px-3.5 py-2.5 text-sm font-medium";
const ROW_ACTIVE = "bg-brand-50 text-brand-700";
const ROW_IDLE = "text-muted hover:bg-surface-2 hover:text-ink";

/** Who you are on this side: your name as a customer, or the business and your role in it. */
function current({ userName, side, businesses }: Props) {
    if (side.kind === "customer") return { name: userName, role: "Customer" };
    const business = businesses.find((b) => b.vendor_id === side.vendorId);
    return { name: business?.vendor_name ?? userName, role: business?.member_role === "manager" ? "Manager" : "Business owner" };
}

/** The choices, for the dropdown and for the phone menu drawer. */
export function AccountSwitcherList({ side, businesses, businessPath = "/vendors/dashboard" }: Omit<Props, "userName">) {
    const isCustomer = side.kind === "customer";
    return (
        <div>
            <p className="px-3.5 pb-1 text-[0.75rem] font-medium text-muted">Switch to</p>
            <ul className="space-y-0.5">
                <li>
                    <Link href="/account" aria-current={isCustomer ? "true" : undefined} className={`${ROW} ${isCustomer ? ROW_ACTIVE : ROW_IDLE}`}>
                        <UserRound className="size-4 shrink-0" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">Customer account</span>
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
                                <Store className="size-4 shrink-0" aria-hidden />
                                <span className="min-w-0 flex-1 truncate">{b.vendor_name}</span>
                                {b.member_role === "manager" && <span className="text-[0.6875rem] text-soft">Manager</span>}
                            </Link>
                        </li>
                    );
                })}
            </ul>
            <div className="my-2 border-t border-line" />
            <Link href="/vendors/register" className={`${ROW} ${ROW_IDLE}`}>
                <Plus className="size-4 shrink-0" aria-hidden />
                {businesses.length ? "Register another business" : "Register a business"}
            </Link>
        </div>
    );
}

/** The header button showing where you are, opening the list. On phones the list is in the menu drawer. */
export function AccountSwitcher(props: Props) {
    const { name, role } = current(props);
    const initial = name.trim().charAt(0).toUpperCase() || "?";
    return (
        <details className="group relative min-w-0">
            <summary
                aria-label={`${name}, ${role}. Switch account`}
                className="flex min-w-0 cursor-pointer list-none items-center gap-2.5 rounded-[10px] px-1.5 py-1 hover:bg-surface-2 [&::-webkit-details-marker]:hidden"
            >
                <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
                    {initial}
                </span>
                <span className="hidden min-w-0 leading-tight min-[420px]:block">
                    <span className="block max-w-44 truncate text-sm font-semibold">{name}</span>
                    <span className="block text-[0.75rem] text-muted">{role}</span>
                </span>
                <ChevronDown className="hidden size-4 shrink-0 text-soft transition-transform group-open:rotate-180 lg:block" aria-hidden />
            </summary>
            <div className="absolute right-0 z-50 mt-2 hidden w-72 rounded-xl border border-line bg-surface p-2 shadow-raised lg:block">
                <AccountSwitcherList side={props.side} businesses={props.businesses} businessPath={props.businessPath} />
            </div>
        </details>
    );
}
