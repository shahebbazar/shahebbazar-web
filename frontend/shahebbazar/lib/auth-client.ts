const AUTH_API_BASE =
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    "http://localhost:4000";

export type AuthRole = "customer" | "vendor" | "admin";
export type VerificationPurpose =
    | "login"
    | "register"
    | "recover"
    | "verify";

export type AuthUser = {
    user_id: number;
    user_name: string;
    user_phone: string;
    user_email: string | null;
    user_role: AuthRole;
    user_avatar_url?: string | null;
};
export type LogoutResult =
    | {
          ok: true;
      }
    | {
          ok: false;
          error: string;
      };

export async function logout(): Promise<LogoutResult> {
    try {
        const response = await fetch(
            `${AUTH_API_BASE}/api/auth/logout`,
            {
                method: "POST",
                credentials: "include",
                headers: {
                    Accept: "application/json",
                },
            }
        );

        const body = await response
            .json()
            .catch(() => null);

        if (!response.ok) {
            return {
                ok: false,
                error:
                    body?.error ??
                    `Logout failed (${response.status})`,
            };
        }

        return {
            ok: true,
        };
    } catch (error) {
        console.error("Logout failed:", error);

        return {
            ok: false,
            error:
                "Could not reach the server. Try again.",
        };
    }
}
type RequestVerificationResult =
    | {
        ok: true;
        message: string;
    }
    | {
        ok: false;
        error: string;
    };

type VerifyCodeResult =
    | {
        ok: true;
        user: AuthUser;
        /** Signing in brought back an account deleted less than 30 days ago. */
        reactivated?: boolean;
    }
    | {
        ok: false;
        error: string;
    };

type RegisterCustomerResult =
    | {
        ok: true;
        user: AuthUser;
    }
    | {
        ok: false;
        error: string;
    };

async function readJson(response: Response): Promise<Record<string, unknown>> {
    return response
        .json()
        .catch(() => ({})) as Promise<Record<string, unknown>>;
}

function errorFrom(
    body: Record<string, unknown>,
    fallback: string
): string {
    return typeof body.error === "string"
        ? body.error
        : fallback;
}

export async function requestVerification(input: {
    phone: string;
    purpose: VerificationPurpose;
    expectedRole?: AuthRole;
    /** The SMS's language: "bn" sends it in Bangla. */
    language?: "en" | "bn";
}): Promise<RequestVerificationResult> {
    try {
        const response = await fetch(
            `${AUTH_API_BASE}/api/auth/request-verification`,
            {
                method: "POST",
                credentials: "include",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(input),
            }
        );

        const body = await readJson(response);

        if (!response.ok) {
            return {
                ok: false,
                error: errorFrom(
                    body,
                    "Unable to generate a verification code."
                ),
            };
        }

        return {
            ok: true,
            message:
                typeof body.message === "string"
                    ? body.message
                    : "A verification code has been generated.",
        };
    } catch (error) {
        console.error("Request verification failed:", error);

        return {
            ok: false,
            error: "Unable to contact the authentication service.",
        };
    }
}

export async function verifyCode(input: {
    phone: string;
    purpose: VerificationPurpose;
    code: string;
    expectedRole?: AuthRole;
}): Promise<VerifyCodeResult> {
    try {
        const response = await fetch(
            `${AUTH_API_BASE}/api/auth/verify`,
            {
                method: "POST",
                credentials: "include",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(input),
            }
        );

        const body = await readJson(response);

        if (!response.ok) {
            return {
                ok: false,
                error: errorFrom(
                    body,
                    response.status === 404
                        ? "Code confirmation is not available yet."
                        : "The verification code is invalid or has expired."
                ),
            };
        }

        const user = body.user as AuthUser | undefined;

        if (!user) {
            return {
                ok: false,
                error: "The server did not return an authenticated account.",
            };
        }

        return {
            ok: true,
            user,
            reactivated: body.reactivated === true,
        };
    } catch (error) {
        console.error("Code verification failed:", error);

        return {
            ok: false,
            error: "Unable to contact the authentication service.",
        };
    }
}

export async function registerCustomer(input: {
    name: string;
    phone: string;
    email: string;
    code: string;
    /** "bn" makes Bangla the account's language. */
    language?: "en" | "bn";
}): Promise<RegisterCustomerResult> {
    try {
        const response = await fetch(
            `${AUTH_API_BASE}/api/auth/register/customer`,
            {
                method: "POST",
                credentials: "include",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name: input.name,
                    phone: input.phone,
                    email: input.email || null,
                    code: input.code,
                    language: input.language ?? "en",
                }),
            }
        );

        const body = await readJson(response);

        if (!response.ok) {
            return {
                ok: false,
                error: errorFrom(
                    body,
                    "Unable to create the customer account."
                ),
            };
        }

        const user = body.user as AuthUser | undefined;

        if (!user) {
            return {
                ok: false,
                error:
                    "The server did not return the new customer account.",
            };
        }

        return {
            ok: true,
            user,
        };
    } catch (error) {
        console.error(
            "Customer registration failed:",
            error
        );

        return {
            ok: false,
            error:
                "Unable to contact the registration service.",
        };
    }
}

export type VendorRegistrationInput = {
    vendor_name: string;
    vendor_email: string;
    vendor_phone: string;
    vendor_address: string;
    /** The ids are sent as chosen in the form's lists (GET /api/auth/register/vendor/options). */
    category_id: string;
    location_id: string;
    vendor_description: string;
};

/** What the registration form offers: categories grouped by main category, and areas. */
export type BusinessOptions = {
    categories: { id: number; name: string; parent: string }[];
    areas: { id: number; name: string; city: string }[];
};

/** Creates the business owner's account and business, and signs them in. */
export async function registerVendor(
    input: VendorRegistrationInput & { code: string }
): Promise<RegisterCustomerResult> {
    try {
        const response = await fetch(`${AUTH_API_BASE}/api/auth/register/vendor`, {
            method: "POST",
            credentials: "include",
            headers: { Accept: "application/json", "Content-Type": "application/json" },
            body: JSON.stringify(input),
        });
        const body = await readJson(response);

        if (!response.ok) {
            return { ok: false, error: errorFrom(body, "Unable to register the business.") };
        }

        const user = body.user as AuthUser | undefined;
        if (!user) {
            return { ok: false, error: "The server did not return the new business account." };
        }
        return { ok: true, user };
    } catch (error) {
        console.error("Vendor registration failed:", error);
        return { ok: false, error: "Unable to contact the registration service." };
    }
}