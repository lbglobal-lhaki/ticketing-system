/**
 * Flight Booking Terms and Conditions printed after the ticket sheets of the
 * e-ticket / itinerary. Text is verbatim from the client's updated reference
 * ("E-Ticket, Itinerary, and Receipts .pdf", sheets 3–11), and sections are
 * grouped per sheet exactly as the reference paginates them, so every sheet
 * carries its own letterhead band and contact footer.
 */

export type TermsBlock =
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] };

export type TermsSection = {
  /** Omitted for the untitled introduction. */
  heading?: string;
  blocks: TermsBlock[];
};

export type TermsSheet = {
  /** Printed centred at the top of the first sheet only. */
  title?: string;
  sections: TermsSection[];
};

const p = (text: string): TermsBlock => ({ kind: "p", text });
const ul = (...items: string[]): TermsBlock => ({ kind: "ul", items });

export const FLIGHT_TERMS_SHEETS: TermsSheet[] = [
  {
    title: "FLIGHT BOOKING TERMS AND CONDITIONS",
    sections: [
      {
        blocks: [
          p(
            "These Terms and Conditions apply to all flight bookings made through our website, office, authorised representatives, agents, or other approved booking channels.",
          ),
          p(
            "By making a booking and completing payment, the passenger or person making the booking confirms that they have read, understood and agreed to these Terms and Conditions on behalf of themselves and, where applicable, all passengers included in the booking.",
          ),
        ],
      },
      {
        heading: "1. Booking and Payment",
        blocks: [
          p(
            "A booking is considered confirmed only after the required payment has been successfully received and a booking confirmation, itinerary or e-ticket has been issued.",
          ),
          p(
            "Passengers are responsible for ensuring that all information entered during the booking process is complete and accurate, including:",
          ),
          ul(
            "Full name exactly as shown on the passport;",
            "Date of birth;",
            "Gender, where required;",
            "Passport details;",
            "Contact number;",
            "Email address; and",
            "Any other information required for travel or immigration purposes.",
          ),
          p(
            "The passenger is responsible for reviewing the booking confirmation immediately after receiving it and notifying us promptly of any errors.",
          ),
        ],
      },
      {
        heading: "2. Fares and Charges",
        blocks: [
          p(
            "All fares are subject to availability and may vary according to the travel date, fare category, seat availability and promotional conditions.",
          ),
          p(
            "The total amount payable may include the airfare and applicable taxes, airport charges, government charges, booking fees or other applicable charges. Unless otherwise stated, additional services such as excess baggage, cargo, special assistance or booking amendments may attract additional fees.",
          ),
        ],
      },
    ],
  },
  {
    sections: [
      {
        heading: "3. Cancellation More Than 30 Days Before Departure",
        blocks: [
          p(
            "A passenger who cancels their booking at least 30 days before the scheduled departure date may be eligible for a full refund of the eligible ticket amount.",
          ),
          p(
            "Any non-refundable third-party charges, payment processing fees, bank charges or other amounts that cannot reasonably be recovered may be deducted where applicable and permitted by law.",
          ),
          p(
            "Promotional or specially discounted fares may have separate refund conditions if clearly disclosed at the time of booking.",
          ),
        ],
      },
      {
        heading: "4. Cancellation Within 30 Days but More Than 72 Hours Before Departure",
        blocks: [
          p(
            "Where a passenger cancels less than 30 days before departure but more than 72 hours before the scheduled departure time, a partial refund will apply. A cancellation fee and any non-refundable costs may be deducted from the amount paid.",
          ),
          p(
            "The remaining eligible balance, if any, will be refunded in accordance with the applicable fare conditions. Passengers should contact us as early as possible if they are unable to travel.",
          ),
        ],
      },
      {
        heading: "5. Cancellation Within 72 Hours of Departure",
        blocks: [
          p(
            "If a passenger cancels their booking within 72 hours of the scheduled departure time, the ticket will be treated as non-refundable.",
          ),
          p(
            "No refund will normally be provided for cancellations made during this period, except where otherwise required under applicable law.",
          ),
        ],
      },
      {
        heading: "6. No-Show",
        blocks: [
          p(
            "A passenger who fails to report for check-in or fails to board the scheduled flight without cancelling within the applicable cancellation period will be considered a No-Show.",
          ),
          p("No-show tickets are non-refundable."),
          p(
            "Any onward or return sector associated with the same booking may also be affected. Passengers should contact us immediately if they miss a flight and still intend to use another sector of their booking.",
          ),
        ],
      },
    ],
  },
  {
    sections: [
      {
        heading: "7. Passenger Name and Booking Detail Changes",
        blocks: [
          p(
            "Passengers must ensure that the name entered during online booking matches the passenger's valid passport or travel document.",
          ),
          p(
            "Requests to correct or change passenger information after a booking has been confirmed may incur an administration or ticket amendment fee.",
          ),
          p("Changes may include:"),
          ul(
            "Name corrections;",
            "Passport details;",
            "Date of birth;",
            "Travel dates;",
            "Flight sector;",
            "Passenger details; or",
            "Other information requiring a ticket to be amended or reissued.",
          ),
          p(
            "Any applicable airline, ticketing, fare difference or administrative charges will be payable by the passenger before the amended ticket is issued.",
          ),
          p(
            "A complete transfer of a ticket from one passenger to another may not be permitted and will be subject to the applicable fare and airline/charter conditions.",
          ),
        ],
      },
      {
        heading: "8. Passenger-Requested Flight Date or Schedule Changes",
        blocks: [
          p(
            "If a passenger requests to change their travel date, flight or schedule after a confirmed booking has been issued, change fees will apply.",
          ),
          p("The passenger will be responsible for:"),
          ul(
            "Applicable booking amendment/change fees;",
            "Any difference between the original fare and the new fare;",
            "Applicable taxes or charges; and",
            "Any airline, charter operator or third-party reissue charges.",
          ),
          p("All changes are subject to seat availability and operational approval."),
          p(
            "Payment of a change fee does not guarantee that the requested alternative flight will be available.",
          ),
        ],
      },
    ],
  },
  {
    sections: [
      {
        heading: "9. Schedule Changes by the Airline or Charter Operator",
        blocks: [
          p(
            "Flight schedules, departure times, arrival times, routing, transit points and operational arrangements may be changed due to operational, regulatory, weather, airport, safety, security or other circumstances.",
          ),
          p(
            "Where we or the operating airline make a significant schedule change, affected passengers will be informed using the contact information provided in their booking.",
          ),
          p(
            "Depending on the circumstances and applicable consumer law, passengers may be offered an alternative flight, rescheduling, credit or refund where appropriate. Passengers will not be charged a passenger-requested change fee where the change is initiated by the airline or charter operator rather than requested by the passenger.",
          ),
        ],
      },
      {
        heading: "10. Charter Flight Conditions",
        blocks: [
          p(
            "Passengers acknowledge that charter flight operations may differ from regular scheduled airline services.",
          ),
          p(
            "Flight dates, departure times, arrival times, routing, technical stops and operational arrangements may be adjusted where reasonably necessary due to operational requirements, regulatory requirements, weather, airport restrictions, aircraft availability, safety considerations or circumstances beyond our reasonable control.",
          ),
          p(
            "Passengers should therefore regularly monitor their email, telephone and other nominated communication channels for operational updates before departure.",
          ),
        ],
      },
      {
        heading: "11. Check-In and Reporting Time",
        blocks: [
          p(
            "Passengers must report to the designated airport/check-in location by the reporting time communicated in their booking confirmation or subsequent flight notification.",
          ),
          p(
            "Passengers who arrive after check-in has closed may be denied boarding and may be treated as a no-show.",
          ),
          p(
            "We are not responsible for a passenger missing a flight because they arrived late at the airport or failed to comply with the notified check-in requirements.",
          ),
        ],
      },
    ],
  },
  {
    sections: [
      {
        heading: "12. Passport, Visa and Travel Requirements",
        blocks: [
          p(
            "Passengers are solely responsible for ensuring that they hold all required and valid travel documentation, including:",
          ),
          ul(
            "Passport;",
            "Visa or Australian visa status;",
            "Transit permission, where required;",
            "Entry or re-entry permission;",
            "Health or vaccination documentation, where applicable;",
            "Immigration documentation; and",
            "Any other documents required by the relevant authorities.",
          ),
          p(
            "Assistance provided by our staff in checking documentation is intended as an additional customer service and does not transfer the passenger's legal responsibility for satisfying immigration, customs or border requirements.",
          ),
          p(
            "A passenger who is refused boarding or entry because of invalid, expired, incomplete or incorrect travel documents may not be entitled to a refund.",
          ),
        ],
      },
      {
        heading: "13. Baggage",
        blocks: [
          p(
            "Passengers must comply with the baggage allowance specified on their booking confirmation or ticket. Baggage exceeding the permitted weight, size, or number of pieces may incur excess baggage charges, and acceptance depends on available aircraft capacity.",
          ),
          p(
            "Dangerous, prohibited or restricted goods must not be carried in checked or cabin baggage except where permitted under applicable aviation regulations. Passengers are responsible for complying with airline, aviation security, customs and biosecurity requirements.",
          ),
        ],
      },
      {
        heading: "14. Customs, Biosecurity and Declarations",
        blocks: [
          p(
            "Passengers travelling to Australia, Bhutan or another destination are responsible for correctly declaring goods where required.",
          ),
          p(
            "Food, plant material, animal products, medicines, commercial goods and other controlled or restricted items may be subject to customs, quarantine or biosecurity requirements.",
          ),
        ],
      },
    ],
  },
  {
    sections: [
      {
        blocks: [
          p(
            "Passengers are responsible for completing all arrival, customs and declaration documentation accurately.",
          ),
          p(
            "Any fines, penalties, seizure of goods, delays or other consequences resulting from a passenger's failure to correctly declare goods are the passenger's responsibility to the extent permitted by law.",
          ),
        ],
      },
      {
        heading: "15. Denied Boarding",
        blocks: [
          p(
            "A passenger may be refused carriage where reasonably necessary for safety, security, immigration, regulatory or operational reasons, including where the passenger:",
          ),
          ul(
            "Does not possess valid travel documents;",
            "Fails to comply with check-in requirements;",
            "Attempts to carry prohibited or dangerous items;",
            "Presents a safety or security risk;",
            "Engages in threatening, abusive or disruptive behaviour; or",
            "Fails to comply with lawful instructions from airline, airport or authorised staff.",
          ),
          p(
            "Refund eligibility in these circumstances will depend on the reason for denied boarding, applicable fare conditions and applicable law.",
          ),
        ],
      },
      {
        heading: "16. Flight Delays, Diversions and Operational Disruptions",
        blocks: [
          p(
            "Flights may be delayed, diverted, rescheduled or otherwise affected by circumstances including weather, airport restrictions, air traffic control, technical or operational requirements, government directions, security matters, natural disasters or other events outside our reasonable control.",
          ),
          p(
            "We will make reasonable efforts to communicate material changes and assist affected passengers.",
          ),
          p(
            "Any rights to a refund, alternative travel or other remedy will be determined by the circumstances, the applicable booking conditions and applicable consumer law.",
          ),
        ],
      },
    ],
  },
  {
    sections: [
      {
        heading: "17. Refund Processing",
        blocks: [
          p(
            "All refund requests must be submitted through the designated customer service channel and include the passenger's booking details. Approved refunds will normally be returned to the original payment method wherever reasonably possible.",
          ),
          p(
            "Refund processing time may vary depending on the payment provider, financial institution, airline or other parties involved. Processing fees or genuinely non-refundable third-party costs may be deducted where applicable and legally permitted.",
          ),
        ],
      },
      {
        heading: "18. Promotional and Special Fares",
        blocks: [
          p(
            "Promotional, discounted, early-bird or special fares may have additional restrictions, including reduced refundability or restrictions on changes. Any special restrictions applicable to a fare should be disclosed at the time of booking.",
          ),
          p(
            "Where a promotional fare is expressly identified as non-refundable, voluntary cancellation by the passenger will not normally qualify for a refund, except where a refund or other remedy is required by law.",
          ),
        ],
      },
      {
        heading: "19. Travel Insurance",
        blocks: [
          p(
            "Passengers are strongly encouraged to obtain appropriate travel insurance covering matters such as:",
          ),
          ul(
            "Cancellation;",
            "Medical emergencies;",
            "Travel delays;",
            "Missed connections;",
            "Lost or damaged baggage;",
            "Personal circumstances preventing travel; and",
            "Other unforeseen travel disruptions.",
          ),
          p("Travel insurance remains the passenger's responsibility."),
        ],
      },
      {
        heading: "20. Contact Information",
        blocks: [
          p(
            "Passengers are responsible for providing an active telephone number and email address when booking.",
          ),
        ],
      },
    ],
  },
  {
    sections: [
      {
        blocks: [
          p(
            "We may use these details to communicate important information relating to check-in, schedule changes, flight delays, documentation requirements or other operational matters.",
          ),
          p("Passengers should notify us promptly if their contact details change."),
        ],
      },
      {
        heading: "21. Limitation of Liability",
        blocks: [
          p(
            "To the maximum extent permitted by law, we will not be responsible for losses arising solely from circumstances outside our reasonable control.",
          ),
          p(
            "Nothing in these Terms and Conditions excludes, restricts or modifies any consumer guarantee, statutory right or remedy that cannot lawfully be excluded, restricted or modified.",
          ),
        ],
      },
      {
        heading: "22. Australian Consumer Law",
        blocks: [
          p(
            "These Terms and Conditions are intended to operate subject to the Australian Consumer Law and other applicable laws. Nothing in these Terms and Conditions is intended to exclude or limit any right, guarantee or remedy that a passenger may have under the Australian Consumer Law where such a right cannot legally be excluded.",
          ),
          p(
            "If there is any inconsistency between these Terms and Conditions and a mandatory requirement of applicable law, the mandatory legal requirement will prevail.",
          ),
        ],
      },
      {
        heading: "23. Acceptance of Terms",
        blocks: [
          p(
            "By completing a booking and making payment, the passenger confirms that they:",
          ),
          ul(
            "Have reviewed their passenger and travel details;",
            "Understand the applicable fare conditions;",
            "Understand the cancellation and refund rules;",
            "Accept applicable amendment and change fees;",
            "Understand their responsibility for passports, visas and travel documents; and",
            "Agree to these Flight Booking Terms and Conditions.",
          ),
        ],
      },
    ],
  },
  {
    sections: [
      {
        heading: "CANCELLATION & REFUND SUMMARY",
        blocks: [
          ul(
            "30 days or more before departure: Eligible for full refund, subject to applicable non-refundable third-party charges and any specifically disclosed fare restrictions.",
            "Less than 30 days but more than 72 hours before departure: Partial refund only. Applicable cancellation and non-refundable charges will be deducted.",
            "Within 72 hours of departure: No refund for voluntary passenger cancellation, except where required by law.",
            "No-show: No refund.",
            "Passenger-requested ticket/detail change: Amendment charges and any applicable fare difference apply.",
            "Passenger-requested flight/date change: Change/reissue charges and any fare difference apply.",
            "Airline/charter-initiated significant schedule change: Passenger-requested change fees do not apply; available remedies will depend on the circumstances and applicable law.",
          ),
        ],
      },
    ],
  },
];
