require('dotenv').config({ path: '../.env' });
const { EbayAPI } = require('./ebayService');

async function run() {
    let code = process.argv[2];
    if (!code) {
        console.log("Укажите код при запуске скрипта.");
        process.exit(1);
    }
    
    // Auto-decode if the user pastes URL-encoded code from browser URL bar
    if (code.includes('%')) {
        code = decodeURIComponent(code);
    }
    code = code.trim();
    
    try {
        console.log("Обмен кода авторизации...");
        const ebay = new EbayAPI();
        await ebay.convertCodeToToken(code);
        console.log("✅ Успешно! Ключи (USER_TOKEN и REFRESH_TOKEN) записаны в .env файл.");
    } catch (e) {
        console.error("❌ Ошибка при обмене:", e.response ? e.response.data : e.message);
    }
}
run();
