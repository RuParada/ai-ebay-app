require('dotenv').config();
const { EbayAPI } = require('./backend/ebayService');
(async () => {
    try {
        const ebay = new EbayAPI();
        const token = await ebay.getAppToken();
        console.log("App Token successful:", !!token);
        
        await ebay.refreshUserToken();
        console.log("User Token refresh successful!");
    } catch (e) {
        console.error("Error:", e.response ? JSON.stringify(e.response.data) : e.message);
    }
})();
