require('dotenv').config({ path: '../.env' });
const fs = require('fs');
const { EbayAPI } = require('./ebayService');

async function test() {
    const api = new EbayAPI();
    const buffer = fs.readFileSync('../photo.jpg');
    try {
        await api.refreshUserToken(); // FORCE REFRESH
        const url = await api.uploadImageToEbay(buffer, 'image/jpeg', 'photo.jpg');
        console.log("Success! URL:", url);
    } catch (e) {
        console.error("Upload failed:", e.message);
    }
}
test();
