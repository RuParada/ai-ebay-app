require('dotenv').config({ path: '../.env' }); // Load .env from parent dir
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { generateDescriptionFromFiles } = require('./openaiService');
const { EbayAPI } = require('./ebayService');
const { EtsyAPI } = require('./etsyService');

const app = express();
const port = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

// Set up multer for memory storage (we process image buffer directly)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.post('/api/auth', (req, res) => {
    const expectedPasscode = process.env.APP_PASSCODE;
    if (!expectedPasscode || req.body.passcode === expectedPasscode) {
        return res.json({ success: true });
    }
    return res.status(401).json({ error: "Invalid Passcode" });
});

app.get('/api/etsy/auth', (req, res) => {
    const etsy = new EtsyAPI();
    const authData = etsy.generateAuthUrl();
    res.json(authData);
});

app.post('/api/describe/', upload.array('file'), async (req, res) => {
    try {
        const expectedPasscode = process.env.APP_PASSCODE;
        if (expectedPasscode && req.body.passcode !== expectedPasscode) {
            return res.status(401).json({ error: "Invalid Passcode" });
        }

        const files = req.files;
        if (!files || files.length === 0) {
            return res.status(400).json({ error: "No files found in 'file' field" });
        }

        const hint = (req.body.hint || "").trim();
        const ean = (req.body.ean || "").trim();
        const condition = req.body.condition || "USED_EXCELLENT";
        const listingFormat = req.body.listingFormat || "FIXED_PRICE";

        const publishEbay = req.body.publishEbay !== 'false';
        const publishEtsy = req.body.publishEtsy === 'true';

        const result = await generateDescriptionFromFiles(files, hint, ean);

        // --- Image Enhancement Logic ---
        try {
            const sharp = require('sharp');
            for (let i = 0; i < files.length; i++) {
                // Enhance the image to make it more "sellable" (brighter, more vibrant, sharper)
                const processedBuffer = await sharp(files[i].buffer)
                    .modulate({
                        brightness: 1.05, // slightly brighter
                        saturation: 1.15  // slightly more vibrant colors
                    })
                    .sharpen({
                        sigma: 1, // mild sharpening for product details
                        m1: 1,
                        m2: 1
                    })
                    .jpeg({ quality: 90 }) // enforce standard JPEG format
                    .toBuffer();
                
                files[i].buffer = processedBuffer;
                files[i].originalname = files[i].originalname.replace(/\.[^/.]+$/, "") + ".jpg";
                files[i].mimetype = "image/jpeg";
            }
        } catch (imgErr) {
            console.error("Error enhancing images:", imgErr);
            // Non-fatal, continue with original buffers if processing fails
        }

        // --- Platforms logic ---
        const promises = [];

        if (publishEbay) {
            promises.push((async () => {
                try {
                    const ebay = new EbayAPI();
                    const sku = ean || `SKU-${Date.now()}`;
                    
                    let categoryId = "360";
                    if (result.category_keyword) {
                        categoryId = await ebay.suggestCategory(result.category_keyword);
                    }

                    const imageUrls = [];
                    for (let i = 0; i < files.length; i++) {
                        const file = files[i];
                        const suffix = file.originalname.substring(file.originalname.lastIndexOf('.')).toLowerCase() || '.jpg';
                        const mimeType = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[suffix] || 'image/jpeg';
                        const filename = `photo-${i + 1}${suffix}`;
                        try {
                            const url = await ebay.uploadImageToEbay(file.buffer, mimeType, filename);
                            imageUrls.push(url);
                        } catch (uploadErr) {
                            console.warn(`Could not upload image ${i + 1}:`, uploadErr.message);
                        }
                    }

                    let listingId = null;
                    let offerError = null;
                    try {
                        listingId = await ebay.createTradingListing(sku, result, imageUrls, condition, categoryId, result.custom_specifics || [], listingFormat);
                    } catch (err) {
                        let isConditionError = err.message && (err.message.includes('21916884') || err.message.includes('21916883') || err.message.includes('Condition is not applicable') || err.message.includes('Ungültige Zustands-ID')); 
                        
                        if (isConditionError && categoryId !== "360") {
                            console.warn(`Condition mismatch for category ${categoryId}. Retrying with generic category 360.`);
                            try {
                                listingId = await ebay.createTradingListing(sku, result, imageUrls, condition, "360", result.custom_specifics || [], listingFormat);
                            } catch (retryErr) {
                                offerError = retryErr.message;
                            }
                        } else {
                            offerError = err.response && err.response.data 
                                ? `${err.message}: ${JSON.stringify(err.response.data)}` 
                                : err.message;
                        }
                    }

                    result.ebay = {
                        status: listingId ? 'success' : 'error',
                        sku: sku,
                        listingId: listingId,
                        error: !listingId ? offerError : undefined
                    };
                } catch (err) {
                    result.ebay = {
                        status: 'error',
                        error: err.response && err.response.data ? `${err.message}: ${JSON.stringify(err.response.data)}` : (err.message || String(err))
                    };
                }
            })());
        }

        if (publishEtsy) {
            promises.push((async () => {
                try {
                    const etsy = new EtsyAPI();
                    const sku = ean || `SKU-${Date.now()}`;
                    const draft = await etsy.createDraftListing(sku, result, condition);
                    
                    if (draft && draft.listing_id) {
                        for (let i = 0; i < files.length; i++) {
                            const file = files[i];
                            const suffix = file.originalname.substring(file.originalname.lastIndexOf('.')).toLowerCase() || '.jpg';
                            const mimeType = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[suffix] || 'image/jpeg';
                            const filename = `photo-${i + 1}${suffix}`;
                            try {
                                await etsy.uploadListingImage(draft.listing_id, file.buffer, mimeType, filename);
                            } catch (err) {
                                console.warn(`Etsy image upload failed:`, err.message);
                            }
                        }
                    }
                    
                    result.etsy = {
                        status: 'success',
                        sku: sku,
                        listingId: draft.listing_id
                    };
                } catch (err) {
                    result.etsy = {
                        status: 'error',
                        error: err.response && err.response.data ? JSON.stringify(err.response.data) : (err.message || String(err))
                    };
                }
            })());
        }

        await Promise.allSettled(promises);

        res.json(result);
    } catch (e) {
        console.error("Error generating description:", e);
        res.status(500).json({ error: e.message || String(e) });
    }
});

/* Example of how eBay could be exposed
app.post('/api/publish/', async (req, res) => {
    // Implement publishing to eBay if needed by the frontend...
});
*/

app.listen(port, '0.0.0.0', () => {
    console.log(`Node.js backend listening at http://0.0.0.0:${port}`);
});
