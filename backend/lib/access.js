// Role and feature access matrix (KAN-253). Every protected route names one of these features.
// Vendors keep all customer features, so a customer who registers a business loses nothing.

const ROLES = ["guest", "customer", "vendor", "admin"];

const ALL = ROLES;
const SIGNED_IN = ["customer", "vendor"];
const BUSINESS = ["vendor", "admin"];

const FEATURES = {
    "directory.browse": { roles: ALL, label: "Browse businesses, categories, events and search" },
    "account.use": { roles: SIGNED_IN, label: "Account page, saved businesses, offer choices, alerts and own reviews" },
    "reviews.write": { roles: SIGNED_IN, label: "Write a review", rule: "not for a business they run" },
    "messages.send": { roles: SIGNED_IN, label: "Message a business", rule: "not a business they run" },
    "events.respond": { roles: SIGNED_IN, label: "Mark an event Interested or Going, and see My events" },
    "reports.submit": { roles: SIGNED_IN, label: "Report a business, listing or review" },
    "business.register": { roles: ["guest", "customer", "vendor"], label: "Register a business", rule: "a customer becomes a vendor" },
    "business.list": { roles: ["vendor"], label: "See the businesses they run" },
    "business.dashboard": { roles: BUSINESS, label: "Dashboard figures and analytics", rule: "vendors: own businesses only" },
    "business.profile": { roles: BUSINESS, label: "Edit business details, hours and photos", rule: "vendors: own businesses only" },
    "business.listings": { roles: BUSINESS, label: "Manage products and services", rule: "vendors: own businesses only" },
    "business.payments": { roles: BUSINESS, label: "Set accepted payment methods", rule: "vendors: own businesses only" },
    "business.messages": { roles: ["vendor"], label: "Read and answer customer messages", rule: "own businesses only" },
    "business.reviews.read": { roles: BUSINESS, label: "Read the business's reviews", rule: "vendors: own businesses only" },
    "business.reviews": { roles: ["vendor"], label: "Reply to reviews", rule: "own businesses only" },
    "business.team.read": { roles: BUSINESS, label: "See who runs the business and their contact details", rule: "vendors: own businesses only" },
    "business.settings": { roles: ["vendor"], label: "Edit their own contact details", rule: "own businesses only" },
    "business.team": { roles: ["vendor"], label: "Add or remove managers", rule: "business owner only" },
    "business.events": { roles: BUSINESS, label: "Add, edit and cancel the business's events", rule: "vendors: own businesses only" },
    "business.marketing": { roles: BUSINESS, label: "See the business's Marketing pass, allowance left and campaigns", rule: "vendors: own businesses only" },
    "business.marketing.manage": { roles: ["vendor"], label: "Create, edit and approve marketing campaigns", rule: "own businesses only" },
    "admin.approvals": { roles: ["admin"], label: "Approve or reject businesses, listings and events" },
    "admin.moderation": { roles: ["admin"], label: "Handle reports and hide reviews" },
    "admin.categories": { roles: ["admin"], label: "Manage categories" },
    "admin.trends": { roles: ["admin"], label: "Search trends" },
    "admin.settings": { roles: ["admin"], label: "Turn approval of new businesses and listings on or off" },
    "admin.marketing": { roles: ["admin"], label: "Activate and manage Marketing passes" },
};

function roleOf(req) {
    return req.user?.user_role ?? "guest";
}

function can(role, feature) {
    return FEATURES[feature]?.roles.includes(role) ?? false;
}

/** Route guard: 401 when signing in would help, 403 when the role is not allowed. */
function requireFeature(feature) {
    if (!FEATURES[feature]) throw new Error(`Unknown feature "${feature}" in requireFeature`);

    return (req, res, next) => {
        const role = roleOf(req);
        if (can(role, feature)) return next();

        if (role === "guest") {
            return res.status(401).json({ success: false, error: "Authentication required" });
        }
        return res.status(403).json({ success: false, error: "You do not have permission to perform this action" });
    };
}

module.exports = { ROLES, FEATURES, can, requireFeature };
