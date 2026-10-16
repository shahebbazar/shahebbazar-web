# KAN-260 Listing Photo Validation Report

## Jira task

KAN-260: Product listing image upload and display

## Problems found

| Symptom | Cause |
| --- | --- |
| Adding a photo failed with `ENOENT … uploads\filename.jpg\<n>.jpg`, and the server path was shown in the form. | `vendorListings.js` gave multer the folder `uploads/filename.jpg`, which does not exist. multer does not create a folder given by a function, so every upload failed before the route ran, and the raw error was sent to the browser. |
| After the folder was fixed, a photo added to an existing listing did not appear on the listing card or in the vendor dashboard; it only appeared in the business's Photos gallery. | The listing already had a main photo from the seed (`uploads/1788…jpg`). Those files were personal test uploads and had been removed, so the main photo pointed at a missing file. The new photo was saved as a secondary photo, and there was no way to change the main photo. |
| The vendor's listing list never showed photos. | `VendorListings.jsx` ignored the `photo_url` the API returned. |
| New listings did not appear on the public page. | Expected behaviour: listings start as `pending` and only approved listings are public. |
| Anyone could create, edit or delete any listing, or upload files to it, without signing in. | The listing and business-image routes had no authentication or ownership checks. |

## Changes

- **Uploads** (`backend/lib/uploads.js`, shared by business and listing images): absolute upload folder (`UPLOAD_DIR`, default `backend/uploads`) created at startup and before every upload; generated file names; JPG, PNG and WEBP only; 5 MB per file; the file's actual bytes are checked; files are deleted when a request fails; plain-language errors with no server paths.
- **Listing photos** (`backend/routes/vendorListings.js`): up to 8 per listing, saved in one transaction with the listing title as alt text; the first photo becomes the main photo; new routes to make a photo the main one and to remove a photo (the next one is promoted); files are removed when no row references them.
- **Access control**: every listing route and every business logo/photo route now requires the signed-in owner of the business, or an admin (`requireVendorOwnership`, new `requireListingOwnership`). Checks run before the upload is read, so a refused request never writes a file.
- **Vendor dashboard**: each listing shows its main photo (or a "No photo" placeholder, including when a stored file is missing); the editor shows the listing's photos with **Make main** and **Remove**; the browser now sends the session cookie with every request.
- **Seed data**: the 10 listing photos and 5 business covers that pointed at removed files were taken out of `database/baseline/seed.sql`, so seeded records show placeholders until proper development images are chosen.

## Automated API tests

`npm test` (from the repository root) builds a throwaway `<PGDATABASE>_test` database from the baseline, starts the real API against it, signs in through the normal OTP flow as a vendor, another vendor, a customer and an admin, runs the tests, and drops the database.

Result: **49 tests, 49 passed.**

| Area | Tests |
| --- | --- |
| Access control | For each of 9 routes (list, create, update, upload photos, make main, remove photo, delete listing, upload logo, upload business photos): signed out → 401, customer → 403, another vendor → 403, and no file written. Owner and admin allowed; unknown listing → 404; invalid id → 400. |
| Vendor journey | New listing is pending with no photos; first upload becomes the main photo and is saved and served; later uploads do not replace the main photo; Make main switches it; pending listings are not public; after admin approval the public page returns the listing with its main photo, and that file is served; removing the main photo promotes the next and deletes the file; a photo from another listing gives 404; deleting the listing removes its photo rows and files. |
| Upload validation | Text file labelled as JPEG, GIF, file over 5 MB and no file are each rejected with a clear message and leave no file behind; errors never contain a server path; the 8-photo limit is enforced; the upload folder is recreated if deleted while the API is running. |
| Business images | The owner can still upload a logo. |

### Do the tests catch regressions?

Two faults were injected temporarily and the suite was re-run:

| Injected fault | Result |
| --- | --- |
| Ownership check removed from "delete a listing" | 5 tests failed |
| Original `uploads/filename.jpg` folder bug restored | 8 tests failed |

Both were reverted and the suite passed again.

## Browser test

A scripted Chrome session (puppeteer-core) ran against the development stack (web on port 3000, API on port 4000), signed in as the owner of Rajshahi Mango Traders, and used the real pages. Result: **13 checks, 13 passed.**

1. The Products & Services page loads the owner's listings (the API accepted the session cookie).
2. Adding a listing with a photo shows "Listing created".
3. The new listing appears in Your Listings with its photo loaded and an "Awaiting approval" badge.
4. Editing the listing shows its current photos; adding a second photo and saving shows both, loaded.
5. **Make main** switches the main photo.
6. The pending listing is not on the public page.
7. After an admin approves it, the listing appears on the public page and its card shows the chosen main photo, loaded.
8. The vendor dashboard has no broken images.

The test listing, its photos and the test sessions were removed afterwards.

## Static checks

- `npm run lint` (changed files): passed
- `npm run typecheck`: passed

## Known limitations

- **Existing development databases** loaded before this change still contain the old seed photo rows that point at missing files, so some seeded listings show a broken image on the public page. Run `npm run db:reset` to rebuild from the corrected seed.
- **Seed photos**: seeded businesses and listings have no photos until suitable development images are chosen (see `database/README.md`).
- **Other routes**: admin, owner-settings, payment-method, review-reply and vendor-message routes are not yet protected on the server. That work is planned as the next step and is not covered here.
