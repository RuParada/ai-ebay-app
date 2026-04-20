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

    async createTradingListing(sku, chatgptData, imageUrls = [], condition = "USED_EXCELLENT", categoryId = "360", extraSpecifics = []) {
        const title = chatgptData.title || `Draft ${sku}`;
        const marke = chatgptData.marke || "Markenlos";
        const produktart = chatgptData.productart || "Sonstige";
        const modell = chatgptData.modell || "Nicht zutreffend";
        const abteilung = chatgptData.abteilung || "Nicht zutreffend";

        // Condition Mapping (Sell API to Trading API)
        let conditionID = 3000;
        if (condition === "NEW_OTHER" || condition === "NEW") {
            conditionID = 1500;
        } else if (condition === "USED_GOOD" || condition === "USED_ACCEPTABLE") {
            conditionID = 4000; // Good or Acceptable
        } else if (condition === "USED_POOR") {
            conditionID = 6000; // For parts or not working
        }

        // Prices
        let startPrice = Number(chatgptData.estimated_price) || 19.99;
        let buyItNowPrice = startPrice * 1.4;
        
        const soldPrices = await this.searchSoldItems(chatgptData.search_keyword || chatgptData.title);
        if (soldPrices) {
            startPrice = soldPrices.average * 1.05;
            buyItNowPrice = soldPrices.max;
            if (buyItNowPrice <= startPrice * 1.45) {
                buyItNowPrice = startPrice * 1.45;
            }
        } else {
            startPrice = startPrice * 1.05;
            buyItNowPrice = startPrice * 1.45;
        }

        startPrice = Math.round(startPrice);
        buyItNowPrice = Math.round(buyItNowPrice);

        if (startPrice < 1) startPrice = 1;
        if (buyItNowPrice < Math.ceil(startPrice * 1.40)) {
            buyItNowPrice = Math.ceil(startPrice * 1.45) + 1;
        }

        // Pictures
        const finalImageUrls = imageUrls.length > 0
            ? imageUrls.slice(0, 12)
            : ["https://i.ebayimg.com/images/g/m5EAAOSwyOFl0Mow/s-l1600.jpg"];
            
        let pictureDetailsXml = ``;
        for (const url of finalImageUrls) {
            pictureDetailsXml += `<PictureURL>${url.replace(/&/g, '&amp;')}</PictureURL>\n`;
        }
        
        // Escape XML values
        const escapeXml = (unsafe) => {
            if (!unsafe) return "";
            return String(unsafe).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
        };
        
        let extraSpecificsXml = ``;
        for (const spec of extraSpecifics) {
            extraSpecificsXml += `
      <NameValueList>
        <Name>${escapeXml(spec.name)}</Name>
        <Value>${escapeXml(spec.value)}</Value>
      </NameValueList>`;
        }

        const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
<AddItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>de_DE</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <Item>
    <Title>${escapeXml(title).substring(0, 80)}</Title>
    <Description><![CDATA[${chatgptData.full_description || ""}]]></Description>
    <PrimaryCategory>
      <CategoryID>${categoryId}</CategoryID>
    </PrimaryCategory>
    <StartPrice>${startPrice.toFixed(2)}</StartPrice>
    <BuyItNowPrice>${buyItNowPrice.toFixed(2)}</BuyItNowPrice>
    <ConditionID>${conditionID}</ConditionID>
    <Country>DE</Country>
    <Currency>EUR</Currency>
    <DispatchTimeMax>3</DispatchTimeMax>
    <ListingDuration>Days_7</ListingDuration>
    <ListingType>Chinese</ListingType>
    <PostalCode>10115</PostalCode>
    <Quantity>1</Quantity>
    <ItemSpecifics>
      <NameValueList>
        <Name>Marke</Name>
        <Value>${escapeXml(marke)}</Value>
      </NameValueList>
      <NameValueList>
        <Name>Produktart</Name>
        <Value>${escapeXml(produktart)}</Value>
      </NameValueList>
      <NameValueList>
        <Name>Modell</Name>
        <Value>${escapeXml(modell)}</Value>
      </NameValueList>
      <NameValueList>
        <Name>Abteilung</Name>
        <Value>${escapeXml(abteilung)}</Value>
      </NameValueList>${extraSpecificsXml}
    </ItemSpecifics>
    <PictureDetails>
      <GalleryType>Gallery</GalleryType>
      ${pictureDetailsXml}
    </PictureDetails>
    <SellerProfiles>
      <SellerPaymentProfile>
        <PaymentProfileID>250069489026</PaymentProfileID>
      </SellerPaymentProfile>
      <SellerReturnProfile>
        <ReturnProfileID>250069499026</ReturnProfileID>
      </SellerReturnProfile>
      <SellerShippingProfile>
        <ShippingProfileID>250069570026</ShippingProfileID>
      </SellerShippingProfile>
    </SellerProfiles>
    <ScheduleTime>${this.getNextSunday2145ISO()}</ScheduleTime>
    <SKU>${escapeXml(sku)}</SKU>
    <Site>Germany</Site>
  </Item>
</AddItemRequest>`;

        if (!this.accessToken) {
            await this.refreshUserToken();
        }

        let headers = {
            'Content-Type': 'text/xml',
            'X-EBAY-API-CALL-NAME': 'AddItem',
            'X-EBAY-API-SITEID': '77',
            'X-EBAY-API-APP-NAME': this.appId,
            'X-EBAY-API-DEV-NAME': this.devId,
            'X-EBAY-API-CERT-NAME': this.certId,
            'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
            'X-EBAY-API-IAF-TOKEN': this.accessToken
        };

        const executeAddItem = async (isRetry = false) => {
            let res;
            try {
                res = await axios.post('https://api.ebay.com/ws/api.dll', xmlRequest, { headers });
            } catch (error) {
                if (error.response && error.response.status === 401 && !isRetry) {
                    await this.refreshUserToken();
                    headers['X-EBAY-API-IAF-TOKEN'] = this.accessToken;
                    return await executeAddItem(true);
                } else {
                    throw error;
                }
            }
            
            const parsed = await xml2js.parseStringPromise(res.data, { explicitArray: false });
            const root = parsed['AddItemResponse'];

            if (root.Ack !== 'Success' && root.Ack !== 'Warning') {
                const errMsg = root.Errors ? JSON.stringify(root.Errors) : 'Unknown AddItem error';
                
                if (!isRetry && (errMsg.includes('IAF token') || errMsg.includes('IAF-Token'))) {
                    console.log("Trading API token expired. Refreshing...");
                    await this.refreshUserToken();
                    headers['X-EBAY-API-IAF-TOKEN'] = this.accessToken;
                    return await executeAddItem(true);
                }
                
                let errorsList = root.Errors;
                if (!Array.isArray(errorsList)) errorsList = errorsList ? [errorsList] : [];
                
                let missingSpecifics = [];
                let hasMissingSpecificError = false;
                
                for (const err of errorsList) {
                    if (err && err.ErrorCode === '21919303' && err.ErrorParameters) {
                        hasMissingSpecificError = true;
                        let params = err.ErrorParameters;
                        if (!Array.isArray(params)) params = [params];
                        
                        const param2 = params.find(p => p.$ && p.$.ParamID === '2');
                        if (param2 && param2.Value) {
                            missingSpecifics.push(param2.Value);
                        }
                    }
                }
                
                const isStuck = missingSpecifics.every(spec => {
                    const existing = extraSpecifics.find(e => e.name === spec);
                    return existing && existing.value === "Unbekannt";
                });
                
                if (hasMissingSpecificError && missingSpecifics.length > 0 && !isStuck) {
                    console.log("Missing specifics found, retrying with: ", missingSpecifics);
                    const newExtras = [...extraSpecifics];
                    
                    for (const spec of missingSpecifics) {
                        const existingIndex = newExtras.findIndex(e => e.name === spec);
                        if (existingIndex === -1) {
                            newExtras.push({ name: spec, value: "Nicht zutreffend" });
                        } else {
                            const prevValue = newExtras[existingIndex].value;
                            let nextValue = "Sonstige";
                            if (prevValue === "Nicht zutreffend") nextValue = "Sonstige";
                            else if (prevValue === "Sonstige") nextValue = "Siehe Beschreibung";
                            else if (prevValue === "Siehe Beschreibung") nextValue = "Keine Angabe";
                            else nextValue = "Unbekannt";
                            
                            newExtras[existingIndex] = { name: spec, value: nextValue };
                        }
                    }
                    return await this.createTradingListing(sku, chatgptData, imageUrls, condition, categoryId, newExtras);
                }
                
                throw new Error(`Trading API AddItem failed: ${errMsg}`);
            }

            return typeof root.ItemID === 'string' ? root.ItemID : (root.ItemID && root.ItemID[0] ? root.ItemID[0] : root.ItemID);
        };

        return await executeAddItem();
    }
}

module.exports = { EbayAPI };
