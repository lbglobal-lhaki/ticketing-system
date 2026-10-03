import {
  CARGO_TERMS_INTRO,
  CARGO_TERMS_SECTIONS,
} from "@/lib/cargo/termsContent";

export function CargoTermsText({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div className={className}>
      <p>{CARGO_TERMS_INTRO}</p>
      {CARGO_TERMS_SECTIONS.map((section, index) => (
        <section key={`${section.heading || "block"}-${index}`}>
          {section.heading ? <h3>{section.heading}</h3> : null}
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph.slice(0, 48)}>{paragraph}</p>
          ))}
          {section.bullets?.length ? (
            <ul>
              {section.bullets.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
    </div>
  );
}
