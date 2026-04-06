require('dotenv').config({ path: '../.env' });
const { EbayAPI } = require('./ebayService');

async function run() {
    const ebay = new EbayAPI();
    const sku = `TEST-SKU-${Date.now()}`;
    const data = {
        title: "Test Item",
        full_description: "Test description",
        tags: "tag1, tag2"
    };

    try {
        console.log("Creating inventory...");
        await ebay.createInventoryItem(sku, data);
        console.log("Inventory created!");

        console.log("Creating offer...");
        await ebay.createOffer(sku, data);
        console.log("Offer created!");
    } catch (e) {
        if (e.response && e.response.data) {
            console.error(JSON.stringify(e.response.data, null, 2));
        } else {
            console.error(e.message);
        }
    }
}
run();
