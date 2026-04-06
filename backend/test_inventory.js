require('dotenv').config({ path: '../.env' });
const { EbayAPI } = require('./ebayService');

async function testInventory() {
    const ebay = new EbayAPI();
    const sku = `TEST-SKU-${Date.now()}`;
    const payload = {
        title: "Cisco Small Business Switch",
        full_description: "Great switch",
        tags: ["Cisco", "Switch"]
    };

    try {
        console.log(`Creating inventory item with SKU: ${sku}`);
        await ebay.createInventoryItem(sku, payload);
        console.log("Inventory created successfully.");
        
        console.log(`Creating offer for SKU: ${sku}`);
        await ebay.createOffer(sku, payload);
        console.log("Offer created successfully.");
    } catch (e) {
        if (e.response && e.response.data) {
            console.error("HTTP ERROR:", JSON.stringify(e.response.data, null, 2));
        } else {
            console.error("ERROR:", e);
        }
    }
}
testInventory();
