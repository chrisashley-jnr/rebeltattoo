import { useState } from "react";
import { Minus, Plus } from "@phosphor-icons/react";
import {
  BookingCTA,
  ButtonLink,
  PageShell,
  SectionEyebrow,
} from "../components.jsx";
import { faqs } from "../data.js";
import "./FaqPage.css";

function FaqItem({ faq, index, open, onToggle }) {
  const triggerId = `faq-trigger-${index}`;
  const panelId = `faq-panel-${index}`;

  return (
    <article className={`faq-item${open ? " is-open" : ""}`}>
      <h3>
        <button
          id={triggerId}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <span>{faq.question}</span>
          {open ? (
            <Minus size={21} weight="bold" aria-hidden="true" />
          ) : (
            <Plus size={21} weight="bold" aria-hidden="true" />
          )}
        </button>
      </h3>
      {open && (
        <div
          className="faq-item__answer"
          id={panelId}
          role="region"
          aria-labelledby={triggerId}
        >
          <p>{faq.answer}</p>
        </div>
      )}
    </article>
  );
}

export function FaqPage() {
  const [openIndex, setOpenIndex] = useState(0);

  function toggleFaq(index) {
    setOpenIndex((current) => (current === index ? -1 : index));
  }

  return (
    <PageShell>
      <div className="faq-page">
        <section className="faq-hero" aria-labelledby="faq-heading">
          <div className="container faq-hero__inner">
            <div className="faq-hero__title-block">
              <SectionEyebrow>Good to know</SectionEyebrow>
              <h1 id="faq-heading">Questions before<br />we begin?</h1>
            </div>
            <p>Here’s what to expect from booking through healing.</p>
          </div>
        </section>

        <section className="faq-content" aria-label="Frequently asked questions">
          <div className="container faq-content__inner">
            <aside className="faq-index" aria-label="FAQ topics">
              <span>01&nbsp;&nbsp;Booking</span>
              <span>02&nbsp;&nbsp;Your appointment</span>
              <span>03&nbsp;&nbsp;Aftercare</span>
            </aside>

            <div className="faq-list">
              {faqs.map((faq, index) => (
                <FaqItem
                  faq={faq}
                  index={index}
                  key={faq.question}
                  open={openIndex === index}
                  onToggle={() => toggleFaq(index)}
                />
              ))}
            </div>

            <aside className="faq-contact-card">
              <div>
                <h2>Still unsure?</h2>
                <p>Send a note and we’ll help you decide what comes next.</p>
              </div>
              <ButtonLink to="/contact" variant="outline">Contact Michelle</ButtonLink>
            </aside>
          </div>
        </section>

        <BookingCTA />
      </div>
    </PageShell>
  );
}
