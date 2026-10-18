"use server";

import { revalidatePath } from "next/cache";
import { authenticatedApiSend, type AuthenticatedSendResult } from "@/lib/auth-server";
import type { CategoryInput } from "@/lib/types";

// The API checks the forwarded session belongs to an admin.

// Adds a main category, or a subcategory when parentId is given.
export async function createCategory(parentId: number | null, input: CategoryInput): Promise<AuthenticatedSendResult> {
    const result = await authenticatedApiSend("POST", "/admin/categories", { ...input, parent_id: parentId });
    if (result.ok) revalidatePath("/", "layout");
    return result;
}

// Saves a category's names, icon, order and visibility.
export async function updateCategory(id: number, input: CategoryInput, isActive: boolean): Promise<AuthenticatedSendResult> {
    const result = await authenticatedApiSend("PUT", `/admin/categories/${id}`, { ...input, is_active: isActive });
    if (result.ok) revalidatePath("/", "layout");
    return result;
}
