#!/usr/bin/env node
// Writes docs/ACCESS-MATRIX.md from lib/access.js, so the document always matches the code.

const fs = require("fs");
const path = require("path");
const { ROLES, FEATURES } = require("../lib/access");

const out = path.join(__dirname, "..", "..", "docs", "ACCESS-MATRIX.md");

const header = `| Feature | ${ROLES.map((r) => r[0].toUpperCase() + r.slice(1)).join(" | ")} | Rule |`;
const divider = `| --- | ${ROLES.map(() => ":---:").join(" | ")} | --- |`;
const rows = Object.entries(FEATURES).map(
    ([key, f]) => `| ${f.label} (\`${key}\`) | ${ROLES.map((r) => (f.roles.includes(r) ? "Yes" : "-")).join(" | ")} | ${f.rule ?? ""} |`
);

const doc = `# Role and feature access matrix

Generated from \`backend/lib/access.js\` by \`npm run docs:access\`. Edit that file, not this one.

Every protected API route names one feature from this table through \`requireFeature(...)\`.
Business routes also check that the vendor runs that business (owner or manager, see \`vendor_members\`).

- **Guest**: not signed in.
- **Customer**: a signed-in shopper.
- **Vendor**: runs at least one business. Vendors keep every customer feature, and can log in through either the customer or the business login.
- **Admin**: platform staff, using the admin login.

${header}
${divider}
${rows.join("\n")}

A guest who tries a protected feature gets 401 (sign in). A signed-in user whose role is not allowed gets 403.
`;

fs.writeFileSync(out, doc);
console.log(`Wrote ${path.relative(process.cwd(), out)}`);
