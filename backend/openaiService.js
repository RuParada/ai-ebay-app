const fs = require('fs');
const OpenAI = require('openai');

const MODEL_ID = process.env.MODEL_ID || "gpt-4o";
const MAX_TOKENS = 1024;
const MAX_IMAGE_SIZE_MB = 15;

const MEDIA_TYPE_MAP = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
};

const PLATFORM_PROMPT = `
You are a professional copywriter for an e-commerce platform.
Analyze the image(s) and create a structured description IN GERMAN:

1. **title** (exactly 70-80 characters) - Catchy, packed with relevant search keywords (brand, material, color, style) to maximize the 80 character limit. IMPORTANT: DO NOT include accessories like "Fotopapier", "Kabel", "Patrone", "Zubehör", or any bundled items in the title to comply with eBay policies. Keep the title focused strictly on the main item.
2. **short_description** (1-2 sentences) - For product card preview
3. **full_description** (3-5 sentences) - Details, materials, features. IMPORTANT: At the very end of this description, you MUST include a phrase like "Bitte entnehmen Sie den genauen Zustand des Artikels den beigefügten Bildern." (Please see photos for the exact condition).
4. **tags** (5-10 items) - Comma-separated, for SEO and filtering
5. **category_keyword** - 1 or 2 words IN GERMAN describing the exact item type strictly for category search on eBay (e.g. "Vase", "Ölgemälde").
6. **productart** - The product type IN GERMAN (eBay aspect "Produktart").
7. **marke** - The brand IN GERMAN (e.g. "Markenlos", "Cisco") (eBay aspect "Marke").
8. **modell** - The model of the item IN GERMAN (e.g. "SG200-08", "Keine Angabe") (eBay aspect "Modell").
9. **abteilung** - The department IN GERMAN (eBay aspect "Abteilung"). Usually "Herren", "Damen", "Unisex Erwachsene", or "Nicht zutreffend" for electronics/non-clothing.
10. **estimated_price** - Estimate the retail price of this item if it were NEW, then logically subtract between 15% and 45% depending on the brand and typical depreciation to determine a fair market price for this USED item (in EUR). Output ONLY a number. Example: 85.50
11. **search_keyword** - The search query used to find sold listings of THIS EXACT product on eBay, so a precise market price can be calculated. Accuracy of the price depends entirely on this field. Rules:
    - Structure it as: BRAND + MODEL/SERIES + one key distinguishing attribute (storage/size/capacity/material). Example: "Apple iPhone 12 128GB", "Sony WH-1000XM4", "Levi's 501 W32 L34", "Bosch GSR 18V-55".
    - Prefer the exact model/type number if visible (e.g. "SG200-08", "WH-1000XM4"). If an EAN/Article number is provided and the item is a mass-market product, you may use it as the search_keyword.
    - Be SPECIFIC, not generic. Bad: "Kopfhörer", "Jeans", "Vase". Good: "Sony WH-1000XM4", "Levi's 501 Herren Jeans".
    - Do NOT include accessories, bundle words, color, condition words (e.g. "gebraucht", "neu", "Zubehör", "Kabel", "OVP") or filler adjectives — they pollute the sold-item search.
    - If the exact brand/model genuinely cannot be identified, use the most specific product type + a defining feature you can see (e.g. "Vintage Messing Kerzenständer", "Öl Landschaftsgemälde gerahmt").
12. **custom_specifics** - If the user specifies explicit item characteristics in the Hint (e.g. "Farbe: Schwarz", "color: black", "EU-Schuhgröße: 42"), parse them and return them as an array of objects here. Translate the key and value to German if they are not (e.g. "color" -> "Farbe"). Format: [{"name": "Farbe", "value": "Schwarz"}]. If none are given, return an empty array [].

CRITICAL RULE FOR EMPTY BOXES: If the user hint says "original box", "only box", "OVP", "Leerkarton", or implies the item is JUST THE BOX/PACKAGING, you MUST write the entire description, title, and price exclusively for the EMPTY BOX. Make it abundantly clear in the title and description that the device/product is NOT INCLUDED (e.g., "NUR OVP", "Ohne Gerät"). The estimated_price must also reflect an empty box (e.g., 5-20 EUR, not the price of the device).

Respond strictly in JSON format without markdown wrapping.
`;

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function validateSizeMb(size) {
    const sizeMb = size / (1024 * 1024);
    if (sizeMb > MAX_IMAGE_SIZE_MB) {
        throw new Error(`File is too large: ${sizeMb.toFixed(1)} MB (max ${MAX_IMAGE_SIZE_MB} MB)`);
    }
}

function mediaTypeForSuffix(suffix) {
    const suf = suffix.toLowerCase();
    const mediaType = MEDIA_TYPE_MAP[suf] || MEDIA_TYPE_MAP['.' + suf];
    if (!mediaType) {
        throw new Error(`Unsupported format: ${suffix}`);
    }
    return mediaType;
}

async function callOpenAI(images, userHint = "", ean = "") {
    let promptText = images.length === 1 
        ? "Describe this product image for the platform." 
        : "Describe this product based on the provided images (different angles) for the platform.";
    
    if (ean) promptText += `\nEAN/Article: ${ean}`;
    if (userHint) promptText += `\nHint: ${userHint}`;

    const content = [];
    for (const { dataB64, mediaType } of images) {
        content.push({
            type: "image_url",
            image_url: {
                url: `data:${mediaType};base64,${dataB64}`
            }
        });
    }
    content.push({ type: "text", text: promptText });

    const messages = [
        { role: "system", content: PLATFORM_PROMPT },
        { role: "user", content: content }
    ];

    const response = await client.chat.completions.create({
        model: MODEL_ID,
        max_tokens: MAX_TOKENS,
        response_format: { type: "json_object" },
        messages: messages,
    });

    const rawText = response.choices[0].message.content;
    let result;
    try {
        result = JSON.parse(rawText);
    } catch (e) {
        result = { raw: rawText };
    }

    if (response.usage) {
        result._usage = {
            input_tokens: response.usage.prompt_tokens,
            output_tokens: response.usage.completion_tokens,
        };
    }
    return result;
}

async function generateDescriptionFromFiles(files, userHint = "", ean = "") {
    const images = [];
    for (const file of files) {
        validateSizeMb(file.size);
        const suffix = file.originalname.substring(file.originalname.lastIndexOf('.')).toLowerCase() || ".jpg";
        const mediaType = mediaTypeForSuffix(suffix);
        const dataB64 = file.buffer.toString('base64');
        images.push({ dataB64, mediaType });
    }
    return callOpenAI(images, userHint, ean);
}

module.exports = { generateDescriptionFromFiles };
