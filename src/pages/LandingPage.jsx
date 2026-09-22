import { ArrowUpRight } from "@phosphor-icons/react";
import { BookingCTA, ButtonLink, GalleryCard, PageShell, SectionEyebrow } from "../components.jsx";
import { images, portfolioItems } from "../data.js";
import { SiteLink } from "../navigation.jsx";
import "./LandingPage.css";

const process = [
  {
    number: "01",
    title: "Share your idea",
    copy: "Send placement, size, references, and preferred dates.",
  },
  {
    number: "02",
    title: "Shape the design",
    copy: "We’ll reply with direction, estimate, and timing.",
  },
  {
    number: "03",
    title: "Confirm your date",
    copy: "Approve the plan, pay the deposit, and you’re booked.",
  },
];

const aftercare = [
  { number: "01", title: "Keep it clean", copy: "Wash gently and pat dry." },
  { number: "02", title: "Moisturize lightly", copy: "Use a thin layer of balm." },
  { number: "03", title: "Let it breathe", copy: "Choose loose clothing." },
  { number: "04", title: "Skip soaking", copy: "Avoid pools, baths, saunas." },
  { number: "05", title: "Protect it", copy: "Use SPF once fully healed." },
];

export function LandingPage() {
  return (
    <PageShell>
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero__grid container">
          <div className="home-hero__copy">
            <h1 id="home-title" className="display">Fine lines.<br />Lasting stories.</h1>
            <p className="home-hero__intro">
              Thoughtful, original fine-line tattoos created with care. Private home service brought directly to you in Accra.
            </p>
            <div className="home-hero__actions">
              <ButtonLink to="/booking">Book a home session</ButtonLink>
              <ButtonLink to="/gallery" variant="outline">Explore the gallery</ButtonLink>
            </div>
          </div>

          <div className="home-hero__visual">
            <img src={images.hero} alt="Michelle, fine-line tattoo artist preparing for home sessions" />
            <div className="home-hero__stamp" aria-hidden="true">
              <span>Home service · calm · considered</span>
            </div>
          </div>
        </div>
        <div className="home-hero__mobile-note">Home service. Considered. Completely yours.</div>
      </section>

      <section id="featured-work" className="featured-work">
        <div className="container">
          <div className="featured-work__heading">
            <div>
              <SectionEyebrow>Selected work</SectionEyebrow>
              <h2 className="section-title">Made to feel like you.</h2>
            </div>
            <div>
              <p>Fine-line, botanical, celestial, and ornamental tattoos designed around your story and placement.</p>
            </div>
          </div>
          <div className="featured-work__grid">
            <GalleryCard item={portfolioItems[0]} />
            <GalleryCard item={portfolioItems[1]} />
            <GalleryCard item={portfolioItems[2]} />
          </div>
          <SiteLink className="featured-work__link" to="/gallery">View all work <ArrowUpRight size={16} weight="bold" aria-hidden="true" /></SiteLink>
        </div>
      </section>

      <section className="home-process" aria-labelledby="process-title">
        <div className="home-process__layout container">
          <div className="home-process__heading">
            <div>
              <SectionEyebrow light>From idea to appointment</SectionEyebrow>
              <h2 id="process-title" className="section-title">A clear path,<br />no guesswork.</h2>
            </div>
          </div>
          <ol className="home-process__steps">
            {process.map((step) => (
              <li key={step.number}>
                <span>{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="aftercare" aria-labelledby="aftercare-title">
        <div className="container">
          <div className="aftercare__heading">
            <div>
              <SectionEyebrow>After your appointment</SectionEyebrow>
              <h2 id="aftercare-title" className="section-title">Good healing starts here.</h2>
            </div>
          </div>
          <div className="aftercare__grid">
            {aftercare.map(({ number, title, copy }) => (
              <article key={title} className="aftercare-card">
                <span>{number}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <BookingCTA />
    </PageShell>
  );
}
