// Interface copy for the business owner's area, in English and Bangla (KAN-328): the navigation,
// each tab's heading and the Dashboard page. The forms inside each tab are still English only.

import type { Locale } from "./i18n";

const en = {
    navLabel: "Provider",
    navDashboard: "Dashboard",
    navBusiness: "My Business",
    navListings: "Products & Services",
    navPayments: "Payment Methods",
    navReviews: "Reviews",
    navMessages: "Messages",
    navEvents: "Events",
    navMarketing: "Marketing",
    navSettings: "Settings",

    // --- each tab's heading and introduction ---
    businessTitle: "Edit Business",
    businessIntro: "Fill in the details below so customers can find and trust your business.",
    listingsIntro: "What you sell or offer. New listings are checked by an administrator before they appear on your public page.",
    paymentsIntro:
        "Customers see these on your business profile, so they know how they can pay before they visit or order. Payment is made to you directly; Shahebbazar does not take or handle payments.",
    reviewsIntro: "{ratings} ratings · average {average} · {written} written reviews. Unanswered reviews are listed first.",
    messagesIntro: "Every conversation customers have started with your business.",
    inquiriesTitle: "Inquiries",
    inquiriesIntro: "Questions customers sent with the “Ask about this” button on one of your products.",
    eventsIntroApproval:
        "Fairs, sales, tastings, workshops: anything you're running. Events appear on the Events page once an administrator approves them, and customers can say they're interested or going.",
    eventsIntroDirect:
        "Fairs, sales, tastings, workshops: anything you're running. Events appear on the Events page as soon as you add them, and customers can say they're interested or going.",
    eventsAdd: "Add an event",
    marketingIntro: "Write offers for your customers by email, Facebook and WhatsApp, from your own products.",
    marketingOff:
        "Marketing tools aren't switched on yet. When they are, you can promote your products by email, Facebook and WhatsApp from here.",
    settingsIntroOwner: "Your own contact details, and who can manage this business.",
    settingsIntroAdmin: "The owner's contact details, and who manages this business.",

    // --- Dashboard ---
    dashTitle: "Provider Dashboard",
    dashIntro: "Manage your business profile, services and track your performance.",
    businessId: "Business ID: {code}",
    statusPending: "Your business is awaiting approval. It will appear in search and on its public page once an administrator approves it.",
    statusDraft: "Your business is a draft. Submit it for approval to make it public.",
    statusRejected: "Your business was not approved, so it is not public.",
    statusSuspended: "Your business has been suspended and is hidden from customers.",
    reason: "Reason:",
    chooseTitle: "Choose a business",
    chooseNone: "No businesses are connected to this vendor account.",

    profileViews: "Profile Views",
    searchAppearances: "Search Appearances",
    activeListings: "Active Listings",
    averageRating: "Average Rating",
    changeNew: "New",
    changeNone: "No change",
    noDataYet: "No data yet",
    vsPrevious: "vs previous {days} days",
    inLastDays: "in the last {days} days",
    awaitingApproval: "· {count} awaiting approval",
    noReviewsYet: "No reviews yet",
    reviewCountOne: "({count} review)",
    reviewCountMany: "({count} reviews)",

    analyticsTitle: "Analytics Overview",
    periodLabel: "Period",
    periodDays: "{days} days",
    searchNote: "Search appearances count the first page of results for typed searches.",
    chartToday: "Today so far",
    chartTodayShort: "today so far",
    chartLabel:
        "Daily profile views and search appearances from {from} to {to}. Use the arrow keys to read each day, or open the data table below.",
    chartTable: "Show as table",
    chartDay: "Day",

    alertsTitle: "Alerts",
    alertsNew: "Alerts ({count} new)",
    alertsMarkRead: "Mark all as read",
    alertsNone: "No alerts yet. New customer messages will show here.",
    alertsMessage: "New message from {from}: “{preview}”",

    previewTitle: "My Business Preview",
    viewPublic: "View Public Profile",
    verified: "Verified",
    inRajshahi: "{area}, Rajshahi",
    open: "Open",
    closed: "Closed",
    closesAt: "Closes {time}",
    shortDescription: "Short Description",
    phone: "Phone",
    email: "Email",
    notAdded: "Not added",
    joined: "Joined",
    editBusiness: "Edit Business",
    publicOnceApproved: "Public profile appears once approved",

    manageAll: "Manage All",
    noListings: "Nothing listed yet. Add the products or services customers can ask you about.",
    uncategorised: "Uncategorised",
    priceOnRequest: "Price on request",
    addService: "Add New Service",

    quickActions: "Quick Actions",
    addServiceBody: "List a new service or product",
    paymentsBody: "Show customers how they can pay",
    viewPublicBody: "See your page as customers do",
    viewPublicLater: "Available once your business is approved",
    replyReviews: "View & Reply Reviews",
    replyReviewsBody: "Engage with your customers",
    soon: "Soon",

    // --- moderation state of a business or listing ---
    stateApproved: "Live",
    statePending: "Awaiting approval",
    stateRejected: "Rejected",
    stateSuspended: "Suspended",
    stateDraft: "Draft",
    stateArchived: "Archived",
} as const;

const bn: Record<keyof typeof en, string> = {
    navLabel: "ব্যবসা",
    navDashboard: "ড্যাশবোর্ড",
    navBusiness: "আমার ব্যবসা",
    navListings: "পণ্য ও সেবা",
    navPayments: "পেমেন্ট পদ্ধতি",
    navReviews: "রিভিউ",
    navMessages: "মেসেজ",
    navEvents: "ইভেন্ট",
    navMarketing: "মার্কেটিং",
    navSettings: "সেটিংস",

    businessTitle: "ব্যবসার তথ্য সম্পাদনা",
    businessIntro: "নিচের তথ্যগুলো পূরণ করুন, যাতে গ্রাহকেরা আপনার ব্যবসা খুঁজে পান এবং ভরসা করতে পারেন।",
    listingsIntro: "আপনি যা বিক্রি করেন বা যে সেবা দেন। নতুন পণ্য বা সেবা আপনার পাবলিক পাতায় দেখানোর আগে একজন অ্যাডমিন যাচাই করেন।",
    paymentsIntro:
        "গ্রাহকেরা এগুলো আপনার ব্যবসার প্রোফাইলে দেখেন, তাই আসার বা অর্ডার করার আগেই জানতে পারেন কীভাবে পেমেন্ট করবেন। পেমেন্ট সরাসরি আপনাকে করা হয়; সাহেববাজার কোনো পেমেন্ট নেয় না বা পরিচালনা করে না।",
    reviewsIntro: "{ratings}টি রেটিং · গড় {average} · {written}টি লিখিত রিভিউ। যেগুলোর উত্তর দেওয়া হয়নি, সেগুলো আগে দেখানো হয়।",
    messagesIntro: "গ্রাহকেরা আপনার ব্যবসার সঙ্গে যত কথোপকথন শুরু করেছেন, সব এখানে।",
    inquiriesTitle: "জিজ্ঞাসা",
    inquiriesIntro: "আপনার কোনো পণ্যের “এ বিষয়ে জিজ্ঞাসা করুন” বোতাম দিয়ে গ্রাহকেরা যে প্রশ্ন পাঠিয়েছেন।",
    eventsIntroApproval:
        "মেলা, সেল, টেস্টিং, কর্মশালা: আপনি যা আয়োজন করছেন। একজন অ্যাডমিন অনুমোদন করলে ইভেন্টগুলো ইভেন্ট পাতায় দেখা যায়, আর গ্রাহকেরা জানাতে পারেন তাঁরা আগ্রহী বা যাচ্ছেন।",
    eventsIntroDirect:
        "মেলা, সেল, টেস্টিং, কর্মশালা: আপনি যা আয়োজন করছেন। যোগ করার সঙ্গে সঙ্গে ইভেন্টগুলো ইভেন্ট পাতায় দেখা যায়, আর গ্রাহকেরা জানাতে পারেন তাঁরা আগ্রহী বা যাচ্ছেন।",
    eventsAdd: "ইভেন্ট যোগ করুন",
    marketingIntro: "আপনার নিজের পণ্য থেকে ইমেইল, ফেসবুক ও হোয়াটসঅ্যাপে গ্রাহকদের জন্য অফার লিখুন।",
    marketingOff:
        "মার্কেটিং টুল এখনও চালু হয়নি। চালু হলে এখান থেকে ইমেইল, ফেসবুক ও হোয়াটসঅ্যাপে আপনার পণ্যের প্রচার করতে পারবেন।",
    settingsIntroOwner: "আপনার নিজের যোগাযোগের তথ্য, এবং কারা এই ব্যবসা পরিচালনা করতে পারেন।",
    settingsIntroAdmin: "মালিকের যোগাযোগের তথ্য, এবং কারা এই ব্যবসা পরিচালনা করেন।",

    dashTitle: "ব্যবসা ড্যাশবোর্ড",
    dashIntro: "আপনার ব্যবসার প্রোফাইল ও সেবা পরিচালনা করুন এবং পারফরম্যান্স দেখুন।",
    businessId: "ব্যবসা আইডি: {code}",
    statusPending: "আপনার ব্যবসা অনুমোদনের অপেক্ষায় আছে। একজন অ্যাডমিন অনুমোদন করলে এটি সার্চে এবং এর পাবলিক পাতায় দেখা যাবে।",
    statusDraft: "আপনার ব্যবসা এখনও খসড়া। পাবলিক করতে অনুমোদনের জন্য জমা দিন।",
    statusRejected: "আপনার ব্যবসা অনুমোদিত হয়নি, তাই এটি পাবলিক নয়।",
    statusSuspended: "আপনার ব্যবসা স্থগিত করা হয়েছে এবং গ্রাহকদের কাছ থেকে লুকানো আছে।",
    reason: "কারণ:",
    chooseTitle: "একটি ব্যবসা বেছে নিন",
    chooseNone: "এই অ্যাকাউন্টের সঙ্গে কোনো ব্যবসা যুক্ত নেই।",

    profileViews: "প্রোফাইল ভিউ",
    searchAppearances: "সার্চে দেখানো",
    activeListings: "সক্রিয় পণ্য ও সেবা",
    averageRating: "গড় রেটিং",
    changeNew: "নতুন",
    changeNone: "কোনো পরিবর্তন নেই",
    noDataYet: "এখনও কোনো তথ্য নেই",
    vsPrevious: "আগের {days} দিনের তুলনায়",
    inLastDays: "গত {days} দিনে",
    awaitingApproval: "· {count}টি অনুমোদনের অপেক্ষায়",
    noReviewsYet: "এখনও কোনো রিভিউ নেই",
    reviewCountOne: "({count}টি রিভিউ)",
    reviewCountMany: "({count}টি রিভিউ)",

    analyticsTitle: "পরিসংখ্যান",
    periodLabel: "সময়কাল",
    periodDays: "{days} দিন",
    searchNote: "টাইপ করা সার্চের প্রথম পাতার ফলাফলে দেখানো হলে তা সার্চে দেখানো হিসেবে গোনা হয়।",
    chartToday: "আজ এ পর্যন্ত",
    chartTodayShort: "আজ এ পর্যন্ত",
    chartLabel:
        "{from} থেকে {to} পর্যন্ত প্রতিদিনের প্রোফাইল ভিউ ও সার্চে দেখানো। প্রতিদিনের সংখ্যা পড়তে তীর-চিহ্নের কী ব্যবহার করুন, অথবা নিচের টেবিল খুলুন।",
    chartTable: "টেবিল হিসেবে দেখুন",
    chartDay: "দিন",

    alertsTitle: "অ্যালার্ট",
    alertsNew: "অ্যালার্ট ({count}টি নতুন)",
    alertsMarkRead: "সবগুলো পড়া হয়েছে",
    alertsNone: "এখনও কোনো অ্যালার্ট নেই। গ্রাহকদের নতুন মেসেজ এখানে দেখা যাবে।",
    alertsMessage: "{from}-এর নতুন মেসেজ: “{preview}”",

    previewTitle: "আমার ব্যবসার প্রিভিউ",
    viewPublic: "পাবলিক প্রোফাইল দেখুন",
    verified: "যাচাইকৃত",
    inRajshahi: "{area}, রাজশাহী",
    open: "খোলা",
    closed: "বন্ধ",
    closesAt: "বন্ধ হবে {time}",
    shortDescription: "সংক্ষিপ্ত বিবরণ",
    phone: "ফোন",
    email: "ইমেইল",
    notAdded: "যোগ করা হয়নি",
    joined: "যোগ দিয়েছেন",
    editBusiness: "ব্যবসার তথ্য সম্পাদনা",
    publicOnceApproved: "অনুমোদনের পর পাবলিক প্রোফাইল দেখা যাবে",

    manageAll: "সব পরিচালনা করুন",
    noListings: "এখনও কিছু যোগ করা হয়নি। গ্রাহকেরা যে পণ্য বা সেবা সম্পর্কে জানতে চাইতে পারেন, সেগুলো যোগ করুন।",
    uncategorised: "বিভাগ নেই",
    priceOnRequest: "দাম জানতে যোগাযোগ করুন",
    addService: "নতুন সেবা যোগ করুন",

    quickActions: "দ্রুত কাজ",
    addServiceBody: "নতুন সেবা বা পণ্য যোগ করুন",
    paymentsBody: "গ্রাহকেরা কীভাবে পেমেন্ট করতে পারেন, তা দেখান",
    viewPublicBody: "গ্রাহকেরা যেভাবে দেখেন, সেভাবে আপনার পাতা দেখুন",
    viewPublicLater: "আপনার ব্যবসা অনুমোদিত হলে পাওয়া যাবে",
    replyReviews: "রিভিউ দেখুন ও উত্তর দিন",
    replyReviewsBody: "গ্রাহকদের সঙ্গে যোগাযোগ রাখুন",
    soon: "শীঘ্রই",

    stateApproved: "প্রকাশিত",
    statePending: "অনুমোদনের অপেক্ষায়",
    stateRejected: "প্রত্যাখ্যাত",
    stateSuspended: "স্থগিত",
    stateDraft: "খসড়া",
    stateArchived: "আর্কাইভ করা",
};

export type ProviderDictionary = Record<keyof typeof en, string>;

export function providerText(locale: Locale): ProviderDictionary {
    return locale === "bn" ? bn : en;
}

const BN_MONTHS = ["জানু", "ফেব্রু", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টে", "অক্টো", "নভে", "ডিসে"];
const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Short month names for the dashboard chart. */
export function shortMonths(locale: Locale): string[] {
    return locale === "bn" ? BN_MONTHS : EN_MONTHS;
}
