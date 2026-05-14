const crypto = require('crypto');
const readline = require('readline');
const axios = require('axios');
require('dotenv').config();

const API_KEY = process.env.ETSY_API_KEY;

if (!API_KEY) {
    console.error("Error: ETSY_API_KEY is not set in .env");
    process.exit(1);
}

const state = crypto.randomBytes(16).toString('hex');
const codeVerifier = crypto.randomBytes(32).toString('base64url');
const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

// Ensure the redirect URI is exactly what is registered in Etsy
const REDIRECT_URI = 'http://localhost:8000/api/etsy/auth/callback'; 

const authUrl = `https://www.etsy.com/oauth/connect?response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=listings_w%20listings_r&client_id=${API_KEY}&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;

console.log("\n=== Etsy OAuth 2.0 Token Generator ===\n");
console.log("1. Add this exact URL to your Etsy App's Callback URLs in the developer portal:");
console.log(`   ${REDIRECT_URI}\n`);
console.log("2. Open this URL in your browser to authorize:");
console.log(`\n${authUrl}\n`);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.question('3. After authorizing, you will be redirected to a URL that fails to load (localhost). Paste that full URL here:\n> ', async (redirectedUrl) => {
    try {
        const urlParams = new URL(redirectedUrl).searchParams;
        const code = urlParams.get('code');
        const returnedState = urlParams.get('state');

        if (!code) {
            console.error("No code found in URL");
            process.exit(1);
        }
        
        if (returnedState !== state) {
            console.error("State mismatch!");
            process.exit(1);
        }

        console.log("\nExchanging code for token...");
        const response = await axios.post('https://api.etsy.com/v3/public/oauth/token', {
            grant_type: 'authorization_code',
            client_id: API_KEY,
            redirect_uri: REDIRECT_URI,
            code: code,
            code_verifier: codeVerifier
        });

        console.log("\n=== SUCCESS! Add these to your .env ===\n");
        console.log(`ETSY_USER_TOKEN=${response.data.access_token}`);
        console.log(`ETSY_REFRESH_TOKEN=${response.data.refresh_token}`);
        console.log("\nDone!");

    } catch (err) {
        console.error("\nError exchanging token:");
        console.error(err.response ? err.response.data : err.message);
    }
    rl.close();
});
