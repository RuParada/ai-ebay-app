const axios = require('axios');
const FormData = require('form-data');
const crypto = require('crypto');

class EtsyAPI {
    constructor() {
        this.apiKey = process.env.ETSY_API_KEY;
        this.shopId = process.env.ETSY_SHOP_ID;
        this.accessToken = process.env.USER_TOKEN;
        this.refreshToken = process.env.REFRESH_TOKEN;
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
        return {
            'x-api-key': this.apiKey,
            'Authorization': `Bearer ${this.accessToken}`
        };
    }

    async createDraftListing(sku, result, condition, categoryId = 1) {
        if (!this.accessToken) {
            throw new Error("Etsy User Token is not configured. Please complete OAuth flow.");
        }
        
        const tags = Array.isArray(result.tags) ? result.tags.slice(0, 13) : String(result.tags).split(',').map(t => t.trim()).slice(0, 13);
        const description = result.description || result.title;
        
        const listingData = {
            quantity: 1,
            title: result.title.substring(0, 140),
            description: description,
            price: 50.00, // Placeholder
            who_made: "someone_else",
            when_made: "2020_2024",
            taxonomy_id: categoryId,
            is_supply: false,
            state: "draft",
            tags: tags
        };

        const response = await axios.post(
            `${this.apiUrl}/shops/${this.shopId}/listings`,
            listingData,
            { headers: await this.getHeaders() }
        );

        return response.data;
    }

    async uploadListingImage(listingId, imageBuffer, mimeType, filename) {
        const formData = new FormData();
        formData.append('image', imageBuffer, { filename, contentType: mimeType });

        const headers = await this.getHeaders();
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
    }
}

module.exports = { EtsyAPI };
