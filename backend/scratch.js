const axios = require('axios');
const appId = "JanSteeg-resellan-PRD-9544c387d-b4d4612c";
const keyword = "iphone";
const url = `https://svcs.ebay.com/services/search/FindingService/v1?OPERATION-NAME=findCompletedItems&SERVICE-VERSION=1.7.0&SECURITY-APPNAME=${appId}&RESPONSE-DATA-FORMAT=JSON&REST-PAYLOAD&keywords=${keyword}&itemFilter(0).name=Condition&itemFilter(0).value=3000&itemFilter(1).name=SoldItemsOnly&itemFilter(1).value=true`;
axios.get(url).then(res => console.log(JSON.stringify(res.data, null, 2))).catch(e => console.error(e.response ? e.response.data : e.message));
