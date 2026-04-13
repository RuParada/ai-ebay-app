const fs = require('fs');
const { EbayAPI } = require('./ebayService');
const ebay = new EbayAPI();

async function test() {
    try {
        const res = await ebay._request('GET', '/commerce/taxonomy/v1/category_tree/77');
        console.log("Got tree structure...");
    } catch(e) {
        console.log("Failed", e.response ? e.response.data : e.message);
    }
}
test();
