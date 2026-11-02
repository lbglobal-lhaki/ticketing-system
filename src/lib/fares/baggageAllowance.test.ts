import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CARRY_ON_KG,
  INFANT_BAGGAGE_POLICY,
  INFANT_CABIN_KG,
  INFANT_CHECKED_KG,
  allowanceForPassengerType,
  baggageSummaryLine,
  fallbackAllowance,
  infantBaggageAllowance,
  infantBaggageBullets,
  infantBaggageSummaryLine,
  partyBaggageSummaryLine,
  partyHasInfant,
} from "./baggageAllowance";

test("infant allowance is 10 kg checked and no cabin bag", () => {
  const infant = infantBaggageAllowance();
  assert.equal(infant.includedKg, INFANT_CHECKED_KG);
  assert.equal(infant.includedKg, 10);
  assert.equal(infant.cabinBaggageKg, INFANT_CABIN_KG);
  assert.equal(infant.cabinBaggageKg, 0);
  assert.equal(infant.checkedLabel, "10 kg");
  assert.equal(infant.cabinBagLabel, "None");
  assert.equal(infantBaggageSummaryLine(), "10 kg checked · no cabin bag");
});

test("adult and child fares keep seated carry-on, not the infant rule", () => {
  const seated = fallbackAllowance("economy");
  assert.equal(seated.cabinBaggageKg, CARRY_ON_KG);
  assert.equal(seated.includedKg, 23);
  assert.equal(
    allowanceForPassengerType("adult", seated).cabinBaggageKg,
    CARRY_ON_KG,
  );
  assert.equal(
    allowanceForPassengerType("child", seated).cabinBaggageKg,
    CARRY_ON_KG,
  );
  assert.equal(allowanceForPassengerType("infant", seated).includedKg, 10);
  assert.equal(allowanceForPassengerType("infant", seated).cabinBaggageKg, 0);
  assert.equal(baggageSummaryLine("23 kg"), "23 kg checked · 7 kg carry-on");
});

test("party summary mentions infant trolley and diaper bag, not staff names", () => {
  const seatedOnly = partyBaggageSummaryLine("23 kg", false);
  assert.equal(seatedOnly, "23 kg checked · 7 kg carry-on");
  assert.equal(seatedOnly.includes("Infant"), false);

  const withInfant = partyBaggageSummaryLine("23 kg", true);
  assert.match(withInfant, /Infants: 10 kg checked · no cabin bag/);
  assert.match(withInfant, /infant trolley/i);
  assert.match(withInfant, /diaper bag/i);
  assert.equal(/woeshel/i.test(withInfant), false);
  assert.equal(/woeshel/i.test(INFANT_BAGGAGE_POLICY), false);

  const bullets = infantBaggageBullets().join(" ");
  assert.match(bullets, /10 kg checked baggage, no cabin bag/);
  assert.match(bullets, /trolley and diaper bag/i);
});

test("partyHasInfant uses passenger types or the infant count", () => {
  assert.equal(partyHasInfant([{ passengerType: "adult" }]), false);
  assert.equal(
    partyHasInfant([
      { passengerType: "adult" },
      { passengerType: "infant" },
    ]),
    true,
  );
  assert.equal(partyHasInfant([], 1), true);
  assert.equal(partyHasInfant([], 0), false);
});
