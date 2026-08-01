import { formatCargoAnswer } from "@/lib/cargo/submit";

export type CargoAnswers = Record<string, string | number | boolean | string[]>;

export type CargoParty = {
  name: string;
  company: string;
  address: string;
  phone: string;
  email: string;
};

export type CargoShipmentSummary = {
  parcelNumber: string;
  direction: string;
  flightDate: string;
  packages: string;
  weight: string;
  description: string;
  originLabel: string;
  destinationLabel: string;
  sender: CargoParty;
  receiver: CargoParty;
};

function norm(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function take(answers: CargoAnswers, ...candidates: string[]) {
  const byNorm = new Map<string, unknown>();
  for (const [key, value] of Object.entries(answers)) {
    byNorm.set(norm(key), value);
  }
  for (const candidate of candidates) {
    const hit = byNorm.get(norm(candidate));
    if (hit == null) continue;
    const text = formatCargoAnswer(hit);
    if (!text || text === "—") continue;
    return text;
  }
  return "";
}

function routeLabels(direction: string) {
  const d = direction.toLowerCase();
  const iPerth = d.indexOf("perth");
  const iParo = d.indexOf("paro");
  if (iPerth >= 0 && iParo >= 0) {
    if (iPerth < iParo) {
      return { originLabel: "Perth", destinationLabel: "Paro" };
    }
    return { originLabel: "Paro", destinationLabel: "Perth" };
  }
  if (d.includes("perth") && !d.includes("paro")) {
    return { originLabel: "Perth", destinationLabel: direction || "Destination" };
  }
  if (d.includes("paro") && !d.includes("perth")) {
    return { originLabel: "Paro", destinationLabel: direction || "Destination" };
  }
  return {
    originLabel: take({ Direction: direction }, "Origin") || "Origin",
    destinationLabel:
      take({ Direction: direction }, "Destination") || "Destination",
  };
}

/** Pull sender / receiver / shipment fields from a cargo enquiry for emails & admin UI. */
export function extractCargoShipment(input: {
  id: string;
  parcelNumber?: string | null;
  email?: string | null;
  phone?: string | null;
  submitterName?: string | null;
  answers: CargoAnswers;
}): CargoShipmentSummary {
  const answers = input.answers;
  const direction = take(answers, "Direction", "Route", "Flight Route");
  const labels = routeLabels(direction);

  const sender: CargoParty = {
    name:
      take(
        answers,
        "Sender Name",
        "Full Name",
        "Name",
        "Shipper Name",
        "Consignor",
      ) ||
      input.submitterName ||
      "",
    company: take(
      answers,
      "Company Name (if applicable)",
      "Company",
      "Company Name",
    ),
    address: [
      take(answers, "Residential Address", "Address", "Sender Address"),
      take(answers, "City"),
      take(answers, "Country"),
    ]
      .filter(Boolean)
      .join(", "),
    phone:
      take(answers, "Phone Number", "Phone", "Mobile Number", "Mobile") ||
      input.phone ||
      "",
    email:
      take(answers, "Email Address", "Email", "Contact Email", "Sender Email") ||
      input.email ||
      "",
  };

  const receiver: CargoParty = {
    name: take(
      answers,
      "Receiver Name",
      "Consignee",
      "Recipient Name",
      "Receiver Full Name",
    ),
    company: take(
      answers,
      "Receiver Company",
      "Consignee Company",
      "Receiver Company Name",
    ),
    address: take(
      answers,
      "Receiver Address",
      "Consignee Address",
      "Delivery Address",
    ),
    phone: take(
      answers,
      "Receiver Phone",
      "Consignee Phone",
      "Receiver Mobile",
    ),
    email: take(answers, "Receiver Email", "Consignee Email"),
  };

  const originFromForm = take(answers, "Origin");
  const destFromForm = take(answers, "Destination");

  return {
    parcelNumber:
      input.parcelNumber?.trim() ||
      take(answers, "Reference Number", "Booking Reference", "Booking Ref") ||
      input.id.slice(-10).toUpperCase(),
    direction,
    flightDate: take(
      answers,
      "Preferred Flight Month",
      "Flight Date",
      "Travel Date",
      "Arrival Date",
    ),
    packages: take(answers, "Number of Packages", "Packages", "Pieces", "Qty"),
    weight: take(
      answers,
      "Estimated Weight (kg)",
      "Weight (kg)",
      "Weight",
      "Total Weight",
    ),
    description: take(
      answers,
      "Cargo description",
      "Description of Goods",
      "Description",
      "Cargo Details",
      "Item Description",
    ),
    originLabel: originFromForm || labels.originLabel,
    destinationLabel: destFromForm || labels.destinationLabel,
    sender,
    receiver,
  };
}
