import {
  ArrowRight,
  ArrowUpRight,
  Clock,
  EnvelopeSimple,
  HouseLine,
  InstagramLogo,
  MapPin,
  PhoneCall,
  TiktokLogo,
  WhatsappLogo,
} from "@phosphor-icons/react";
import { ButtonLink, PageShell, SectionEyebrow } from "../components.jsx";
import { images } from "../data.js";
import "./ContactPage.css";

const contactChannels = [
  {
    icon: PhoneCall,
    label: "Phone / Mobile",
    value: "+233 24 000 1027",
    subtext: "Call or message for quick inquiries & consultations",
    href: "tel:+233240001027",
    actionLabel: "Call now",
  },
  {
    icon: WhatsappLogo,
    label: "WhatsApp",
    value: "+233 24 000 1027",
    subtext: "Fastest response for questions & idea discussions",
    href: "https://wa.me/233240001027?text=Hi%20Michelle,%20I'd%20like%20to%20inquire%20about%20a%20home%20service%20tattoo.",
    actionLabel: "Chat on WhatsApp",
    isPrimary: true,
  },
  {
    icon: EnvelopeSimple,
    label: "Email",
    value: "rebeltattoo101@gmail.com",
    subtext: "Send detailed briefs, references, or booking inquiries",
    href: "mailto:rebeltattoo101@gmail.com?subject=Tattoo%20Inquiry%20—%20Rebel%20Tattoos",
    actionLabel: "Send an email",
  },
];

const socialChannels = [
  {
    name: "Instagram",
    handle: "@rebeltattoos",
    description: "Browse healed pieces, flash ideas & behind-the-scenes",
    icon: InstagramLogo,
    url: "https://instagram.com",
  },
  {
    name: "TikTok",
    handle: "@rebeltattoos",
    description: "Linework process videos & aftercare guides",
    icon: TiktokLogo,
    url: "https://tiktok.com",
  },
  {
    name: "WhatsApp Channel",
    handle: "Rebel Tattoos Updates",
    description: "New booking openings & seasonal availability",
    icon: WhatsappLogo,
    url: "https://wa.me/233240001027",
  },
];

const serviceAreas = [
  "East Legon",
  "Cantonments",
  "Airport Residential",
  "Osu & Labone",
  "Dzorwulu",
  "Spintex",
  "Ridge & Roman Ridge",
  "Greater Accra & surrounding areas",
];

export function ContactPage() {
  return (
    <PageShell>
      <div className="contact-page">
        <section className="contact-hero" aria-labelledby="contact-heading">
          <div className="contact-container contact-hero__inner">
            <div className="contact-hero__copy">
              <SectionEyebrow>Direct contact</SectionEyebrow>
              <h1 id="contact-heading">
                <span>Get in touch</span>
                <span>with <span className="contact-hero__mobile-break">Michelle.</span></span>
              </h1>
              <p>
                Have a question about placement, pricing, or home session logistics? Reach out directly by phone, WhatsApp, email, or social media.
              </p>
              <div className="contact-hero__actions">
                <ButtonLink to="/booking">Book a home session</ButtonLink>
                <a
                  className="button button--outline"
                  href="https://wa.me/233240001027"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <WhatsappLogo size={18} weight="bold" aria-hidden="true" />
                  <span>WhatsApp chat</span>
                </a>
              </div>
            </div>
            <figure className="contact-hero__media">
              <img src={images.hero} alt="Michelle, fine-line tattoo artist" />
              <figcaption>Home service only</figcaption>
            </figure>
          </div>
        </section>

        <section className="contact-main-section" aria-labelledby="contact-channels-heading">
          <div className="contact-container">
            <div className="contact-grid">
              <div className="contact-methods">
                <h2 id="contact-channels-heading" className="contact-section-title">
                  Phone &amp; Email
                </h2>
                <p className="contact-section-desc">
                  Direct channels for inquiries, quick questions, and scheduling support.
                </p>

                <div className="contact-channels-list">
                  {contactChannels.map((channel) => {
                    const Icon = channel.icon;
                    return (
                      <article
                        key={channel.label}
                        className={`contact-channel-card${channel.isPrimary ? " is-primary" : ""}`}
                      >
                        <div className="contact-channel-card__icon">
                          <Icon size={26} weight="duotone" aria-hidden="true" />
                        </div>
                        <div className="contact-channel-card__content">
                          <span className="contact-channel-card__label">{channel.label}</span>
                          <strong className="contact-channel-card__val">{channel.value}</strong>
                          <p className="contact-channel-card__sub">{channel.subtext}</p>
                        </div>
                        <a
                          className={`contact-channel-card__btn${channel.isPrimary ? " is-primary-btn" : ""}`}
                          href={channel.href}
                          target={channel.href.startsWith("http") ? "_blank" : undefined}
                          rel={channel.href.startsWith("http") ? "noopener noreferrer" : undefined}
                        >
                          <span>{channel.actionLabel}</span>
                          <ArrowUpRight size={16} weight="bold" aria-hidden="true" />
                        </a>
                      </article>
                    );
                  })}
                </div>

                <div className="contact-social-section">
                  <h2 className="contact-section-title">Social Media</h2>
                  <p className="contact-section-desc">
                    Follow Michelle’s latest linework, healed tattoos, and client stories.
                  </p>

                  <div className="contact-social-grid">
                    {socialChannels.map((social) => {
                      const Icon = social.icon;
                      return (
                        <a
                          key={social.name}
                          className="contact-social-card"
                          href={social.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <div className="contact-social-card__top">
                            <Icon size={24} weight="bold" aria-hidden="true" />
                            <ArrowUpRight size={18} weight="bold" aria-hidden="true" />
                          </div>
                          <strong>{social.name}</strong>
                          <span className="contact-social-card__handle">{social.handle}</span>
                          <p>{social.description}</p>
                        </a>
                      );
                    })}
                  </div>
                </div>
              </div>

              <aside className="contact-sidebar" aria-label="Service details">
                <div className="contact-info-panel contact-info-panel--dark">
                  <div className="contact-info-panel__header">
                    <HouseLine size={24} weight="duotone" aria-hidden="true" />
                    <h2>Home service only</h2>
                  </div>
                  <p>
                    Michelle does not operate a public studio. Every session takes place in the privacy, comfort, and convenience of your home.
                  </p>
                  <dl className="contact-info-dl">
                    <div>
                      <dt><Clock size={16} aria-hidden="true" /> Working hours</dt>
                      <dd>Mon – Sat: 9:00 AM – 6:00 PM<br /><small>(Advance booking required)</small></dd>
                    </div>
                    <div>
                      <dt><MapPin size={16} aria-hidden="true" /> Service coverage</dt>
                      <dd>Accra &amp; surrounding areas</dd>
                    </div>
                    <div>
                      <dt><EnvelopeSimple size={16} aria-hidden="true" /> Response time</dt>
                      <dd>Within 24–48 hours</dd>
                    </div>
                  </dl>
                </div>

                <div className="contact-info-panel contact-info-panel--paper">
                  <h2>Service areas in Accra</h2>
                  <p>Michelle travels to clients across:</p>
                  <ul className="contact-areas-list">
                    {serviceAreas.map((area) => (
                      <li key={area}>
                        <span className="contact-area-dot" aria-hidden="true" />
                        <span>{area}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="contact-info-panel contact-info-panel--cta">
                  <h2>Ready to start your tattoo?</h2>
                  <p>
                    Submit a detailed brief with your idea, placement, and preferred date on our booking page.
                  </p>
                  <ButtonLink to="/booking" className="contact-cta-btn">
                    <span>Go to booking form</span>
                    <ArrowRight size={16} weight="bold" aria-hidden="true" />
                  </ButtonLink>
                </div>
              </aside>
            </div>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
