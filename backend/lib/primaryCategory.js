// A business's main category, picked as v_business_cards picks it (its first category in the
// categories' own order). Where a business has no logo, the site shows that category's picture in every
// logo spot, so the same business looks the same everywhere (KAN-333). Works for businesses of any
// status; v_business_cards lists approved ones only.

/** SQL for the main category's slug of the vendor row aliased `alias`, as a scalar subquery. */
const primaryCategorySlug = (alias) =>
    `(SELECT c.category_slug FROM vendor_categories vc JOIN categories c ON c.category_id = vc.category_id
      WHERE vc.vendor_id = ${alias}.vendor_id ORDER BY c.category_sort_order, c.category_id LIMIT 1)`;

module.exports = { primaryCategorySlug };
