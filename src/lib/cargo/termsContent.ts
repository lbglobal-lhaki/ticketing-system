/** Public path for the uploaded Cargo Customer Terms & Conditions PDF. */
export const CARGO_TERMS_PDF_HREF = "/documents/cargo-customer-terms.pdf";

export type CargoTermsBlock = {
  heading?: string;
  paragraphs: string[];
  bullets?: string[];
};

export const CARGO_TERMS_INTRO =
  'These Terms and Conditions apply to cargo booked with L&B Global Pty Ltd & DrukAir for transportation between Paro, Bhutan and Perth, Western Australia, including cargo collected or received through authorised cargo partners. By booking, paying for, or handing cargo to us or our authorised agent, the sender ("Shipper") confirms that they have read, understood and accepted these Terms and Conditions.';

export const CARGO_TERMS_SECTIONS: CargoTermsBlock[] = [
  {
    heading: "1. Cargo Service",
    paragraphs: [
      "The cargo service operates in connection with scheduled/chartered air services between Bhutan and Australia.",
      "Acceptance of a cargo booking does not constitute an unconditional guarantee that the cargo will travel on a particular flight. Available cargo capacity may change because of passenger numbers and baggage, aircraft payload, fuel requirements, weather, operational conditions, safety requirements, aircraft configuration, load control or airline instructions.",
      "Cargo is always subject to final acceptance by L&B Global & Drukair, the airline, ground handler, customs, security and other relevant authorities.",
    ],
  },
  {
    heading: "2. Cargo Drop-Off",
    paragraphs: [
      "All cargo must be delivered to the designated cargo drop-off location within the required acceptance period advised for each flight. Customers must provide their cargo booking/reference details when dropping off their shipment.",
    ],
  },
  {
    heading: "2.1 Bhutan - Paro Cargo Drop-Off",
    paragraphs: [
      "SD Plaza, 5th Floor, Opposite to Om Bakery, Thimphu Town",
      "For cargo bookings, drop-off assistance and enquiries, please contact: +975 1742 6913, +975 7726 4922, +975 1757 8995.",
      "Customers must ensure that all cargo is properly packed, labelled and accompanied by the required sender, consignee and shipment information before acceptance.",
    ],
  },
  {
    heading: "2.2 Australia - Perth Cargo Drop-Off",
    paragraphs: [
      "Level 5, Suite 32/25 Walters Drive, Osborne Park, WA, Australia",
      "For cargo bookings, drop-off assistance and enquiries, please contact: +61 424 919 833, +61 451 106 077.",
      "Customers must ensure that all cargo is properly packed, labelled and accompanied by the required sender, consignee and shipment information before acceptance.",
    ],
  },
  {
    heading: "2.3 Drop-Off Conditions",
    paragraphs: [
      "Cargo must not be left unattended at either location. A shipment will only be considered received after it has been accepted by an authorised representative and the applicable booking/reference details have been recorded.",
      "Acceptance at the drop-off location does not guarantee uplift on the scheduled flight. Cargo remains subject to final weight and measurement verification, security screening, documentation requirements, customs and biosecurity requirements, airline acceptance and available aircraft cargo capacity.",
      "This is consistent with the underlying L&B Global Cargo Services, which requires cargo to be correctly packaged and labelled, have accurate weight and dimensions, complete documentation, satisfy aviation security and export requirements, and be acceptable for entry into the destination country.",
    ],
  },
  {
    heading: "3. Sender's Responsibility",
    paragraphs: [
      "The sender is responsible for providing complete and accurate information about every shipment, including:",
    ],
    bullets: [
      "sender's full name, address and contact details",
      "receiver's full name, address and contact details",
      "accurate description of every item",
      "number of packages",
      "value of goods",
      "country of origin where required",
      "invoices/receipts where required",
      "permits, certificates or approvals where required",
      "any information necessary for customs, security or biosecurity clearance",
    ],
  },
  {
    heading: "",
    paragraphs: [
      "The underlying agreement similarly requires manifests to identify the shipper, consignee, cargo description, pieces, weight, dimensions, declared value, origin and relevant permits/certificates.",
      'Customers must never describe goods simply as "personal items", "gift", "food", "clothes" or "miscellaneous" where a more accurate description can be provided.',
    ],
  },
  {
    heading: "4. Inspection and Opening of Cargo",
    paragraphs: [
      "All cargo may be inspected, opened, screened, X-rayed or otherwise examined where required by L&B Global, its authorised agents, the airline, aviation security, customs, quarantine/biosecurity or other government authorities.",
      "The customer authorises such inspection by submitting cargo for transportation.",
    ],
  },
  {
    heading: "5. Packaging",
    paragraphs: [
      "All cargo must be properly and securely packed for air transportation. Packaging must be capable of protecting the goods during normal handling, loading, unloading and transportation.",
      "Fragile goods must be adequately protected and clearly identified.",
      "L&B Global may refuse poorly packed, leaking, damaged, contaminated, unsecured or otherwise unsuitable packages.",
    ],
  },
  {
    heading: "6. Weight and Dimensions",
    paragraphs: [
      "Customers must declare the approximate weight and dimensions when making a booking.",
      "The final charge will be calculated using the applicable chargeable weight. Where applicable, the chargeable weight will be the greater of Actual Gross Weight, or Volumetric Weight.",
      "Final weight and dimensions may be re-measured at the cargo facility.",
      "If the verified weight is greater than the amount originally declared or paid for, the customer must pay the difference before cargo is accepted for carriage.",
    ],
  },
  {
    heading: "7. Payment",
    paragraphs: [
      "Cargo charges must be paid in accordance with the price quoted at booking. Unless expressly agreed otherwise, cargo will not be considered fully confirmed until the required payment has been received.",
      "Additional charges may arise for services including customs clearance, customs examination, security screening, quarantine/biosecurity inspection, treatment, storage, special handling, permits, return freight, redelivery or destruction. These charges are not automatically included in the normal air-cargo freight rate.",
    ],
  },
  {
    heading: "8. Customs, Duties and Taxes",
    paragraphs: [
      "The sender and/or receiver is responsible for all applicable customs duties, GST/taxes, import/export permits, customs broker charges, biosecurity/quarantine charges, inspections, treatments, storage charges and other government or regulatory charges.",
      "Payment of freight charges does not guarantee customs or biosecurity clearance.",
      "For Australia, imported goods may require a SAC or formal Import Declaration depending on value and circumstances, and permits may be necessary for restricted goods.",
    ],
  },
  {
    heading: "9. Australian Biosecurity",
    paragraphs: [
      "Australia has strict biosecurity requirements. Food, plants, seeds, timber, bamboo, animal products and other biological materials may be prohibited, require permits or be subject to inspection or treatment.",
      "Customers sending goods Bhutan → Australia must declare all such products accurately before cargo is accepted.",
      "Australian authorities recommend checking the Biosecurity Import Conditions system (BICON) before sending relevant goods.",
    ],
  },
  {
    heading: "10. Prohibited and Restricted Goods",
    paragraphs: [
      "Customers must not send prohibited, illegal, undeclared or dangerous goods.",
      "Restricted goods will only be accepted where all necessary permits, licences, declarations and approvals have been obtained and L&B Global has expressly agreed to accept the shipment.",
    ],
  },
  {
    heading: "11. Dangerous Goods",
    paragraphs: [
      "Dangerous goods must not be included in ordinary cargo without prior written approval.",
      "Examples include explosives, fireworks, compressed gases, fuel, flammable liquids, certain chemicals, corrosive substances and certain batteries/battery-powered equipment.",
      "If unsure, the customer must disclose the item before dropping it off.",
    ],
  },
  {
    heading: "12. False Declaration or Undeclared Items",
    paragraphs: [
      "The sender is responsible for the accuracy of the cargo declaration.",
      "If prohibited, restricted, dangerous or undeclared goods are discovered, L&B Global may refuse transportation and may hand the shipment to the appropriate authority where legally required.",
      "Any resulting storage, inspection, penalties, treatment, return, disposal, destruction or other costs may be charged to the sender/receiver where permitted by law.",
    ],
  },
  {
    heading: "13. Cargo Capacity",
    paragraphs: [
      "Cargo capacity is limited and may vary for each flight. Passenger safety, passenger baggage and aircraft operational requirements take priority.",
      "Therefore, even after booking, cargo may be reduced, deferred or transferred to a subsequent available service where required for operational, payload, safety, regulatory or airline reasons.",
    ],
  },
  {
    heading: "14. Flight Delays, Changes and Cancellations",
    paragraphs: [
      "Flight schedules may change because of weather, technical matters, airport restrictions, regulatory decisions, operational requirements, aircraft availability, force majeure or circumstances outside our reasonable control.",
      "Where cargo cannot travel on the intended flight, we will work with the customer to arrange the next appropriate available solution.",
    ],
  },
  {
    heading: "15. Customs/Biosecurity Delays",
    paragraphs: [
      "L&B Global cannot guarantee the time required for customs, security, quarantine or biosecurity clearance.",
      "Any government inspection, treatment or document requirement may delay cargo release.",
    ],
  },
  {
    heading: "16. Loss or Damage",
    paragraphs: [
      "Customers must ensure goods are appropriately packaged. Responsibility for cargo will generally depend upon who has custody of the cargo when the loss or damage occurs. Air-carriage claims are dealt with under the airline's applicable conditions of carriage and applicable law.",
      "Any visible damage, shortage or irregularity should be reported immediately and supported with photographs, receipts/invoices, cargo reference/AWB and other reasonable evidence.",
    ],
  },
  {
    heading: "17. High-Value Cargo and Insurance",
    paragraphs: [
      "Customers should inform us before sending high-value goods.",
      "Ordinary freight charges do not automatically provide full replacement-value cargo insurance. Customers should arrange appropriate insurance where necessary.",
    ],
  },
  {
    heading: "18. Uncollected Cargo",
    paragraphs: [
      "The consignee must collect cargo within the period advised following clearance and release.",
      "Storage or other charges may apply where cargo is not collected on time. Where cargo remains uncollected for an extended period, it may be dealt with according to applicable customs, warehouse and legal requirements.",
    ],
  },
  {
    heading: "19. Right to Refuse Cargo",
    paragraphs: [
      "L&B Global reserves the right to refuse cargo that is prohibited or illegal; unsafe; improperly packaged; incorrectly declared; leaking or contaminated; missing required documentation; outside permitted dimensions/weight; suspected of containing dangerous goods; unacceptable to the airline or ground handler; or unable to satisfy customs, biosecurity, aviation-security or destination-country requirements.",
    ],
  },
  {
    heading: "20. Customer Acceptance",
    paragraphs: [
      "By submitting cargo, the customer confirms:",
      "I declare that the information provided about my shipment is true and complete. I have disclosed all contents of the shipment and have not included prohibited, illegal, undeclared or unauthorised dangerous goods. I understand that my cargo may be inspected or screened and that acceptance is subject to airline capacity, security, customs, biosecurity and applicable laws of Bhutan and Australia.",
    ],
  },
  {
    heading: "21. Additional Charges - Customs, Clearance & Disposal",
    paragraphs: [
      "In addition to the air cargo/freight charges paid at the time of booking, the following charges may apply upon arrival of the cargo at its destination:",
    ],
  },
  {
    heading: "21.1 Clearing Agent Fee",
    paragraphs: [
      "The Sender and/or Receiver (Consignee) is responsible for paying any applicable clearing agent, customs broker, handling, or clearance service fees required to release the cargo. These charges may be payable upon or after the cargo arrives at the destination.",
    ],
  },
  {
    heading: "21.2 Customs Clearance, Duties & Taxes",
    paragraphs: [
      "The Sender and/or Receiver (Consignee) is responsible for all customs clearance charges, import duties, taxes, levies, inspection fees, quarantine/biosecurity charges, and other government charges, where applicable. The amount will depend on the type, quantity, declared value, origin and applicable customs assessment of the goods and will generally be determined by the relevant authorities at the destination.",
    ],
  },
  {
    heading: "21.3 Disposal, Destruction or Abandonment Costs",
    paragraphs: [
      "If any cargo is rejected, prohibited, restricted, contaminated, unclaimed, abandoned, ordered for destruction, or otherwise required to be disposed of by customs, biosecurity, quarantine or another competent authority in either the origin or destination country, all associated costs will be the responsibility of the Sender and/or Receiver (Consignee).",
    ],
  },
];
