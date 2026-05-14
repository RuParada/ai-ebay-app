const axios = require('axios');
require('dotenv').config({ path: '.env' });

async function test() {
    const shopId = process.env.ETSY_SHOP_ID;
    const apiKey = process.env.ETSY_API_KEY;
    const sharedSecret = process.env.ETSY_SHARED_SECRET || '';
    const accessToken = process.env.ETSY_USER_TOKEN || process.env.USER_TOKEN;

    const apiKeyHeader = sharedSecret ? `${apiKey}:${sharedSecret}` : apiKey;
    const headers = {
        'x-api-key': apiKeyHeader,
        'Authorization': `Bearer ${accessToken}`
    };

    try {
        const res = await axios.get(`https://openapi.etsy.com/v3/application/shops/${shopId}/policies/return`, { headers });
        console.log("Success:", JSON.stringify(res.data, null, 2));
    } catch (e) {
        console.log("Error:", e.response ? e.response.status + " " + JSON.stringify(e.response.data) : e.message);
    }
}
test();
