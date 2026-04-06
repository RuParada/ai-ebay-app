require('dotenv').config({ path: '../.env' }); // Load .env from parent dir
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { generateDescriptionFromFiles } = require('./openaiService');
const { EbayAPI } = require('./ebayService');

const app = express();
const port = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

// Set up multer for memory storage (we process image buffer directly)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.post('/api/describe/', upload.array('file'), async (req, res) => {
    try {
        const files = req.files;
        if (!files || files.length === 0) {
            return res.status(400).json({ error: "No files found in 'file' field" });
        }

        const hint = (req.body.hint || "").trim();
        const ean = (req.body.ean || "").trim();

        const result = await generateDescriptionFromFiles(files, hint, ean);
        
        // --- eBay Draft Creation ---
        try {
            const ebay = new EbayAPI();
            const sku = ean || `SKU-${Date.now()}`;
            // 1. Создаем товар (Inventory Item) — это база для черновика
            await ebay.createInventoryItem(sku, result);
            
            // 2. Создаем предложение (Offer) — это делает его видимым в черновиках
            let offerId = null;
            let offerError = null;
            try {
                offerId = await ebay.createOffer(sku, result);
            } catch (err) {
                console.warn("Could not create Offer (missing policies, etc):", err.response ? err.response.data : err.message);
                // We don't fail completely, because the Inventory Item WAS created successfully!
                offerError = err.response && err.response.data 
                    ? JSON.stringify(err.response.data) 
                    : err.message;
            }

            result.ebay = {
                status: offerId ? 'success' : 'partial',
                sku: sku,
                offerId: offerId,
                warning: offerError
            };
        } catch (err) {
            console.error("eBay integration error:", err.response ? err.response.data : err);
            result.ebay = {
                status: 'error',
                error: err.response && err.response.data ? JSON.stringify(err.response.data) : (err.message || String(err))
            };
        }

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

app.listen(port, () => {
    console.log(`Node.js backend listening at http://localhost:${port}`);
});
