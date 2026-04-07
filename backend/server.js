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

app.post('/api/auth', (req, res) => {
    const expectedPasscode = process.env.APP_PASSCODE;
    if (!expectedPasscode || req.body.passcode === expectedPasscode) {
        return res.json({ success: true });
    }
    return res.status(401).json({ error: "Invalid Passcode" });
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

        const result = await generateDescriptionFromFiles(files, hint, ean);
        
        // --- eBay Draft Creation ---
        try {
            const ebay = new EbayAPI();
            const sku = ean || `SKU-${Date.now()}`;
            
            // 0. Если ИИ выдал ключевое слово для категории, ищем класс
            let categoryId = "360";
            if (result.category_keyword) {
                categoryId = await ebay.suggestCategory(result.category_keyword);
            }

            // 1. Загружаем все фото на серверы eBay (первое — главное фото товара)
            const imageUrls = [];
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const suffix = file.originalname.substring(file.originalname.lastIndexOf('.')).toLowerCase() || '.jpg';
                const mimeType = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[suffix] || 'image/jpeg';
                const filename = `photo-${i + 1}${suffix}`;
                try {
                    const url = await ebay.uploadImageToEbay(file.buffer, mimeType, filename);
                    imageUrls.push(url);
                    console.log(`Uploaded image ${i + 1}: ${url}`);
                } catch (uploadErr) {
                    console.warn(`Could not upload image ${i + 1}:`, uploadErr.message);
                }
            }

            // 2. Создаем товар (Inventory Item) с реальными фото
            await ebay.createInventoryItem(sku, result, imageUrls);
            
            // 2. Создаем предложение (Offer)
            let offerId = null;
            let listingId = null;
            let offerError = null;
            try {
                offerId = await ebay.createOffer(sku, result, categoryId);
                
                // 3. Публикуем (Так как стоит дата в будущем, он попадет в Запланированные / Geplant)
                listingId = await ebay.publishOffer(offerId);
            } catch (err) {
                console.warn("Could not create/publish Offer:", err.response ? err.response.data : err.message);
                offerError = err.response && err.response.data 
                    ? JSON.stringify(err.response.data) 
                    : err.message;
            }

            result.ebay = {
                status: listingId ? 'success' : (offerId ? 'partial' : 'error'),
                sku: sku,
                offerId: offerId,
                listingId: listingId,
                error: !offerId ? offerError : undefined,
                warning: (offerId && !listingId) ? offerError : undefined
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

app.listen(port, '0.0.0.0', () => {
    console.log(`Node.js backend listening at http://0.0.0.0:${port}`);
});
