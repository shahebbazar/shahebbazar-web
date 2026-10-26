import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth-server";

// /message/<business>: the "Reply on Shahebbazar" button in campaign emails and the Message button on
// a business page. Signed in, it opens a new message to the business; signed out, it goes to the login
// page, which comes back to the message afterwards. (The account pages themselves send signed-out
// visitors to the login page without remembering where they were going.) ?listing=<id> asks about one product.
export default async function MessageBusiness({
    params,
    searchParams,
}: {
    params: Promise<{ slug: string }>;
    searchParams: Promise<{ listing?: string }>;
}) {
    const [{ slug }, { listing }] = await Promise.all([params, searchParams]);
    const about = typeof listing === "string" && /^\d{1,10}$/.test(listing) ? `&listing=${listing}` : "";
    const target = `/account/messages/new?vendor=${encodeURIComponent(slug)}${about}`;
    const viewer = await getViewer();
    if (!viewer) redirect(`/login?next=${encodeURIComponent(target)}`);
    // Admins have no customer inbox.
    if (viewer.user_role === "admin") redirect(`/business/${encodeURIComponent(slug)}`);
    redirect(target);
}
