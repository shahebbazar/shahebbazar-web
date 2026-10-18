"use client";

import { useRouter } from "next/navigation";
import {
    useState,
    type ChangeEvent,
    type FormEvent,
} from "react";
import {
    IdCard,
    MapPin,
    UserRound,
} from "lucide-react";
import { registerVendor, requestVerification } from "@/lib/auth-client";

const EMPTY_FORM = {
    vendor_name: "",
    vendor_email: "",
    vendor_phone: "",
    vendor_address: "",
    vendor_city: "",
    vendor_nid_reference: "",
};

type VendorForm = typeof EMPTY_FORM;

type FormStatus =
    | {
          type: "success" | "error";
          message: string;
      }
    | null;

// Step 1 collects the business details and sends a code to the phone; step 2 checks the
// code, creates the account and pending business, and signs the owner in.
export function VendorRegistrationForm() {
    const router = useRouter();
    const [form, setForm] =
        useState<VendorForm>(EMPTY_FORM);
    const [stage, setStage] =
        useState<"details" | "verification">("details");
    const [code, setCode] = useState("");
    const [status, setStatus] =
        useState<FormStatus>(null);
    const [submitting, setSubmitting] =
        useState(false);

    function handleChange(
        event: ChangeEvent<HTMLInputElement>
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

        const result = await requestVerification({
            phone: form.vendor_phone,
            purpose: "register",
        });

        setSubmitting(false);

        if (!result.ok) {
            setStatus({ type: "error", message: result.error });
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

        const result = await registerVendor({ ...form, code });

        if (!result.ok) {
            setSubmitting(false);
            setStatus({ type: "error", message: result.error });
            return;
        }

        // Signed in: the dashboard shows the new business as awaiting approval.
        router.push("/vendors/dashboard");
        router.refresh();
    }

    function returnToDetails() {
        setStage("details");
        setCode("");
        setStatus(null);
    }

    if (stage === "verification") {
        return (
            <form
                onSubmit={handleRegistration}
                className="space-y-4 rounded-xl border border-line bg-surface p-5 shadow-raised sm:p-6"
            >
                <div className="rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm leading-6 text-brand-700">
                    <p>Development mode: check the API terminal for the verification code.</p>
                    <p>The code expires after five minutes.</p>
                </div>

                <div>
                    <label
                        htmlFor="vendor-register-code"
                        className="mb-1.5 block text-sm font-medium text-ink"
                    >
                        Verification code sent to {form.vendor_phone}
                    </label>
                    <input
                        id="vendor-register-code"
                        name="code"
                        type="text"
                        value={code}
                        onChange={(event) =>
                            setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
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
                    <p className="mt-1 font-medium text-ink">{form.vendor_name}</p>
                    {form.vendor_email && <p>{form.vendor_email}</p>}
                    <p>{[form.vendor_address, form.vendor_city].filter(Boolean).join(", ")}</p>
                </div>

                {status && (
                    <div role="alert" className="form-status-error mb-0">
                        {status.message}
                    </div>
                )}

                <div className="flex flex-col gap-2">
                    <button
                        type="submit"
                        className="form-button-primary disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={submitting || code.length !== 6}
                    >
                        {submitting ? "Verifying..." : "Complete registration"}
                    </button>
                    <button
                        type="button"
                        onClick={returnToDetails}
                        className="text-sm text-muted underline hover:text-ink"
                        disabled={submitting}
                    >
                        Change details / Resend code
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

            <section className="rounded-xl border border-line bg-surface p-5 shadow-raised sm:p-6">
                <SectionHeading
                    icon={<UserRound className="size-5" />}
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

                    <div className="sm:col-span-2">
                        <Field
                            id="vendor_phone"
                            label="Phone number"
                            type="tel"
                            value={form.vendor_phone}
                            placeholder="Local or international mobile number"
                            onChange={handleChange}
                        />

                        <p className="mt-1.5 text-xs leading-5 text-muted">
                            Enter a local Australian or Bangladesh
                            mobile number, or use international
                            format with a country code.
                        </p>
                    </div>
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

                    <Field
                        id="vendor_city"
                        label="City or area"
                        value={form.vendor_city}
                        placeholder="For example, Kazla"
                        onChange={handleChange}
                    />
                </div>
            </section>

            <section className="rounded-xl border border-line bg-surface p-5 shadow-raised sm:p-6">
                <SectionHeading
                    icon={<IdCard className="size-5" />}
                    title="Identity verification"
                    description="Provide the development NID reference for review."
                />

                <div className="mt-5">
                    <Field
                        id="vendor_nid_reference"
                        label="National ID reference"
                        value={form.vendor_nid_reference}
                        placeholder="National ID reference"
                        onChange={handleChange}
                    />
                </div>

                <p className="mt-3 rounded-lg border border-line bg-surface-2 p-3 text-xs leading-5 text-muted">
                    New business registrations remain pending
                    until the NID reference and business are
                    reviewed.
                </p>
            </section>

            <div className="rounded-xl border border-line bg-surface p-5 shadow-raised sm:p-6">
                <button
                    type="submit"
                    className="form-button-primary disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={submitting}
                >
                    {submitting
                        ? "Sending verification code..."
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
            <label
                htmlFor={id}
                className="mb-1.5 block text-sm font-medium text-ink"
            >
                {label}
                <span
                    className="ml-1 text-error-ink"
                    aria-hidden="true"
                >
                    *
                </span>
            </label>

            <input
                id={id}
                name={id}
                type={type}
                value={value}
                placeholder={placeholder}
                onChange={onChange}
                className="form-input mb-0"
                autoComplete={
                    type === "email"
                        ? "email"
                        : type === "tel"
                          ? "tel"
                          : "off"
                }
                required
            />
        </div>
    );
}