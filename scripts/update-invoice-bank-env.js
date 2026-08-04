const fs = require("fs");
const path = ".env";
let text = fs.readFileSync(path, "utf8");

function upsert(key, value) {
  const line = `${key}="${value}"`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(text)) text = text.replace(re, line);
  else text += `\n${line}\n`;
}

upsert("BRAND_INVOICE_BUSINESS_ABN", "47 649 045 714");
upsert("BRAND_INVOICE_BUSINESS_TPN", "47 649 045 714");
upsert("BANK_SWIFT", "CTBAAU2S");
upsert(
  "BANK_ADDRESS",
  "Commonwealth Bank of Australia, 217a Main St, Osborne Park WA 6017",
);

fs.writeFileSync(path, text);
console.log("Updated .env brand ABN + bank SWIFT/address");
