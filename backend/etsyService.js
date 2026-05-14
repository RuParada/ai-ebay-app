const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const crypto = require('crypto');

const ENV_PATH = path.join(__dirname, '..', '.env');

function updateEnvFile(key, value) {
    try {
        let envFile = '';
        if (fs.existsSync(ENV_PATH)) {
            envFile = fs.readFileSync(ENV_PATH, 'utf-8');
        }
        const regex = new RegExp(`^${key}=.*`, 'm');
        if (envFile.match(regex)) {
            envFile = envFile.replace(regex, `${key}=${value}`);
        } else {
            envFile += `\n${key}=${value}`;
        }
        fs.writeFileSync(ENV_PATH, envFile);
        process.env[key] = value;
    } catch (e) {
        process.env[key] = value;
    }
}

class EtsyAPI {
    constructor() {
        this.apiKey = process.env.ETSY_API_KEY;
        this.sharedSecret = process.env.ETSY_SHARED_SECRET || '';
        this.shopId = process.env.ETSY_SHOP_ID;
        this.accessToken = process.env.ETSY_USER_TOKEN || process.env.USER_TOKEN;
        this.refreshToken = process.env.ETSY_REFRESH_TOKEN || process.env.REFRESH_TOKEN;
        this.apiUrl = 'https://openapi.etsy.com/v3/application';
    }

    generateAuthUrl() {
        const state = crypto.randomBytes(16).toString('hex');
        const codeVerifier = crypto.randomBytes(32).toString('base64url');
        const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

        const url = `https://www.etsy.com/oauth/connect?response_type=code&redirect_uri=${encodeURIComponent('http://localhost:8000/api/etsy/auth/callback')}&scope=listings_w%20listings_r&client_id=${this.apiKey}&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
        
        return { url, codeVerifier };
    }

    async getHeaders() {
        const apiKeyHeader = this.sharedSecret ? `${this.apiKey}:${this.sharedSecret}` : this.apiKey;
        return {
            'x-api-key': apiKeyHeader,
            'Authorization': `Bearer ${this.accessToken}`
        };
    }

    async refreshUserToken() {
        if (!this.refreshToken) {
            throw new Error("No refresh token available. User needs to re-authenticate.");
        }
        
        try {
            const response = await axios.post('https://api.etsy.com/v3/public/oauth/token', {
                grant_type: 'refresh_token',
                client_id: this.apiKey,
                refresh_token: this.refreshToken
            });
            
            this.accessToken = response.data.access_token;
            this.refreshToken = response.data.refresh_token;
            
            updateEnvFile("ETSY_USER_TOKEN", this.accessToken);
            updateEnvFile("ETSY_REFRESH_TOKEN", this.refreshToken);
            
            // Also update the non-prefixed ones just in case
            updateEnvFile("USER_TOKEN", this.accessToken);
            updateEnvFile("REFRESH_TOKEN", this.refreshToken);
        } catch (error) {
            console.error("Failed to refresh Etsy token:", error.response ? error.response.data : error.message);
            throw new Error("Failed to refresh Etsy token: " + (error.response ? JSON.stringify(error.response.data) : error.message));
        }
    }

    async createDraftListing(sku, result, condition, categoryId = 1, isRetry = false) {
        if (!this.accessToken) {
            throw new Error("Etsy User Token is not configured. Please complete OAuth flow.");
        }

        let shippingProfileId;
        try {
            const profilesResp = await axios.get(
                `${this.apiUrl}/shops/${this.shopId}/shipping-profiles`,
                { headers: await this.getHeaders() }
            );
            if (profilesResp.data && profilesResp.data.results && profilesResp.data.results.length > 0) {
                shippingProfileId = profilesResp.data.results[0].shipping_profile_id;
            } else {
                throw new Error("No shipping profile found on your Etsy account. Please create one on Etsy first.");
            }
        } catch (error) {
            if (error.response && error.response.data && error.response.data.error === "invalid_token" && !isRetry) {
                await this.refreshUserToken();
                return this.createDraftListing(sku, result, condition, categoryId, true);
            }
            if (error.message.includes("No shipping profile found")) {
                throw error;
            }
            throw new Error("Failed to fetch shipping profiles: " + (error.response ? JSON.stringify(error.response.data) : error.message));
        }

        let returnPolicyId;
        try {
            const returnResp = await axios.get(
                `${this.apiUrl}/shops/${this.shopId}/policies/return`,
                { headers: await this.getHeaders() }
            );
            if (returnResp.data && returnResp.data.results && returnResp.data.results.length > 0) {
                returnPolicyId = returnResp.data.results[0].return_policy_id;
            } else {
                throw new Error("No return policy found on your Etsy account. Please create one on Etsy first.");
            }
        } catch (error) {
            if (error.response && error.response.data && error.response.data.error === "invalid_token" && !isRetry) {
                await this.refreshUserToken();
                return this.createDraftListing(sku, result, condition, categoryId, true);
            }
            if (error.message.includes("No return policy found")) {
                throw error;
            }
            throw new Error("Failed to fetch return policies: " + (error.response ? JSON.stringify(error.response.data) : error.message));
        }

        let readinessStateId;
        try {
            const readinessResp = await axios.get(
                `${this.apiUrl}/shops/${this.shopId}/readiness-state-definitions`,
                { headers: await this.getHeaders() }
            );
            if (readinessResp.data && readinessResp.data.results && readinessResp.data.results.length > 0) {
                readinessStateId = readinessResp.data.results[0].readiness_state_id;
            } else {
                throw new Error("No processing profile (readiness state) found on your Etsy account. Please create a shipping/processing profile on Etsy first.");
            }
        } catch (error) {
            if (error.response && error.response.data && error.response.data.error === "invalid_token" && !isRetry) {
                await this.refreshUserToken();
                return this.createDraftListing(sku, result, condition, categoryId, true);
            }
            if (error.message.includes("No processing profile")) {
                throw error;
            }
            throw new Error("Failed to fetch readiness states: " + (error.response ? JSON.stringify(error.response.data) : error.message));
        }
        
        const tags = Array.isArray(result.tags) ? result.tags.slice(0, 13) : String(result.tags).split(',').map(t => t.trim()).slice(0, 13);
        const description = result.description || result.title;
        
        const listingData = {
            quantity: 1,
            title: result.title.substring(0, 140),
            description: description,
            price: 50.00, // Placeholder
            who_made: "someone_else",
            when_made: "2020_2026",
            taxonomy_id: categoryId,
            is_supply: false,
            state: "draft",
            tags: tags,
            shipping_profile_id: shippingProfileId,
            return_policy_id: returnPolicyId,
            readiness_state_id: readinessStateId
        };

        try {
            const response = await axios.post(
                `${this.apiUrl}/shops/${this.shopId}/listings`,
                listingData,
                { headers: await this.getHeaders() }
            );
            return response.data;
        } catch (error) {
            if (error.response && error.response.data && error.response.data.error === "invalid_token" && !isRetry) {
                await this.refreshUserToken();
                return this.createDraftListing(sku, result, condition, categoryId, true);
            }
            throw error;
        }
    }

    async uploadListingImage(listingId, imageBuffer, mimeType, filename, isRetry = false) {
        const formData = new FormData();
        formData.append('image', imageBuffer, { filename, contentType: mimeType });

        const headers = await this.getHeaders();
        try {
            const response = await axios.post(
                `${this.apiUrl}/shops/${this.shopId}/listings/${listingId}/images`,
                formData,
                {
                    headers: {
                        ...headers,
                        ...formData.getHeaders()
                    }
                }
            );
            return response.data;
        } catch (error) {
            if (error.response && error.response.data && error.response.data.error === "invalid_token" && !isRetry) {
                await this.refreshUserToken();
                return this.uploadListingImage(listingId, imageBuffer, mimeType, filename, true);
            }
            throw error;
        }
    }
}

module.exports = { EtsyAPI };
