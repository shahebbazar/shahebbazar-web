import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { authenticatedApiGet } from "@/lib/auth-server";
import type { AdminCategory } from "@/lib/types";
import { AddCategory, CategoryRow } from "./CategoryControls";

export const metadata: Metadata = {
    title: "Categories",
};

export default async function AdminCategoriesPage() {
    const all = (await authenticatedApiGet<AdminCategory[]>("/admin/categories")) ?? [];
    const mains = all.filter((c) => c.parent_id === null);

    return (
        <AdminShell current="categories">
            <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">Categories</h1>
            <p className="mt-1.5 text-[0.9375rem] text-muted">
                Main categories and their subcategories. Changes show on the site straight away. Hiding a main category also
                hides its subcategories; businesses keep their categories and reappear when you show it again.
            </p>

            <div className="mt-5">
                <AddCategory parentId={null} label="Add main category" />
            </div>

            <ul className="mt-5 space-y-4">
                {mains.map((main) => {
                    const children = all.filter((c) => c.parent_id === main.id);
                    return (
                        <li key={main.id} className="rounded-xl border border-line bg-surface p-4 shadow-card">
                            <CategoryRow category={main} />
                            <div className="mt-3 space-y-2.5 border-l-2 border-line pl-4 sm:ml-12">
                                {children.map((child) => (
                                    <CategoryRow key={child.id} category={child} parentHidden={!main.is_active} />
                                ))}
                                <AddCategory parentId={main.id} label={`Add subcategory to ${main.name}`} />
                            </div>
                        </li>
                    );
                })}
            </ul>
        </AdminShell>
    );
}
