# Cargo Google Form → Admin inbox

Google Forms cannot POST to this app by itself. Connect the form with an
**Apps Script** `onFormSubmit` trigger that calls:

`POST https://booking.lbglobal.com.au/api/cargo/submit`

(Use your live booking domain if different.)

## 1. Vercel / env

In the client Vercel project → **Settings → Environment Variables** (Production):

| Name | Value |
|------|--------|
| `CARGO_FORM_SECRET` | a long random secret (same as local `.env`) |

Redeploy after adding it.

Locally, add the same key to `.env` (see `.env.example`).

## 2. Apps Script on the Google Form

1. Open the form in edit mode → **⋮ → Script editor**.
2. Paste the script below; set `API_URL` and `SECRET`.
3. **Save** → **Triggers** (clock icon) → **Add trigger**:
   - Function: `onFormSubmit`
   - Event source: **From form**
   - Event type: **On form submit**
4. Authorize the script when prompted (Google account that owns the form).
5. Submit a test response and confirm it appears under **Admin → Cargo**.

```javascript
/** @OnlyCurrentDoc */
const API_URL = "https://booking.lbglobal.com.au/api/cargo/submit";
const SECRET = "PASTE_SAME_VALUE_AS_CARGO_FORM_SECRET";

function onFormSubmit(e) {
  const response = e.response;
  const itemResponses = response.getItemResponses();
  const answers = {};

  for (var i = 0; i < itemResponses.length; i++) {
    var item = itemResponses[i];
    var title = item.getItem().getTitle();
    var raw = item.getResponse();
    // Checkbox / multi-select come back as arrays
    answers[title] = raw;
  }

  var payload = {
    googleResponseId: response.getId(),
    submittedAt: response.getTimestamp().toISOString(),
    answers: answers,
    // Optional shortcuts — adjust titles to match your form questions:
    // name: answers["Full name"] || answers["Name"],
    // email: answers["Email"],
    // phone: answers["Phone"],
  };

  var result = UrlFetchApp.fetch(API_URL, {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + SECRET,
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  var code = result.getResponseCode();
  if (code < 200 || code >= 300) {
    console.error("Cargo API failed", code, result.getContentText());
  }
}
```

The API also auto-detects common question titles (`Name`, `Email`, `Phone`, etc.)
into the admin list columns. Open any row to see every form answer.

## 3. Smoke-test without the form

```bash
curl -X POST "http://localhost:3000/api/cargo/submit" ^
  -H "Authorization: Bearer YOUR_SECRET" ^
  -H "Content-Type: application/json" ^
  -d "{\"answers\":{\"Name\":\"Test Shipper\",\"Email\":\"test@example.com\",\"Cargo description\":\"2 boxes\"},\"googleResponseId\":\"test-1\"}"
```

Then open `/admin?tab=cargo`.

## Admin dashboard (Cargo tab)

Admins can also:

- **Add cargo form** — create an enquiry manually (no Google Form needed)
- **View / Edit / Delete** submissions
- **Preview PDF** — opens `/documents/cargo/[id]` as an A4 PDF (admin login required)

Google Form submissions and manual entries share the same list.
