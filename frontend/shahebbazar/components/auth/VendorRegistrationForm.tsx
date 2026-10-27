"use client";

import { BROWSER_API_BASE } from "@/lib/apiBase";
import { CodeHint } from "./CodeHint";
import { ResendCodeButton } from "./ResendCodeButton";
import { PhoneField } from "./PhoneField";
import { COUNTRY_CODE, displayNational, toNational, toSubmitted } from "./phoneInput";
import { useRouter } from "next/navigation";
import {
    useState,
    type ChangeEvent,
    type FormEvent,
} from "react";
import {
    MapPin,
    Store,
    UserRound,
} from "lucide-react";
import {
    registerVendor,
    requestVerification,
    type BusinessOptions,
} from "@/lib/auth-client";

const EMPTY_FORM = {
    vendor_name: "",
    vendor_email: "",
    vendor_phone: "",
    vendor_address: "",
    location_id: "",
    category_id: "",
    vendor_description: "",
};

// The same limits as the dashboard's business form, which an admin's approval needs.
const DESCRIPTION_MIN = 20;
const DESCRIPTION_MAX = 500;

type VendorForm = typeof EMPTY_FORM;

type FormStatus =
    | {
          type: "success" | "error";
          message: string;
      }
    | null;

// Step 1 collects the business details, including the category, area and description an admin's
// approval needs, and sends a code to the phone.
// Step 2 verifies the code, creates the account and business (pending, unless an admin
// has switched business approval off), and signs the owner in.
//
// When `account` is supplied, the user is already signed in.
// KAN-249 adds the new business to that existing account without
// creating another account or requiring another registration OTP.
export function VendorRegistrationForm({
    account,
    options,
}: {
    account?: {
        name: string;
        phone: string;
    };
    options: BusinessOptions;
}) {
    const router = useRouter();

    const [form, setForm] = useState<VendorForm>({
        ...EMPTY_FORM,
        // The digits after +880 (PhoneField); a signed-in owner's own number to start with.
        vendor_phone: account?.phone ? toNational(account.phone) : "",
    });

    const [stage, setStage] =
        useState<"details" | "verification">("details");

    const [code, setCode] = useState("");
    const [status, setStatus] =
        useState<FormStatus>(null);
    const [submitting, setSubmitting] =
        useState(false);

    // Categories grouped under their main category, as on the dashboard.
    const categoryGroups = [
        ...options.categories.reduce((groups, category) => {
            groups.set(category.parent, [...(groups.get(category.parent) ?? []), category]);
            return groups;
        }, new Map<string, BusinessOptions["categories"]>()),
    ];
    const areaName = options.areas.find((a) => String(a.id) === form.location_id)?.name;
    const descriptionLength = form.vendor_description.trim().length;

    function handleChange(
        event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
    ) {
        const { name, value } = event.target;

        setForm((current) => ({
            ...current,
            [name]: value,
        }));
    }

    async function handleRequestCode(
        event: FormEvent<HTMLFormElement>
    ) {
        event.preventDefault();

        setSubmitting(true);
        setStatus(null);

        // KAN-249:
        // A customer who is already signed in adds the business
        // directly to their existing account.
        if (account) {
            try {
                const response = await fetch(
                 `${BROWSER_API_BASE}/api/auth/register/vendor`,
                 {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        Accept: "application/json",
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ ...form, vendor_phone: toSubmitted(form.vendor_phone) }),
                 }
            );

                const data = (await response
                    .json()
                    .catch(() => null)) as {
                    error?: string;
                    vendor?: {
                        vendor_id: number;
                    };
                } | null;

                if (!response.ok) {
                    setStatus({
                        type: "error",
                        message:
                            data?.error ||
                            "Unable to register the business.",
                    });
                    return;
                }

                if (!data?.vendor) {
                    setStatus({
                        type: "error",
                        message:
                            "The business was created, but its dashboard could not be opened.",
                    });
                    return;
                }

                router.push(
                    `/vendors/dashboard?vendor=${data.vendor.vendor_id}`
                );
                router.refresh();
                return;
            } catch (error) {
                console.error(
                    "Vendor registration failed:",
                    error
                );

                setStatus({
                    type: "error",
                    message:
                        "Unable to contact the registration service.",
                });
                return;
            } finally {
                setSubmitting(false);
            }
        }

        // Signed-out users continue through the normal
        // phone verification registration flow.
        const result = await requestVerification({
            phone: toSubmitted(form.vendor_phone),
            purpose: "register",
        });

        setSubmitting(false);

        if (!result.ok) {
            setStatus({
                type: "error",
                message: result.error,
            });
            return;
        }

        setStage("verification");
    }

    async function handleRegistration(
        event: FormEvent<HTMLFormElement>
    ) {
        event.preventDefault();

        setSubmitting(true);
        setStatus(null);

        const result = await registerVendor({
            ...form,
            vendor_phone: toSubmitted(form.vendor_phone),
            code,
        });

        if (!result.ok) {
            setSubmitting(false);
            setStatus({
                type: "error",
                message: result.error,
            });
            return;
        }

        router.push("/vendors/dashboard");
        router.refresh();
    }

    function returnToDetails() {
        setStage("details");
        setCode("");
        setStatus(null);
    }

    // A new code to the same number, from the code step.
    async function resendCode() {
        setStatus(null);
        setCode("");
        const result = await requestVerification({
            phone: toSubmitted(form.vendor_phone),
            purpose: "register",
        });
        if (!result.ok) setStatus({ type: "error", message: result.error });
        return result.ok;
    }

    if (stage === "verification") {
        return (
            <form
                onSubmit={handleRegistration}
                className="space-y-4 rounded-xl border border-line bg-surface p-5 shadow-raised sm:p-6"
            >
                <CodeHint />

                <div>
                    <label
                        htmlFor="vendor-register-code"
                        className="mb-1.5 block text-sm font-medium text-ink"
                    >
                        Verification code sent to{" "}
                        {COUNTRY_CODE} {displayNational(form.vendor_phone)}
                    </label>

                    <input
                        id="vendor-register-code"
                        name="code"
                        type="text"
                        value={code}
                        onChange={(event) =>
                            setCode(
                                event.target.value
                                    .replace(/\D/g, "")
                                    .slice(0, 6)
                            )
                        }
                        placeholder="Enter the six-digit code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        className="form-input mb-0 text-center text-xl tracking-[0.4em]"
                        required
                    />
                </div>

                <div className="rounded-lg border border-line bg-surface-2 p-3 text-sm text-muted">
                    <p>Registering:</p>

                    <p className="mt-1 font-medium text-ink">
                        {form.vendor_name}
                    </p>

                    {form.vendor_email && (
                        <p>{form.vendor_email}</p>
                    )}

                    <p>
                        {[
                            form.vendor_address,
                            areaName,
                        ]
                            .filter(Boolean)
                            .join(", ")}
                    </p>
                </div>

                {status && (
                    <div
                        role="alert"
                        className="form-status-error mb-0"
                    >
                        {status.message}
                    </div>
                )}

                <div className="flex flex-col gap-2">
                    <button
                        type="submit"
                        className="form-button-primary disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={
                            submitting || code.length !== 6
                        }
                    >
                        {submitting
                            ? "Verifying..."
                            : "Complete registration"}
                    </button>

                    <ResendCodeButton onResend={resendCode} disabled={submitting} />

                    <button
                        type="button"
                        onClick={returnToDetails}
                        className="text-sm text-muted underline hover:text-ink"
                        disabled={submitting}
                    >
                        Change details
                    </button>
                </div>
            </form>
        );
    }

    return (
        <form
            onSubmit={handleRequestCode}
            className="space-y-6"
        >
            {status && (
                <div
                    role={
                        status.type === "error"
                            ? "alert"
                            : "status"
                    }
                    className={
                        status.type === "success"
                            ? "form-status-success mb-0"
                            : "form-status-error mb-0"
                    }
                >
                    {status.message}
                </div>
            )}

            {account && (
                <p className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm leading-6 text-brand-700">
                    You are signed in as{" "}
                    <strong>{account.name}</strong>. The
                    business will be added to this account
                    and you will get a business dashboard.
                    Your saved businesses, reviews and
                    messages stay as they are.
                </p>
            )}

            <section className="rounded-xl border border-line bg-surface p-5 shadow-raised sm:p-6">
                <SectionHeading
                    icon={
                        <UserRound className="size-5" />
                    }
                    title="Business contact"
                    description="Enter the contact details connected to the business account."
                />

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <Field
                        id="vendor_name"
                        label="Business name"
                        value={form.vendor_name}
                        placeholder="Business name"
                        onChange={handleChange}
                    />

                    <Field
                        id="vendor_email"
                        label="Email address"
                        type="email"
                        value={form.vendor_email}
                        placeholder="name@example.com"
                        onChange={handleChange}
                    />

                    <PhoneField
                        id="vendor_phone"
                        value={form.vendor_phone}
                        onChange={(national) => setForm((current) => ({ ...current, vendor_phone: national }))}
                        requiredMark
                    />
                </div>
            </section>

            <section className="rounded-xl border border-line bg-surface p-5 shadow-raised sm:p-6">
                <SectionHeading
                    icon={<MapPin className="size-5" />}
                    title="Business location"
                    description="Add the address customers will use to find the business."
                />

                <div className="mt-5 grid gap-4">
                    <Field
                        id="vendor_address"
                        label="Street address"
                        value={form.vendor_address}
                        placeholder="Business address"
                        onChange={handleChange}
                    />

                    <div>
                        <Label id="location_id" text="Area" />
                        <select
                            id="location_id"
                            name="location_id"
                            value={form.location_id}
                            onChange={handleChange}
                            className="form-input mb-0"
                            required
                        >
                            <option value="">Choose an area</option>
                            {options.areas.map((area) => (
                                <option key={area.id} value={area.id}>
                                    {area.name}, {area.city}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </section>

            <section className="rounded-xl border border-line bg-surface p-5 shadow-raised sm:p-6">
                <SectionHeading
                    icon={<Store className="size-5" />}
                    title="About the business"
                    description="Customers find businesses by category, and an administrator checks this before approving it. More categories, photos and opening hours can be added later from the dashboard."
                />

                <div className="mt-5 grid gap-4">
                    <div>
                        <Label id="category_id" text="Category" />
                        <select
                            id="category_id"
                            name="category_id"
                            value={form.category_id}
                            onChange={handleChange}
                            className="form-input mb-0"
                            required
                        >
                            <option value="">Choose a category</option>
                            {categoryGroups.map(([parent, items]) => (
                                <optgroup key={parent} label={parent}>
                                    {items.map((category) => (
                                        <option key={category.id} value={category.id}>
                                            {category.name}
                                        </option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                    </div>

                    <div>
                        <Label id="vendor_description" text="Description" />
                        <textarea
                            id="vendor_description"
                            name="vendor_description"
                            value={form.vendor_description}
                            onChange={handleChange}
                            rows={4}
                            minLength={DESCRIPTION_MIN}
                            maxLength={DESCRIPTION_MAX}
                            placeholder="What the business sells or does, for example: Fresh Rajshahi mangoes and lychees, delivered across the city in season."
                            aria-describedby="vendor_description-help"
                            className="form-input mb-0"
                            required
                        />
                        <p id="vendor_description-help" className="mt-1.5 flex justify-between text-xs leading-5 text-muted">
                            <span>At least {DESCRIPTION_MIN} characters.</span>
                            <span className="tabular-nums">
                                {descriptionLength} / {DESCRIPTION_MAX}
                            </span>
                        </p>
                    </div>
                </div>
            </section>

            <div className="rounded-xl border border-line bg-surface p-5 shadow-raised sm:p-6">
                <button
                    type="submit"
                    className="form-button-primary disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={submitting}
                >
                    {submitting
                        ? account
                            ? "Registering business..."
                            : "Sending verification code..."
                        : account
                          ? "Register business"
                          : "Continue with phone verification"}
                </button>
            </div>
        </form>
    );
}

function SectionHeading({
    icon,
    title,
    description,
}: {
    icon: React.ReactNode;
    title: string;
    description: string;
}) {
    return (
        <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
                {icon}
            </span>

            <div>
                <h2 className="font-semibold text-ink">
                    {title}
                </h2>

                <p className="mt-1 text-sm leading-6 text-muted">
                    {description}
                </p>
            </div>
        </div>
    );
}

// A required field's label, with its red star.
function Label({ id, text }: { id: keyof VendorForm; text: string }) {
    return (
        <label
            htmlFor={id}
            className="mb-1.5 block text-sm font-medium text-ink"
        >
            {text}
            <span
                className="ml-1 text-error-ink"
                aria-hidden="true"
            >
                *
            </span>
        </label>
    );
}

function Field({
    id,
    label,
    type = "text",
    value,
    placeholder,
    onChange,
}: {
    id: keyof VendorForm;
    label: string;
    type?: string;
    value: string;
    placeholder: string;
    onChange: (
        event: ChangeEvent<HTMLInputElement>
    ) => void;
}) {
    return (
        <div>
            <Label id={id} text={label} />

            <input
                id={id}
                name={id}
                type={type}
                value={value}
                placeholder={placeholder}
                onChange={onChange}
                className="form-input mb-0"
                autoComplete={type === "email" ? "email" : "off"}
                required
            />
        </div>
    );
}