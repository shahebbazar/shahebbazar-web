# KAN-317 Category Fallback Images Validation Report

## Jira task

KAN-317: Category-specific fallback images for businesses

## Pull request

[#84](https://github.com/shahebbazar/shahebbazar-web/pull/84): Add category-specific fallback images for businesses
(branch `feat/category-photo-fallback-Pasiii`)

## What it does

A business without a cover photo used to show the first letter of its name on a gradient. It now
shows a photo for its category, so listings look complete before the owner uploads anything.

The new component `components/shared/CategoryFallbackImage.tsx` chooses an image in this order:

1. The business's own image for that spot (its cover, or its logo in the profile avatar).
2. A stock photo for the business's category (41 categories, from Unsplash).
3. The photo of the parent category, for subcategories with no photo of their own (for example
   Tailoring uses the Silk & Textiles photo).
4. `public/images/category-default.svg`, local artwork used when no photo is available or every
   photo fails to load.

If an image fails to load, it moves to the next one in the list. A business listed only under the
broad Services category, or under no category, whose name mentions accounting, bookkeeping, tax,
VAT, audit or financial work gets the accounting photo instead of the general Services photo.

It is used in four places:

| Place | Component | Image |
| --- | --- | --- |
| Business cards (home, search, related businesses) | `shared/BusinessCard.tsx` | Cover |
| Search result rows | `public/SearchResultRow.tsx` | Cover |
| Similar businesses in the profile sidebar | `public/BusinessSidebar.tsx` | Cover |
| Business profile header | `public/BusinessProfile.tsx` | Cover, and the logo in the avatar |

The profile avatar now shows a category photo instead of the business's initial when there is no logo.

## Problems found in review

| Problem | Cause |
| --- | --- |
| The share menu's "More options" button showed the words "git status". | The commit "Fix typo in ShareMenu component" pasted `git status` into the JSX. It is valid JSX, so lint, typecheck and the build all passed. |
| 4 of the 41 stock photos return 404: Tailoring, Raw Silk & Yarn, Plastic & Packaging and Stores. | The Unsplash photo ids no longer exist. |
| A stock photo that failed to load stayed broken on screen instead of moving to the next image. | The page is rendered on the server, and the image can fail before React attaches `onError`, so the failure was never seen. Confirmed by a browser test (below). |
| Any business whose name contained "tax", "audit" or "financial" got the accounting photo, whatever its category. A restaurant called "Financial District Café" would show an accounting office. | The name check ran for every category, although its comment said it was only for broad ones. |
| After moving from one business profile to another, the second business could skip its own cover. | The component remembered that an image had failed and kept that memory for the next business. |
| The profile cover loaded only after scrolling. | It used `loading="lazy"`, although it is at the top of the page. |
| No tests were added. | `docs/TESTING.md` asks for tests with every feature. |

## Fixes made in review

Made by Ari in commit `5db92bc` ("KAN-317 Fix share button text and category fallback image edge
cases"), on top of the pull request's last commit `51484e1`. Three files changed.

### 1. Stray "git status" text on the share button

**File:** `components/shared/ShareMenu.tsx`

The line before the share icon began with `git status`, so the phone's own share-sheet button read
"git status More options". The text was removed, and the line is back to:

```tsx
<Share2 className="size-4" />
```

### 2. Four stock photos that no longer exist

**File:** `components/shared/CategoryFallbackImage.tsx`

The `CATEGORY_PHOTOS` entries for `tailoring`, `raw-silk-yarn`, `plastic-packaging` and `stores`
returned 404 from Unsplash. They were removed rather than replaced, because the component already
falls back to the parent category's photo for an unmapped subcategory:

| Subcategory | Now shows |
| --- | --- |
| Tailoring, Raw Silk & Yarn | Silk & Textiles photo |
| Plastic & Packaging | Light Manufacturing photo |
| Stores | Shopping photo |

The other 37 photo addresses were checked and all return 200.

### 3. Broken images that never fell back

**File:** `components/shared/CategoryFallbackImage.tsx`

Business pages are rendered on the server, so the browser starts loading each image before React
has attached `onError`. A photo that failed in that window stayed broken, because the error was
never seen. The component now keeps a reference to the `<img>` and, once mounted and again whenever
the image changes, checks whether it has already failed:

```tsx
useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth === 0) handleError();
}, [src]);
```

`handleError` is the same step the `onError` handler takes: uploaded image, then logo, then the next
category photo, then the default artwork.

### 4. The name check applied to every category

**File:** `components/shared/CategoryFallbackImage.tsx`

The check that gives businesses with "accounting", "tax", "audit", "financial" and similar words in
their name the accounting photo ran for every business, although its comment said it was meant for
broad categories. It now runs only for businesses in Services or with no category:

```tsx
// Categories too broad to pick a photo from, where the business name is a better guide.
const BROAD_SLUGS = new Set(["", "services"]);

const businessSpecificSlug = BROAD_SLUGS.has(key) && /\b(accounting|...|financial)\b/.test(name)
    ? "accounting"
    : undefined;
```

DigiTax Accounting (Services) still gets the accounting photo; a restaurant or metalworks with
"Tax" or "Financial" in its name keeps its own category's photo.

### 5. Failed images carried over to the next business

**File:** `components/shared/CategoryFallbackImage.tsx`

The component remembers which images failed. Next.js keeps the same component when moving from one
business profile to another, so the second business could inherit the first one's failures and skip
its own cover. `CategoryFallbackImage` is now a small wrapper that gives the inner image a `key`
made from the business's category, name, logo and cover, so React starts a fresh one whenever any
of them changes:

```tsx
export function CategoryFallbackImage(props: CategoryFallbackImageProps) {
    const resetKey = [props.slug, props.businessName, props.logoUrl, props.preferredImageUrl].join("|");
    return <FallbackImage key={resetKey} {...props} />;
}
```

The component's props and how it is used are unchanged.

### 6. Profile cover loaded late

**Files:** `components/shared/CategoryFallbackImage.tsx`, `components/public/BusinessProfile.tsx`

The component now takes a `loading` prop (`"lazy"` by default). The profile cover, the first thing
on the page, passes `loading="eager"` so it starts loading straight away. Cards, search rows and the
sidebar stay lazy.

## Browser tests

Added by Ari in the commit "KAN-317 Add category photo browser tests and PR 84 validation report",
which follows `5db92bc`: the new file `e2e/tests/category-photos.spec.ts`, and a row for it in `e2e/README.md`.

The tests use the existing browser test setup (`e2e/`): a production build of the site and the API
against a throwaway `shahebbazar_e2e` database, with every test failing if the browser logs an
error it did not expect.

How they are built:

- **No dependency on Unsplash.** `page.route("https://images.unsplash.com/**")` answers every stock
  photo with a 1 x 1 PNG, or with a 404 for the photos a test wants to fail. The tests give the same
  result offline and if Unsplash removes a photo.
- **No lasting data changes.** Every public seeded business has a cover, so `withoutCover(slug, …)`
  removes one in the test database for the length of a test and restores the cover and name
  afterwards, even if the test fails.
- **Checked the way a user sees it.** The cover is found by its alt text ("… cover photograph"), and
  the tests check both which image is shown (`src`) and that it actually loaded
  (`naturalWidth > 0`).
- **Expected 404s are declared.** The fallback test allows the browser's "status of 404" errors with
  `allowConsoleError`, as the not-found page test does.

| Test | What it does | Covers |
| --- | --- | --- |
| A business without a cover shows its category's photo, not a letter (desktop and phone) | Removes Uttara Light Engineering's cover, opens its profile, and expects the Metal Fabrication photo, loaded. | The feature itself |
| A missing category photo falls back to the parent category, then the default artwork | Makes the Metal Fabrication photo return 404 and expects the Light Manufacturing photo. Then makes every stock photo return 404 and expects `category-default.svg`, loaded. | Fixes 2 and 3 |
| Only a business in a broad category gets a photo picked from its name | Expects the accounting photo for DigiTax Accounting (Services). Then renames Uttara Light Engineering "Uttara Tax Engineering" and expects the Metal Fabrication photo. | Fix 4 |
| The share menu's own-share-sheet button says only "More options" | Gives the page a `navigator.share` (desktop test browsers have none), opens the share menu, and expects 5 options, one a button named exactly "More options". | Fix 1 |

Run them with the existing public-page tests:

```bash
cd e2e
npx playwright test tests/category-photos.spec.ts tests/public.spec.ts
```

Result: **23 tests, 23 passed** (4 new, 14 existing on desktop, 5 at phone size).

### Do the tests catch the problems?

The same tests were run against the pull request before these fixes (commit `51484e1`):

| Test | Result before the fixes |
| --- | --- |
| Category photo instead of a letter | Passed (this worked already) |
| Fallback to the parent category, then the default artwork | **Failed**: the cover stayed on the missing Metal Fabrication photo |
| Name check only for broad categories | **Failed**: "Uttara Tax Engineering" showed the accounting photo |
| "More options" button text | **Failed**: no button named exactly "More options" |

The existing share-menu test counts the menu's links but not the share-sheet button's text, which
is why it passed with "git status" on the button.

## Manual check

Run against the development stack with a fresh database and four covers removed (DigiTax
Accounting, Rajshahi Craft Outlet, Shaheb Bazar Silk House, Uttara Light Engineering). Each profile
showed the expected photo: accounting, Shopping (Rajshahi Craft Outlet's Stores photo is one of the
missing four, so its parent's is used), silk, and Metal Fabrication.

## Static checks

- `npx eslint components/shared components/public`: passed
- `npx tsc --noEmit`: passed after `npm install`. Before installing, `lib/ogText.ts` failed because
  `harfbuzzjs` was missing from `node_modules`, which is unrelated to this pull request.

## Known limitations

- **Stock photos are loaded from Unsplash.** Pages depend on images.unsplash.com being reachable
  (the local artwork is used if it is not), and Unsplash may remove photos again. Copying them into
  `public/images/categories/` would remove both risks.
- **The category list is written into the component.** A category added later in the database gets
  the default artwork until a photo is added to `CATEGORY_PHOTOS` and `PARENT_BY_SLUG`. A
  `category_photo_url` column would avoid this.
- **Alt text** for the profile cover still says "cover photograph" when a stock photo is shown.
- **Not covered by a test**: moving between two business profiles in the browser, where the fresh
  start for each business matters.
- **Seed data**: every public seeded business has its own cover, so the fallback is only visible
  after removing a cover, or in the profile avatar (no seeded business has a logo).
