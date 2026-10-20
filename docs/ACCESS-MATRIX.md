# Role and feature access matrix

Generated from `backend/lib/access.js` by `npm run docs:access`. Edit that file, not this one.

Every protected API route names one feature from this table through `requireFeature(...)`.
Business routes also check that the vendor runs that business (owner or manager, see `vendor_members`).

- **Guest**: not signed in.
- **Customer**: a signed-in shopper.
- **Vendor**: runs at least one business. Vendors keep every customer feature, and can log in through either the customer or the business login.
- **Admin**: platform staff, using the admin login.

| Feature | Guest | Customer | Vendor | Admin | Rule |
| --- | :---: | :---: | :---: | :---: | --- |
| Browse businesses, categories, events and search (`directory.browse`) | Yes | Yes | Yes | Yes |  |
| Account page, saved businesses, offer choices, alerts and own reviews (`account.use`) | - | Yes | Yes | - |  |
| Write a review (`reviews.write`) | - | Yes | Yes | - | not for a business they run |
| Message a business (`messages.send`) | - | Yes | Yes | - | not a business they run |
| Report a business, listing or review (`reports.submit`) | - | Yes | Yes | - |  |
| Register a business (`business.register`) | Yes | Yes | Yes | - | a customer becomes a vendor |
| See the businesses they run (`business.list`) | - | - | Yes | - |  |
| Dashboard figures and analytics (`business.dashboard`) | - | - | Yes | Yes | vendors: own businesses only |
| Edit business details, hours and photos (`business.profile`) | - | - | Yes | Yes | vendors: own businesses only |
| Manage products and services (`business.listings`) | - | - | Yes | Yes | vendors: own businesses only |
| Set accepted payment methods (`business.payments`) | - | - | Yes | Yes | vendors: own businesses only |
| Read and answer customer messages (`business.messages`) | - | - | Yes | - | own businesses only |
| Read the business's reviews (`business.reviews.read`) | - | - | Yes | Yes | vendors: own businesses only |
| Reply to reviews (`business.reviews`) | - | - | Yes | - | own businesses only |
| See who runs the business and their contact details (`business.team.read`) | - | - | Yes | Yes | vendors: own businesses only |
| Edit their own contact details (`business.settings`) | - | - | Yes | - | own businesses only |
| Add or remove managers (`business.team`) | - | - | Yes | - | business owner only |
| See the business's Marketing pass and allowance left (`business.marketing`) | - | - | Yes | Yes | vendors: own businesses only |
| Approve or reject businesses and listings (`admin.approvals`) | - | - | - | Yes |  |
| Handle reports and hide reviews (`admin.moderation`) | - | - | - | Yes |  |
| Manage categories (`admin.categories`) | - | - | - | Yes |  |
| Search trends (`admin.trends`) | - | - | - | Yes |  |
| Activate and manage Marketing passes (`admin.marketing`) | - | - | - | Yes |  |

A guest who tries a protected feature gets 401 (sign in). A signed-in user whose role is not allowed gets 403.
