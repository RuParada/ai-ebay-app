require('dotenv').config({ path: '../.env' });
const axios = require('axios');

async function getPolicies() {
    const token = process.env.EBAY_USER_TOKEN;
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };

    try {
        console.log("Fetching Fulfillment Policies...");
        const fulfillRes = await axios.get('https://api.ebay.com/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_DE', { headers });
        console.log("Fulfillment Policies:", JSON.stringify(fulfillRes.data, null, 2));

        console.log("\nFetching Payment Policies...");
        const payRes = await axios.get('https://api.ebay.com/sell/account/v1/payment_policy?marketplace_id=EBAY_DE', { headers });
        console.log("Payment Policies:", JSON.stringify(payRes.data, null, 2));

        console.log("\nFetching Return Policies...");
        const retRes = await axios.get('https://api.ebay.com/sell/account/v1/return_policy?marketplace_id=EBAY_DE', { headers });
        console.log("Return Policies:", JSON.stringify(retRes.data, null, 2));

        console.log("\nFetching Location Key...");
        const locRes = await axios.get('https://api.ebay.com/sell/inventory/v1/location', { headers });
        console.log("Locations:", JSON.stringify(locRes.data, null, 2));

    } catch (e) {
        console.error("Error:", e.response ? e.response.data : e.message);
    }
}

getPolicies();
