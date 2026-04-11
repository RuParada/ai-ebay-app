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

1. **title** (up to 80 characters) - Catchy, with keywords
2. **short_description** (1-2 sentences) - For product card preview
3. **full_description** (3-5 sentences) - Details, materials, features. IMPORTANT: At the very end of this description, you MUST include a phrase like "Bitte entnehmen Sie den genauen Zustand des Artikels den beigefügten Bildern." (Please see photos for the exact condition).
4. **tags** (5-10 items) - Comma-separated, for SEO and filtering
5. **category_keyword** - 1 or 2 words IN GERMAN describing the exact item type strictly for category search on eBay (e.g. "Vase", "Ölgemälde").
6. **productart** - The product type IN GERMAN (eBay aspect "Produktart").
7. **marke** - The brand IN GERMAN (e.g. "Markenlos", "Cisco") (eBay aspect "Marke").
8. **modell** - The model of the item IN GERMAN (e.g. "SG200-08", "Keine Angabe") (eBay aspect "Modell").
9. **abteilung** - The department IN GERMAN (eBay aspect "Abteilung"). Usually "Herren", "Damen", "Unisex Erwachsene", or "Nicht zutreffend" for electronics/non-clothing.
10. **estimated_price** - Estimate the average market price for this USED item (in EUR) based on your extensive knowledge base. This will act as our fallback pricing. Output only a number. Example: 80.00
11. **search_keyword** - 2 to 4 keywords to search for sold items of this exact product on eBay (e.g. "Apple iPhone 12", "Vintage Levi's 501"). Keep it optimal for an eBay search.

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
