const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const xml2js = require('xml2js');

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
        this.devId = process.env.EBAY_DEV_ID;
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

    async getAppToken() {
        if (this.appToken && this.appTokenExpiresAt > Date.now()) {
            return this.appToken;
        }
        const url = `https://${EBAY_API_SERVER}/identity/v1/oauth2/token`;
        const headers = { ...this._getAuthHeader(), "Content-Type": "application/x-www-form-urlencoded" };
        const data = new URLSearchParams({
            grant_type: "client_credentials",
            scope: "https://api.ebay.com/oauth/api_scope"
        });

        const response = await axios.post(url, data.toString(), { headers });
        this.appToken = response.data.access_token;
        this.appTokenExpiresAt = Date.now() + (response.data.expires_in * 1000) - 60000;
        return this.appToken;
    }

    async _requestApp(method, endpoint, payload = null) {
        const token = await this.getAppToken();
        const url = `https://${EBAY_API_SERVER}${endpoint}`;
        const headers = {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
            "Accept-Language": "de-DE",
        };
        const config = { method, url, headers };
        if (payload) config.data = payload;
        return axios(config);
    }

    async suggestCategory(keyword) {
        try {
            const encoded = encodeURIComponent(keyword);
            const res = await this._requestApp('GET', `/commerce/taxonomy/v1/category_tree/77/get_category_suggestions?q=${encoded}`);
            if (res.data && res.data.categorySuggestions && res.data.categorySuggestions.length > 0) {
                // Prefer a leaf category (one that has no children) - required for AUCTION publishing
                const suggestions = res.data.categorySuggestions;
                const leafSuggestion = suggestions.find(s => s.category.categoryId); // all suggestions are leaves
                if (leafSuggestion) {
                    console.log(`Category for "${keyword}": ${leafSuggestion.category.categoryName} (${leafSuggestion.category.categoryId})`);
                    return leafSuggestion.category.categoryId;
                }
            }
        } catch (e) {
            console.error("Failed to suggest category:", e.response ? e.response.data : e.message);
        }
        return "360"; // Fallback: Kunstdrucke (valid leaf category supporting AUCTION)
    }

    async uploadImageToEbay(buffer, mimeType = 'image/jpeg', filename = 'photo.jpg', isRetry = false) {
        const token = this.accessToken;
        if (!token) throw new Error('No access token for image upload');

        const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
<UploadSiteHostedPicturesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <PictureName>${filename}</PictureName>
  <PictureSet>Supersize</PictureSet>
</UploadSiteHostedPicturesRequest>`;

        const form = new FormData();
        form.append('XML Payload', xmlRequest, { contentType: 'text/xml', filename: 'request.xml' });
        form.append('image', buffer, { contentType: mimeType, filename });

        const headers = {
            ...form.getHeaders(),
            'X-EBAY-API-CALL-NAME': 'UploadSiteHostedPictures',
            'X-EBAY-API-SITEID': '77',
            'X-EBAY-API-APP-NAME': this.appId,
            'X-EBAY-API-DEV-NAME': this.devId,
            'X-EBAY-API-CERT-NAME': this.certId,
            'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
            'X-EBAY-API-IAF-TOKEN': token
        };

        const res = await axios.post('https://api.ebay.com/ws/api.dll', form, { headers });
        const parsed = await xml2js.parseStringPromise(res.data, { explicitArray: false });
        const root = parsed['UploadSiteHostedPicturesResponse'];

        if (root.Ack !== 'Success' && root.Ack !== 'Warning') {
            const errMsg = root.Errors ? JSON.stringify(root.Errors) : 'Unknown upload error';
            if (!isRetry && errMsg.includes('IAF token')) {
                await this.refreshUserToken();
                return this.uploadImageToEbay(buffer, mimeType, filename, true);
            }
            throw new Error(`Image upload failed: ${errMsg}`);
        }

        return root.SiteHostedPictureDetails.FullURL;
    }

    async createInventoryItem(sku, chatgptData, imageUrls = []) {
        const endpoint = `/sell/inventory/v1/inventory_item/${sku}`;
        const title = chatgptData.title || `Draft ${sku}`;
        let tags = [];
        if (Array.isArray(chatgptData.tags)) {
            tags = chatgptData.tags.slice(0, 5);
        } else {
            tags = (chatgptData.tags || "").split(",").map(t => t.trim()).filter(Boolean).slice(0, 5);
        }

        const marke = chatgptData.marke || "Markenlos";
        const produktart = chatgptData.productart || "Sonstige";
        const modell = chatgptData.modell || "Nicht zutreffend";
        const abteilung = chatgptData.abteilung || "Nicht zutreffend";

        // Use uploaded eBay images or fallback placeholder
        const finalImageUrls = imageUrls.length > 0
            ? imageUrls.slice(0, 12) // eBay allows max 12 images
            : ["https://i.ebayimg.com/images/g/m5EAAOSwyOFl0Mow/s-l1600.jpg"];

        const payload = {
            availability: {
                shipToLocationAvailability: {
                    quantity: 1
                }
            },
            condition: "USED_EXCELLENT", // Used (conditionId: 3000) - mandatory for this app
            product: {
                title: title.substring(0, 80),
                description: chatgptData.full_description || "",
                ean: ["Nicht zutreffend"],
                aspects: {
                    Marke: [marke],
                    Produktart: [produktart],
                    Herstellernummer: ["Nicht zutreffend"],
                    SKU: [sku],
                    Modell: [modell],
                    Abteilung: [abteilung],
                    Tags: tags.length ? tags : ["Keine Tags"]
                },
                imageUrls: finalImageUrls
            }
        };

        const response = await this._request("PUT", endpoint, payload);
        return response.status === 204;
    }

    getNextSunday2145ISO() {
        const d = new Date();
        const day = d.getDay();
        let daysToAdd = (7 - day) % 7;

        // If it's already Sunday evening (e.g. past 19:00 UTC / 21:00 CEST), push to next week to ensure eBay accepts it
        if (daysToAdd === 0 && d.getUTCHours() >= 19) {
            daysToAdd = 7;
        } else if (daysToAdd === 0) {
            daysToAdd = 7; // Always push to next week if today is Sunday, to be safe.
        }
        if (daysToAdd === 0) daysToAdd = 7;

        d.setDate(d.getDate() + daysToAdd);
        d.setUTCHours(19, 45, 0, 0); // 19:45 UTC = 21:45 CEST (Summer time)
        return d.toISOString();
    }

    async searchSoldItems(keyword) {
        if (!keyword) return null;
        try {
            const url = `https://svcs.ebay.com/services/search/FindingService/v1?OPERATION-NAME=findCompletedItems&SERVICE-VERSION=1.7.0&SECURITY-APPNAME=${this.appId}&RESPONSE-DATA-FORMAT=JSON&REST-PAYLOAD&keywords=${encodeURIComponent(keyword)}&itemFilter(0).name=Condition&itemFilter(0).value=3000&itemFilter(1).name=SoldItemsOnly&itemFilter(1).value=true`;
            const response = await axios.get(url);
            
            const data = response.data;
            if (data.findCompletedItemsResponse && data.findCompletedItemsResponse[0] && data.findCompletedItemsResponse[0].searchResult && data.findCompletedItemsResponse[0].searchResult[0]) {
                const items = data.findCompletedItemsResponse[0].searchResult[0].item;
                if (items && items.length > 0) {
                    let total = 0;
                    let max = 0;
                    let count = 0;
                    for (const item of items) {
                        if (item.sellingStatus && item.sellingStatus[0] && item.sellingStatus[0].currentPrice && item.sellingStatus[0].currentPrice[0]) {
                            const price = parseFloat(item.sellingStatus[0].currentPrice[0].__value__);
                            if (!isNaN(price)) {
                                total += price;
                                if (price > max) max = price;
                                count++;
                            }
                        }
                    }
                    if (count > 0) {
                        return { average: total / count, max: max };
                    }
                }
            }
        } catch (e) {
            console.error("Failed to fetch sold items:", e.message);
        }
        return null;
    }

    async createOffer(sku, chatgptData, categoryId) {
        const endpoint = "/sell/inventory/v1/offer";

        let startPrice = Number(chatgptData.estimated_price) || 19.99;
        let buyItNowPrice = startPrice * 1.4;

        // Try to fetch real prices based on AI's generated search keyword
        const soldPrices = await this.searchSoldItems(chatgptData.search_keyword || chatgptData.title);
        if (soldPrices) {
            startPrice = soldPrices.average * 1.05; // 5% higher than average sold
            buyItNowPrice = soldPrices.max;         // Highest sold price
            
            // eBay requires Buy It Now to be strictly greater than start price (usually by 30% or more, but we just ensure it's higher)
            if (buyItNowPrice <= startPrice * 1.3) {
                buyItNowPrice = startPrice * 1.3;
            }
        } else {
            // Apply 5% increase to AI fallback as well, based on the prompt "estimated_price" = market value.
            startPrice = startPrice * 1.05;
            buyItNowPrice = startPrice * 1.4;
        }

        // Round to nearest integer
        startPrice = Math.round(startPrice);
        buyItNowPrice = Math.round(buyItNowPrice);

        // Fallback for safety
        if (startPrice < 1) startPrice = 1;
        if (buyItNowPrice <= startPrice) buyItNowPrice = Math.round(startPrice * 1.3) + 1;

        const payload = {
            sku: sku,
            marketplaceId: "EBAY_DE",
            format: "AUCTION",
            listingDescription: chatgptData.full_description || "",
            categoryId: categoryId || "360",
            pricingSummary: {
                auctionStartPrice: {
                    value: startPrice.toFixed(2),
                    currency: "EUR"
                },
                price: {           // eBay DE requires Buy It Now price (mandatory instant payment)
                    value: buyItNowPrice.toFixed(2),
                    currency: "EUR"
                }
            },
            tax: {
                applyTax: true,
                vatPercentage: 19.0
            },
            listingPolicies: {
                fulfillmentPolicyId: "250069570026",
                paymentPolicyId: "250069489026",
                returnPolicyId: "250069499026"
            },
            listingStartDate: this.getNextSunday2145ISO(),
            listingDuration: "DAYS_7",
            merchantLocationKey: "default"
        };

        const response = await this._request("POST", endpoint, payload);
        if (response.status === 201 || response.status === 200) {
            return response.data.offerId;
        } else {
            throw new Error(`Failed to create offer: ${JSON.stringify(response.data)}`);
        }
    }

    async publishOffer(offerId) {
        const endpoint = `/sell/inventory/v1/offer/${offerId}/publish`;
        const response = await this._request("POST", endpoint);
        if (response.status === 200) {
            return response.data.listingId;
        } else {
            throw new Error(`Failed to publish offer: ${JSON.stringify(response.data)}`);
        }
    }
}

module.exports = { EbayAPI };
