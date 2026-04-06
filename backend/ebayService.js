const fs = require('fs');
const path = require('path');
const axios = require('axios');

const ENV_PATH = path.join(__dirname, '..', '.env');
const EBAY_ENV = process.env.EBAY_ENV || "SANDBOX";

const EBAY_OAUTH_SERVER = EBAY_ENV === "SANDBOX" ? "auth.sandbox.ebay.com" : "auth.ebay.com";
const EBAY_API_SERVER = EBAY_ENV === "SANDBOX" ? "api.sandbox.ebay.com" : "api.ebay.com";

function updateEnvFile(key, value) {
    try {
        let envFile = fs.readFileSync(ENV_PATH, 'utf-8');
        const regex = new RegExp(`^${key}=.*`, 'm');
        if (envFile.match(regex)) {
            envFile = envFile.replace(regex, `${key}=${value}`);
        } else {
            envFile += `\n${key}=${value}`;
        }
        fs.writeFileSync(ENV_PATH, envFile);
        process.env[key] = value;
    } catch (e) {
        console.error("Failed to update .env file", e);
    }
}

class EbayAPI {
    constructor() {
        this.appId = process.env.EBAY_APP_ID;
        this.certId = process.env.EBAY_CERT_ID;
        this.ruName = process.env.EBAY_RU_NAME;
        this.accessToken = process.env.EBAY_USER_TOKEN;
        this.refreshToken = process.env.EBAY_REFRESH_TOKEN;
    }

    _getAuthHeader() {
        const credentials = `${this.appId}:${this.certId}`;
        const encodedCredentials = Buffer.from(credentials).toString('base64');
        return { "Authorization": `Basic ${encodedCredentials}` };
    }

    getUserConsentUrl() {
        const scopes = [
            "https://api.ebay.com/oauth/api_scope/sell.inventory",
            "https://api.ebay.com/oauth/api_scope/sell.marketing",
        ];
        const params = new URLSearchParams({
            client_id: this.appId,
            response_type: "code",
            redirect_uri: this.ruName,
            scope: scopes.join(" "),
        });
        return `https://${EBAY_OAUTH_SERVER}/oauth2/authorize?${params.toString()}`;
    }

    async convertCodeToToken(authCode) {
        const url = `https://${EBAY_API_SERVER}/identity/v1/oauth2/token`;
        const headers = { ...this._getAuthHeader(), "Content-Type": "application/x-www-form-urlencoded" };
        const data = new URLSearchParams({
            grant_type: "authorization_code",
            code: authCode,
            redirect_uri: this.ruName,
        });

        const response = await axios.post(url, data.toString(), { headers });
        const tokens = response.data;

        this.accessToken = tokens.access_token;
        this.refreshToken = tokens.refresh_token;

        updateEnvFile("EBAY_USER_TOKEN", this.accessToken);
        if (this.refreshToken) {
            updateEnvFile("EBAY_REFRESH_TOKEN", this.refreshToken);
        }
    }

    async refreshUserToken() {
        if (!this.refreshToken) {
            throw new Error("No refresh token available. User needs to re-authenticate.");
        }

        const url = `https://${EBAY_API_SERVER}/identity/v1/oauth2/token`;
        const headers = { ...this._getAuthHeader(), "Content-Type": "application/x-www-form-urlencoded" };
        const scopes = [
            "https://api.ebay.com/oauth/api_scope/sell.inventory",
        ];
        
        const data = new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: this.refreshToken,
            scope: scopes.join(" "),
        });

        const response = await axios.post(url, data.toString(), { headers });
        const tokens = response.data;

        this.accessToken = tokens.access_token;
        updateEnvFile("EBAY_USER_TOKEN", this.accessToken);
    }

    async _request(method, endpoint, payload = null, retry = true) {
        if (!this.accessToken) {
            if (this.refreshToken) {
                await this.refreshUserToken();
            } else {
                throw new Error("Missing Access Token. Authorization required.");
            }
        }

        const url = `https://${EBAY_API_SERVER}${endpoint}`;
        const headers = {
            "Authorization": `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
            "Accept-Language": "de-DE",
            "Content-Language": "de-DE",
        };

        try {
            const config = { method, url, headers };
            if (payload) config.data = payload;
            const response = await axios(config);
            return response;
        } catch (error) {
            if (error.response && error.response.status === 401 && retry) {
                await this.refreshUserToken();
                return this._request(method, endpoint, payload, false);
            }
            throw error;
        }
    }

    async createInventoryItem(sku, chatgptData) {
        const endpoint = `/sell/inventory/v1/inventory_item/${sku}`;
        const title = chatgptData.title || `Draft ${sku}`;
        let tags = [];
        if (Array.isArray(chatgptData.tags)) {
            tags = chatgptData.tags.slice(0, 5);
        } else {
            tags = (chatgptData.tags || "").split(",").map(t => t.trim()).filter(Boolean).slice(0, 5);
        }

        const payload = {
            availability: {
                shipToLocationAvailability: {
                    quantity: 1
                }
            },
            condition: "NEW",
            product: {
                title: title.substring(0, 80),
                description: chatgptData.full_description || "",
                aspects: {
                    Brand: ["Unbranded"],
                    Tags: tags.length ? tags : ["No Tags"]
                },
                imageUrls: [
                    "https://i.ebayimg.com/images/g/m5EAAOSwyOFl0Mow/s-l1600.jpg"
                ]
            }
        };

        const response = await this._request("PUT", endpoint, payload);
        return response.status === 204;
    }

    async createOffer(sku, chatgptData) {
        const endpoint = "/sell/inventory/v1/offer";
        
        const payload = {
            sku: sku,
            marketplaceId: "EBAY_DE",
            format: "FIXED_PRICE",
            listingDescription: chatgptData.full_description || "",
            availableQuantity: 1,
            categoryId: "37557",
            pricingSummary: {
                price: {
                    value: "19.99",
                    currency: "EUR"
                }
            },
            listingPolicies: {
                fulfillmentPolicyId: "mock_fulfillment_policy_id",
                paymentPolicyId: "mock_payment_policy_id",
                returnPolicyId: "mock_return_policy_id"
            },
            merchantLocationKey: "default"
        };
        
        const response = await this._request("POST", endpoint, payload);
        if (response.status === 201 || response.status === 200) {
            return response.data.offerId;
        } else {
            throw new Error(`Failed to create offer: ${JSON.stringify(response.data)}`);
        }
    }
}

module.exports = { EbayAPI };
