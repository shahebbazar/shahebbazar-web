#!/usr/bin/env node
// ER diagram generator.

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const OUT = path.join(__dirname, "..", "..", "docs", "ER-DIAGRAM.md");

// Tables grouped by area, one diagram each, so no single picture has to hold every table.
const AREAS = [
    {
        title: "Accounts and sign-in",
        note: "Phone number is the account identifier; one account can own several businesses.",
        tables: ["users", "otp_codes", "sessions", "vendors"],
    },
    {
        title: "Businesses",
        note: "Everything a business profile shows. Only approved businesses are public.",
        tables: [
            "vendors", "locations", "categories", "vendor_categories", "vendor_opening_hours",
            "vendor_facts", "vendor_photos", "vendor_social_links", "vendor_payment_methods",
        ],
    },
    {
        title: "Products and services",
        note: "Listings and their photos. Only approved listings are public.",
        tables: ["vendors", "vendor_listings", "listing_photos", "categories"],
    },
    {
        title: "Quotations and messaging",
        note: "Request for quote, the vendor's response, and buyer/seller conversations.",
        tables: ["users", "vendors", "vendor_listings", "quote_requests", "quote_responses", "conversations", "messages", "notifications"],
    },
    {
        title: "Reviews, moderation and saved businesses",
        note: "Customer reviews, reports of bad content, the admin audit trail, and bookmarks.",
        tables: ["users", "vendors", "reviews", "reports", "audit_logs", "saved_businesses"],
    },
    {
        title: "Analytics and events",
        note: "Search logs and profile views feed the admin trends and the provider dashboard. No personal data is stored.",
        tables: ["vendors", "categories", "locations", "search_logs", "vendor_profile_views", "vendor_search_impressions", "events"],
    },
];

/** PostgreSQL type -> a single word Mermaid accepts. */
function mermaidType(col) {
    const map = {
        "character varying": "varchar",
        character: "char",
        "timestamp with time zone": "timestamptz",
        "time without time zone": "time",
        integer: "int",
    };
    return map[col.data_type] ?? col.data_type.replace(/\s+/g, "_");
}

async function readSchema(db) {
    const columns = await db.query(
        `SELECT c.table_name, c.column_name, c.data_type, c.is_nullable = 'YES' AS nullable, c.ordinal_position
         FROM information_schema.columns c
         JOIN information_schema.tables t
           ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
         WHERE c.table_schema = 'public'
         ORDER BY c.table_name, c.ordinal_position`
    );

    // Every PRIMARY KEY, UNIQUE and FOREIGN KEY constraint with its columns.
    const constraints = await db.query(
        `SELECT con.contype AS type, rel.relname AS table_name, con.conname AS name,
                -- ::text because node-pg returns a name[] as the raw string "{a,b}".
                array_agg(att.attname::text ORDER BY k.ord) AS columns,
                frel.relname AS ref_table
         FROM pg_constraint con
         JOIN pg_class rel ON rel.oid = con.conrelid
         JOIN pg_namespace ns ON ns.oid = rel.relnamespace AND ns.nspname = 'public'
         CROSS JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
         JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = k.attnum
         LEFT JOIN pg_class frel ON frel.oid = con.confrelid
         WHERE con.contype IN ('p', 'u', 'f')
         GROUP BY con.contype, rel.relname, con.conname, frel.relname
         ORDER BY rel.relname, con.conname`
    );

    const views = await db.query(
        `SELECT table_name FROM information_schema.views WHERE table_schema = 'public' ORDER BY 1`
    );

    const tables = new Map();
    for (const c of columns.rows) {
        if (!tables.has(c.table_name)) tables.set(c.table_name, { name: c.table_name, columns: [], pk: [], uniques: [], fks: [] });
        tables.get(c.table_name).columns.push(c);
    }
    for (const k of constraints.rows) {
        const t = tables.get(k.table_name);
        if (!t) continue;
        if (k.type === "p") t.pk = k.columns;
        if (k.type === "u") t.uniques.push(k.columns);
        if (k.type === "f") t.fks.push({ columns: k.columns, ref: k.ref_table, name: k.name });
    }
    return { tables, views: views.rows.map((v) => v.table_name) };
}

function entity(t) {
    const fkCols = new Set(t.fks.flatMap((f) => f.columns));
    const singleUnique = new Set(t.uniques.filter((u) => u.length === 1).map((u) => u[0]));
    const lines = t.columns.map((c) => {
        const keys = [];
        if (t.pk.includes(c.column_name)) keys.push("PK");
        if (fkCols.has(c.column_name)) keys.push("FK");
        if (singleUnique.has(c.column_name)) keys.push("UK");
        return `        ${mermaidType(c)} ${c.column_name}${keys.length ? " " + keys.join(", ") : ""}${c.nullable ? ' "nullable"' : ""}`;
    });
    return `    ${t.name} {\n${lines.join("\n")}\n    }`;
}

// One line per foreign key.
function relationships(t) {
    return t.fks.map((fk) => {
        const cols = t.columns.filter((c) => fk.columns.includes(c.column_name));
        const required = cols.every((c) => !c.nullable);
        const oneToOne =
            (t.pk.length === fk.columns.length && fk.columns.every((c) => t.pk.includes(c))) ||
            t.uniques.some((u) => u.length === fk.columns.length && fk.columns.every((c) => u.includes(c)));
        const parentSide = required ? "||" : "o|";
        const childSide = oneToOne ? "o|" : "o{";
        return `    ${fk.ref} ${parentSide}--${childSide} ${t.name} : "${fk.columns.join(", ")}"`;
    });
}

function diagram(tables, names) {
    const inArea = names ? new Set(names) : new Set(tables.keys());
    const list = [...tables.values()].filter((t) => inArea.has(t.name));
    const rels = list.flatMap((t) => relationships(t).filter((line) => inArea.has(line.trim().split(" ")[0])));
    return ["```mermaid", "erDiagram", ...rels, ...list.map(entity), "```"].join("\n");
}

async function main() {
    const db = new Client({
        host: process.env.PGHOST || "localhost",
        user: process.env.PGUSER || "postgres",
        password: process.env.PGPASSWORD,
        port: Number(process.env.PGPORT) || 5432,
        database: process.env.PGDATABASE || "shahebbazar",
    });
    await db.connect();
    let schema;
    try {
        schema = await readSchema(db);
    } finally {
        await db.end();
    }
    const { tables, views } = schema;

    const areaTables = new Set(AREAS.flatMap((a) => a.tables));
    const unplaced = [...tables.keys()].filter((t) => !areaTables.has(t));
    const unknown = [...areaTables].filter((t) => !tables.has(t));
    if (unknown.length) throw new Error(`AREAS names tables that do not exist: ${unknown.join(", ")}`);

    const fkCount = [...tables.values()].reduce((n, t) => n + t.fks.length, 0);

    const md = [
        "# Shahebbazar — ER diagram",
        "",
        "<!-- Generated by backend/scripts/generate-erd.js. Do not edit by hand: run `npm run docs:erd`. -->",
        "",
        `Generated from the live PostgreSQL schema: **${tables.size} tables**, **${fkCount} foreign keys** and **${views.length} views** (${views.map((v) => `\`${v}\``).join(", ")}; views are not drawn).`,
        "",
        "How to read it: `PK` primary key, `FK` foreign key, `UK` unique. Each line joins a parent (left) to a child (right):",
        "`||--o{` one parent to many children, `o|--o{` optional parent, `||--o|` one-to-one. The label is the foreign-key column.",
        "",
        "The schema itself is in `database/baseline/schema.sql`; `database/README.md` explains how it is loaded and changed, and `database/legacy/SCHEMA-NOTES.md` records the reasoning behind the v2 design.",
        "",
        ...AREAS.flatMap((a, i) => [`## ${i + 1}. ${a.title}`, "", a.note, "", diagram(tables, a.tables), ""]),
        "## All tables",
        "",
        "Every table and relationship in one diagram. Large; the sections above are easier to read.",
        "",
        diagram(tables),
        "",
    ].join("\n");

    fs.writeFileSync(OUT, md);
    console.log(`Wrote ${path.relative(process.cwd(), OUT)}: ${tables.size} tables, ${fkCount} foreign keys, ${views.length} views.`);
    if (unplaced.length) console.warn(`Not in any area diagram (add to AREAS): ${unplaced.join(", ")}`);
}

main().catch((err) => {
    console.error(`ER diagram generation failed: ${err.message}`);
    process.exit(1);
});
