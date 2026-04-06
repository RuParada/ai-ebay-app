const fs = require('fs');
let content = fs.readFileSync('../.env', 'utf8');
content = content.replace(/^EBAY_USER_TOKEN=(v.*)$/m, 'EBAY_USER_TOKEN="$1"');
content = content.replace(/^EBAY_REFRESH_TOKEN=(v.*)$/m, 'EBAY_REFRESH_TOKEN="$1"');
fs.writeFileSync('../.env', content);
console.log("Fixed .env tokens!");
