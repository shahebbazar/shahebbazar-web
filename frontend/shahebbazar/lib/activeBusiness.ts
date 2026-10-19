// The business a vendor is currently working on (KAN-251).

export const ACTIVE_BUSINESS_COOKIE = "shaheb_active_business";

/** Link that switches to another business and opens the same dashboard page there. */
export function switchHref(vendorId: number, path = "/vendors/dashboard"): string {
    return `/vendors/switch?to=${vendorId}&next=${encodeURIComponent(path)}`;
}
