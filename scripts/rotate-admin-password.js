const fs = require("fs");
const crypto = require("crypto");

const path = ".env";
let text = fs.readFileSync(path, "utf8");
const password = crypto.randomBytes(24).toString("base64url");

if (/^ADMIN_PASSWORD=/m.test(text)) {
  text = text.replace(/^ADMIN_PASSWORD=.*$/m, `ADMIN_PASSWORD="${password}"`);
} else {
  text += `\nADMIN_PASSWORD="${password}"\n`;
}

if (!/^STRIPE_WEBHOOK_SECRET=/m.test(text)) {
  text +=
    '\n# Set from Stripe Dashboard after creating webhook endpoint\nSTRIPE_WEBHOOK_SECRET=""\n';
}

fs.writeFileSync(path, text);
fs.writeFileSync(
  ".admin-password-rotated.txt",
  `New ADMIN_PASSWORD (copy to production host, then delete this file):\n${password}\n`,
);
console.log("Rotated ADMIN_PASSWORD; wrote .admin-password-rotated.txt");
console.log("Length:", password.length);
