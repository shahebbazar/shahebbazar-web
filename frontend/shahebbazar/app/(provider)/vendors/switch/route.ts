import { NextResponse, type NextRequest } from "next/server";
import { ACTIVE_BUSINESS_COOKIE } from "@/lib/activeBusiness";

// Remembers which business the vendor is working on, then opens it (KAN-251).
// The pages it redirects to still check that the vendor runs that business.
// The redirects are relative: behind the server's proxy, request.url is the website's address inside
// the server (http://...:3000), not the one the visitor used.
function redirectTo(path: string) {
    return new NextResponse(null, { status: 307, headers: { Location: path } });
}

export function GET(request: NextRequest) {
    const to = request.nextUrl.searchParams.get("to") ?? "";
    const next = request.nextUrl.searchParams.get("next") ?? "/vendors/dashboard";
    const path = /^\/vendors\/dashboard(\/[a-z-]+)*$/.test(next) ? next : "/vendors/dashboard";

    if (!/^\d{1,10}$/.test(to)) {
        return redirectTo("/vendors/dashboard");
    }

    const response = redirectTo(`${path}?vendor=${to}`);
    response.cookies.set(ACTIVE_BUSINESS_COOKIE, to, {
        httpOnly: true,
        sameSite: "lax",
        path: "/vendors",
        maxAge: 60 * 60 * 24 * 365,
    });
    return response;
}
