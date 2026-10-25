// Image uploads shared by the business-profile, listing and event routes.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { parseId } = require("./currentUser");

// Absolute, so uploads land in the same place whichever directory the process starts in.
// Set UPLOAD_DIR on a server to keep uploads outside the deployed code.
const UPLOAD_DIR = process.env.UPLOAD_DIR
    ? path.resolve(process.env.UPLOAD_DIR)
    : path.join(__dirname, "..", "uploads");

const IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Creates the upload folder if it is missing. */
function ensureUploadDir() {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * Multer middleware for up to maxCount images in one form field.
 * namePrefix(req) starts each generated file name, e.g. "vendor-12" or "listing-40".
 */
function imageUpload(field, maxBytes, maxCount, namePrefix) {
    const storage = multer.diskStorage({
        // A function destination is not created by multer, so make sure it exists on every upload.
        destination: (req, file, cb) =>
            fs.promises.mkdir(UPLOAD_DIR, { recursive: true }).then(() => cb(null, UPLOAD_DIR), cb),
        // File names are generated, and the declared type is checked against the file's actual bytes.
        filename: (req, file, cb) =>
            cb(null, `${namePrefix(req)}-${crypto.randomBytes(12).toString("hex")}.${IMAGE_TYPES[file.mimetype]}`),
    });
    return multer({
        storage,
        limits: { fileSize: maxBytes, files: maxCount },
        fileFilter: (req, file, cb) => {
            if (!IMAGE_TYPES[file.mimetype]) {
                return cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "type"));
            }
            cb(null, true);
        },
    }).array(field, maxCount);
}

/**
 * Validates the id in req.params[param], runs a multer middleware, and turns its errors into
 * plain-language 400 responses. Server paths and internal errors are never sent to the browser.
 */
function receive(middleware, limitLabel, param = "vendorId", label = "vendor") {
    return (req, res, next) => {
        if (parseId(req.params[param]) === null) {
            return res.status(400).json({ error: `Invalid ${label} id` });
        }
        middleware(req, res, (err) => {
            if (!err) return next();
            const known = err instanceof multer.MulterError;
            const message = !known
                ? "The upload could not be saved. Try again."
                : err.code === "LIMIT_FILE_SIZE"
                    ? `Each image must be ${limitLabel} or smaller.`
                    : err.code === "LIMIT_FILE_COUNT" || (err.code === "LIMIT_UNEXPECTED_FILE" && err.field !== "type")
                        ? "Too many files, or the wrong form field."
                        : err.field === "type"
                            ? "Only JPG, PNG or WEBP images can be uploaded."
                            : "The upload could not be read.";
            if (!known) console.error(`Upload to ${req.originalUrl} failed:`, err);
            // multer removes partial files on its own errors.
            res.status(known ? 400 : 500).json({ error: message });
        });
    };
}

/** True when the file's first bytes match its declared image type. */
async function hasImageSignature(file) {
    const handle = await fs.promises.open(file.path, "r");
    try {
        const { buffer } = await handle.read(Buffer.alloc(12), 0, 12, 0);
        if (file.mimetype === "image/jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
        if (file.mimetype === "image/png")
            return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        if (file.mimetype === "image/webp")
            return buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
        return false;
    } finally {
        await handle.close();
    }
}

/** Deletes uploaded files, ignoring any that are already gone. */
async function discard(files) {
    await Promise.all((files ?? []).map((f) => fs.promises.unlink(f.path).catch(() => { })));
}

/** Path as stored in the database and served by express.static. */
const storedPath = (file) => `uploads/${file.filename}`;

/** Sends a 400 and returns false when no file arrived or a file is not really an image. */
async function checkUploads(req, res) {
    const files = req.files ?? [];
    if (files.length === 0) {
        res.status(400).json({ error: "Choose an image to upload." });
        return false;
    }
    for (const file of files) {
        if (!(await hasImageSignature(file))) {
            await discard(files);
            res.status(400).json({ error: `"${file.originalname}" is not a valid image file.` });
            return false;
        }
    }
    return true;
}

/**
 * Deletes the files behind stored "uploads/…" paths that no database row references any more.
 * Paths can be shared between listings, business photos, logos, covers and events, so each is checked first.
 */
async function removeUnreferencedFiles(db, storedPaths) {
    for (const stored of new Set((storedPaths ?? []).filter(Boolean))) {
        if (!stored.startsWith("uploads/")) continue;
        const inUse = await db.query(
            `SELECT 1 FROM listing_photos WHERE photo_url = $1
             UNION ALL SELECT 1 FROM vendor_photos WHERE vendor_photo_url = $1
             UNION ALL SELECT 1 FROM vendors WHERE vendor_logo_url = $1 OR vendor_cover_url = $1
             UNION ALL SELECT 1 FROM event_photos WHERE photo_url = $1
             UNION ALL SELECT 1 FROM events WHERE event_image_url = $1
             LIMIT 1`,
            [stored]
        );
        if (inUse.rowCount > 0) continue;
        // basename keeps the delete inside the upload folder whatever the stored value contains.
        await fs.promises.unlink(path.join(UPLOAD_DIR, path.basename(stored))).catch(() => { });
    }
}

module.exports = {
    UPLOAD_DIR,
    IMAGE_TYPES,
    ensureUploadDir,
    imageUpload,
    receive,
    discard,
    storedPath,
    checkUploads,
    removeUnreferencedFiles,
};
