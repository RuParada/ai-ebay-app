const { EbayAPI } = require('./ebayService');
async function test() {
    const api = new EbayAPI();
    await api.getAppToken(); // test if env works
    console.log("Tokens exist");
}
test().catch(console.error);
