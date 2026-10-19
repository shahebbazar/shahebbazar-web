import { NextResponse, type NextRequest } from "next/server";
import { ACTIVE_BUSINESS_COOKIE } from "@/lib/activeBusiness";

// Remembers which business the vendor is working on, then opens it (KAN-251).
// The pages it redirects to still check that the vendor runs that business.
export function GET(request: NextRequest) {
    const to = request.nextUrl.searchParams.get("to") ?? "";
    const next = request.nextUrl.searchParams.get("next") ?? "/vendors/dashboard";
    const path = /^\/vendors\/dashboard(\/[a-z-]+)*$/.test(next) ? next : "/vendors/dashboard";

    if (!/^\d{1,10}$/.test(to)) {
        return NextResponse.redirect(new URL("/vendors/dashboard", request.url));
    }

    const response = NextResponse.redirect(new URL(`${path}?vendor=${to}`, request.url));
    response.cookies.set(ACTIVE_BUSINESS_COOKIE, to, {
        httpOnly: true,
        sameSite: "lax",
        path: "/vendors",
        maxAge: 60 * 60 * 24 * 365,
    });
    return response;
}
