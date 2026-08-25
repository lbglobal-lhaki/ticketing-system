/**
 * Unit-only coverage for infant < 2 / child 2–11 / adult 12+.
 * Run: npx tsx scripts/test-child-infant-ages.ts
 */
import {
  ADULT_AGE_HINT,
  CHILD_AGE_HINT,
  CHILD_AGE_RANGE_LABEL,
  CHILD_MAX_AGE_YEARS,
  INFANT_AGE_HINT,
  INFANT_MAX_AGE_YEARS,
  assertChildInfantAges,
  assertDobMatchesType,
  completedAgeYears,
  parseCompanionTravellers,
  parseDateOfBirth,
  parseOnlineTravellersDraftResult,
  passengerTypeFromAge,
} from "../src/lib/booking/passengers";

let passed = 0;
let failed = 0;

function assert(cond: unknown, msg: string) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${msg}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${msg}`);
  }
}

function throws(fn: () => void, msg: string, match?: string | RegExp) {
  try {
    fn();
    failed += 1;
    console.error(`  ✗ ${msg} (did not throw)`);
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e);
    if (match && !(typeof match === "string" ? text.includes(match) : match.test(text))) {
      failed += 1;
      console.error(`  ✗ ${msg} (got: ${text})`);
      return;
    }
    passed += 1;
    console.log(`  ✓ ${msg}`);
  }
}

function typeOn(dob: string, on: Date) {
  return passengerTypeFromAge(completedAgeYears(parseDateOfBirth(dob), on));
}

function checkoutForm(
  rows: Array<{ type: "adult" | "child" | "infant"; dob?: string }>,
) {
  const fd = new FormData();
  rows.forEach((row, i) => {
    fd.set(`travellerType_${i}`, row.type);
    fd.set(`title_${i}`, "Mr");
    fd.set(`firstName_${i}`, "Test");
    fd.set(`lastName_${i}`, `Pax${i}`);
    fd.set(`dateOfBirth_${i}`, row.dob ?? "");
    if (i === 0) {
      fd.set("email_0", "adult@example.com");
      fd.set("phone_0", "0400000000");
    }
  });
  return fd;
}

const ageOn = new Date("2026-08-18T09:00:00Z");

console.log("\n== Infant / child / adult age ranges ==\n");

console.log("0) public copy");
assert(INFANT_MAX_AGE_YEARS === 2, "infant cutoff is 2");
assert(CHILD_MAX_AGE_YEARS === 12, "adult starts at 12");
assert(CHILD_AGE_RANGE_LABEL === "2–11", "child label 2–11");
assert(INFANT_AGE_HINT.startsWith("Under 2 years"), `infant hint: ${INFANT_AGE_HINT}`);
assert(CHILD_AGE_HINT.startsWith("2–11 years"), `child hint: ${CHILD_AGE_HINT}`);
assert(ADULT_AGE_HINT.startsWith("12+ years"), `adult hint: ${ADULT_AGE_HINT}`);

console.log("\n1) integer ages on departure");
const expectedByAge: Record<number, "infant" | "child" | "adult"> = {
  0: "infant",
  1: "infant",
  2: "child",
  3: "child",
  10: "child",
  11: "child",
  12: "adult",
  13: "adult",
  40: "adult",
};
for (const [age, expected] of Object.entries(expectedByAge)) {
  const n = Number(age);
  const dob = `${2026 - n}-08-18`;
  assert(typeOn(dob, ageOn) === expected, `age ${n} → ${expected}`);
}

console.log("\n2) birthday eve / on / after at the 2 and 12 cutoffs");
assert(typeOn("2024-08-19", ageOn) === "infant", "day before 2nd birthday → infant");
assert(typeOn("2024-08-18", ageOn) === "child", "on 2nd birthday → child");
assert(typeOn("2024-08-17", ageOn) === "child", "day after 2nd birthday → child");
assert(typeOn("2014-08-19", ageOn) === "child", "day before 12th birthday → child");
assert(typeOn("2014-08-18", ageOn) === "adult", "on 12th birthday → adult");
assert(typeOn("2014-08-17", ageOn) === "adult", "day after 12th birthday → adult");
assert(typeOn("2025-08-18", ageOn) === "infant", "on 1st birthday still infant");
assert(typeOn("2026-08-18", ageOn) === "infant", "newborn on departure → infant");
assert(typeOn("2024-09-18", ageOn) === "infant", "1 year 11 months → infant");
assert(typeOn("2015-08-19", ageOn) === "child", "11 years less one day → child");

console.log("\n3) leap-day birthdays");
assert(typeOn("2024-02-29", new Date("2026-02-28T12:00:00Z")) === "infant", "leap born, Feb 28 two years later → infant");
assert(typeOn("2024-02-29", new Date("2026-03-01T12:00:00Z")) === "child", "leap born, Mar 1 two years later → child");
assert(typeOn("2012-02-29", new Date("2024-02-28T12:00:00Z")) === "child", "leap born, Feb 28 at 12 → child");
assert(typeOn("2012-02-29", new Date("2024-03-01T12:00:00Z")) === "adult", "leap born, Mar 1 at 12 → adult");

console.log("\n4) assertDobMatchesType — valid");
assertDobMatchesType(parseDateOfBirth("2025-01-01"), "infant", ageOn);
assertDobMatchesType(parseDateOfBirth("2024-08-18"), "child", ageOn);
assertDobMatchesType(parseDateOfBirth("2015-08-18"), "child", ageOn);
assertDobMatchesType(parseDateOfBirth("2014-08-18"), "adult", ageOn);
assert(true, "valid infant / child / adult DOBs accepted");

console.log("\n5) assertDobMatchesType — wrong type + future DOB");
throws(
  () => assertDobMatchesType(parseDateOfBirth("2024-08-18"), "infant", ageOn),
  "exactly 2 rejected as infant",
  "under 2 years",
);
throws(
  () => assertDobMatchesType(parseDateOfBirth("2025-08-18"), "child", ageOn),
  "exactly 1 rejected as child (book as infant)",
  "Book them as an infant",
);
throws(
  () => assertDobMatchesType(parseDateOfBirth("2014-08-18"), "child", ageOn),
  "exactly 12 rejected as child (book as adult)",
  "Book them as an adult",
);
throws(
  () => assertDobMatchesType(parseDateOfBirth("2014-08-18"), "infant", ageOn),
  "12-year-old rejected as infant",
  "Book them as a adult",
);
throws(
  () => assertDobMatchesType(parseDateOfBirth("2026-08-19"), "infant", ageOn),
  "DOB after flight rejected",
  "cannot be after the flight date",
);

console.log("\n6) walk-in party validation");
assertChildInfantAges(
  [
    { passengerType: "adult", dateOfBirth: null, fullName: "Adult Skip" },
    { passengerType: "child", dateOfBirth: parseDateOfBirth("2020-08-18"), fullName: "Kid" },
    { passengerType: "infant", dateOfBirth: parseDateOfBirth("2025-12-01"), fullName: "Baby" },
  ],
  ageOn,
);
assert(true, "mixed party: adult without DOB + valid child + infant");
throws(
  () =>
    assertChildInfantAges(
      [{ passengerType: "child", dateOfBirth: null, fullName: "No Dob Kid" }],
      ageOn,
    ),
  "child missing DOB rejected",
  "date of birth is required",
);
throws(
  () =>
    assertChildInfantAges(
      [{ passengerType: "infant", dateOfBirth: parseDateOfBirth("2020-01-01"), fullName: "Too Old" }],
      ageOn,
    ),
  "6-year-old rejected as infant on walk-in",
  "under 2 years",
);

console.log("\n7) online checkout form");
const okCheckout = parseOnlineTravellersDraftResult(
  checkoutForm([
    { type: "adult" },
    { type: "child", dob: "2018-06-01" },
    { type: "infant", dob: "2025-06-01" },
  ]),
  { adults: 1, children: 1, infants: 1 },
  ageOn,
);
assert(okCheckout.ok === true, "checkout accepts 8yo child + 1yo infant");

const infantAsChild = parseOnlineTravellersDraftResult(
  checkoutForm([
    { type: "adult" },
    { type: "child", dob: "2025-08-18" },
  ]),
  { adults: 1, children: 1, infants: 0 },
  ageOn,
);
assert(
  infantAsChild.ok === false &&
    !infantAsChild.ok &&
    infantAsChild.fieldErrors.dateOfBirth_1?.includes("infant"),
  "checkout: 1-year-old as child → field error",
);

const twoAsInfant = parseOnlineTravellersDraftResult(
  checkoutForm([
    { type: "adult" },
    { type: "infant", dob: "2024-08-18" },
  ]),
  { adults: 1, children: 0, infants: 1 },
  ageOn,
);
assert(
  twoAsInfant.ok === false &&
    !twoAsInfant.ok &&
    twoAsInfant.fieldErrors.dateOfBirth_1?.includes("under 2"),
  "checkout: 2-year-old as infant → field error",
);

const elevenOk = parseOnlineTravellersDraftResult(
  checkoutForm([
    { type: "adult" },
    { type: "child", dob: "2015-08-18" },
  ]),
  { adults: 1, children: 1, infants: 0 },
  ageOn,
);
assert(elevenOk.ok === true, "checkout: 11-year-old as child accepted");

const twelveAsChild = parseOnlineTravellersDraftResult(
  checkoutForm([
    { type: "adult" },
    { type: "child", dob: "2014-08-18" },
  ]),
  { adults: 1, children: 1, infants: 0 },
  ageOn,
);
assert(
  twelveAsChild.ok === false &&
    !twelveAsChild.ok &&
    twelveAsChild.fieldErrors.dateOfBirth_1?.includes("adult"),
  "checkout: 12-year-old as child → field error",
);

const twelveAdult = parseOnlineTravellersDraftResult(
  checkoutForm([{ type: "adult", dob: "" }]),
  { adults: 1, children: 0, infants: 0 },
  ageOn,
);
assert(twelveAdult.ok === true, "checkout: adult needs no date of birth");

console.log("\n8) walk-in companion parse still stores DOB; age check is separate");
const fd = new FormData();
fd.append("childPassengerName", "Almost Two");
fd.append("childPassengerPassport", "");
fd.append("childPassengerNationality", "");
fd.append("childPassengerPriceAud", "100");
fd.append("childPassengerDateOfBirth", "2025-08-18");
const parsed = parseCompanionTravellers(fd);
assert(parsed.children.length === 1, "walk-in parser accepts DOB without classifying");
throws(
  () => assertChildInfantAges(parsed.all, ageOn),
  "walk-in create/edit then rejects 1-year-old booked as child",
  "Book them as an infant",
);

throws(() => parseDateOfBirth("2026-02-30"), "invalid calendar date rejected");
throws(() => parseDateOfBirth("2025-02-29"), "non-leap 29 Feb rejected");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
