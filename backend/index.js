// Shahebbazar API server.

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const pool = require('./db');
const { verifySchema, reportSchemaAtStartup } = require('./lib/verifySchema');
const { UPLOAD_DIR, ensureUploadDir } = require('./lib/uploads');
const { setupDatabase } = require('./lib/setupDatabase');

const vendorsRouter = require('./routes/vendors');
const vendorListingsRouter = require('./routes/vendorListings');
const publicRouter = require('./routes/public');
const paymentMethodsRouter = require('./routes/paymentMethods');
const analyticsRouter = require('./routes/analytics');
const vendorDashboardRouter = require('./routes/vendorDashboard');
const vendorProfileRouter = require('./routes/vendorProfile');
const adminModerationRouter = require('./routes/adminModeration');
const seoRouter = require('./routes/seo');
const docsRouter = require('./routes/docs');
const accountRouter = require('./routes/account');
const reviewsRouter = require('./routes/reviews');
const messagesRouter = require('./routes/messages');
const reportsRouter = require('./routes/reports');
const eventsRouter = require('./routes/events');
const vendorSettingsRouter = require('./routes/vendorSettings');
const adminCategoriesRouter = require('./routes/adminCategories');
const marketingRouter = require('./routes/marketing');
const consentsRouter = require('./routes/consents');
const adminSettingsRouter = require('./routes/adminSettings');
const campaignsRouter = require('./routes/campaigns');
const { startNotificationWorker } = require('./lib/notify');
const { startAccountRemoval } = require('./lib/accountDeletion');
const authRouter = require("./routes/auth");

const {
    resolveSession,
    requireAuthenticatedUser,
    requireRole
} = require("./lib/middleware/auth");

const app = express();
app.disable('x-powered-by');
const PORT = process.env.PORT || 4000;

// Behind a proxy, trust it to report the visitor's real IP; the analytics visitor hash depends on it.
if (process.env.TRUST_PROXY) {
    const hops = process.env.TRUST_PROXY;
    app.set('trust proxy', /^\d+$/.test(hops) ? Number(hops) : hops);
}

// Allowed browser origins, comma-separated in CORS_ORIGIN.
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim());

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
app.use(resolveSession); // Populates req.user and req.session if a valid session cookie is present.

app.use('/api/auth', authRouter);

// Serves the paths stored in listing_photos.photo_url and vendors.vendor_cover_url.
app.use('/uploads', express.static(UPLOAD_DIR));

// Every admin route, in any router, needs a signed-in admin. Applied before the routers so new ones are covered too.
app.use('/api/admin', requireRole("admin"));

app.use('/api/vendors', vendorsRouter);
app.use('/api', vendorListingsRouter);
app.use('/api', publicRouter);
app.use('/api', paymentMethodsRouter);
app.use('/api', analyticsRouter);
app.use('/api', vendorDashboardRouter);
app.use('/api', vendorProfileRouter);
app.use('/api', adminModerationRouter);
app.use('/api', seoRouter);
app.use('/api', docsRouter);
app.use('/api', accountRouter);
app.use('/api', reviewsRouter);
app.use('/api', messagesRouter);
app.use('/api', reportsRouter);
app.use('/api', eventsRouter);
app.use('/api', vendorSettingsRouter);
app.use('/api', adminCategoriesRouter);
app.use('/api', marketingRouter);
app.use('/api', consentsRouter);
app.use('/api', adminSettingsRouter);
app.use('/api', campaignsRouter);

app.get(
    "/api/auth/me",
    requireAuthenticatedUser,
    (req, res) => {
        res.json({
            authenticated: true,
            user: req.user
        });
    }
);
// GET /api/health: reports connectivity and schema completeness separately.
app.get('/api/health', async (req, res) => {
    let time;

    try {
        const result = await pool.query('SELECT NOW()');
        time = result.rows[0].now;
    } catch (err) {
        return res.status(503).json({
            ok: false,
            db: false,
            error: err.message,
            hint: connectionHint(err.code),
        });
    }

    const schema = await verifySchema();

    if (!schema.ok) {
        return res.status(503).json({
            ok: false,
            db: true,
            time,
            schema: { ok: false, missing: schema.missing },
            hint:
                `Database reachable but incomplete. Missing objects are defined in: ` +
                `${schema.missingFiles.join(', ')}. Run "npm run db:reset" from the repository root to rebuild it.`,
        });
    }

    res.json({ ok: true, db: true, schema: { ok: true }, time });
});

app.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.send(`Backend running - DB Time: ${result.rows[0].now}`);
    } catch (err) {
        res.status(503).send(`Backend running - DB unreachable: ${err.message}`);
    }
});

/** Maps a PostgreSQL connection error code to a remediation message. */
function connectionHint(code) {
    switch (code) {
        case 'ECONNREFUSED':
            return 'PostgreSQL is not accepting connections. Verify the service is running.';
        case '28P01':
            return 'Authentication failed. Verify PGPASSWORD in backend/.env.';
        case '3D000':
            return 'Database does not exist. Run "npm run db:load" from the repository root.';
        default:
            return undefined;
    }
}

// Uploads fail with ENOENT if their folder is missing, so create it before accepting requests.
ensureUploadDir();

// On servers where nobody can run commands in the containers, the API sets up its own database
// (DB_AUTO_SETUP=true, lib/setupDatabase.js). The database may still be starting, so it retries.
async function autoSetup() {
    if (process.env.DB_AUTO_SETUP !== 'true') return;
    for (let attempt = 1; ; attempt++) {
        const client = await pool.connect().catch((err) => err);
        if (!(client instanceof Error)) {
            try {
                await setupDatabase(client, { uploadDir: UPLOAD_DIR });
                return;
            } finally {
                client.release();
            }
        }
        if (attempt >= 15) throw client;
        console.log(`Database setup: waiting for the database (${client.code || client.message})`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
    }
}

autoSetup().then(() => {
    const server = app.listen(PORT, () => {
        console.log(`API running on http://localhost:${PORT}`);
        reportSchemaAtStartup();
        startNotificationWorker();
        startAccountRemoval();
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`\n  Port ${PORT} is already in use.`);
            console.error('  Stop the existing process and start again:\n');
            console.error(`    npx kill-port ${PORT}\n`);
            process.exit(1);
        }
        throw err;
    });
}).catch((err) => {
    console.error('Database setup failed, so the API is not starting:', err);
    process.exit(1);
});
