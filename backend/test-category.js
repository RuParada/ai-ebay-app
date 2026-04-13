const { EbayAPI } = require('./ebayService');
const ebay = new EbayAPI();

async function test() {
    const cid = await ebay.suggestCategory("Tastatur");
    console.log("Category ID:", cid);
}
test().catch(console.error);
