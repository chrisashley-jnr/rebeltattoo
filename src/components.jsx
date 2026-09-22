import { useEffect, useState } from "react";
import { ArrowUpRight, Plus, X } from "@phosphor-icons/react";
import { navItems } from "./data.js";
import { SiteLink, useSiteNavigation } from "./navigation.jsx";

export function Brand({ inverse = false, footer = false }) {
  return (
    <span className={`brand${inverse ? " brand--inverse" : ""}${footer ? " brand--footer" : ""}`} aria-label="Rebel Tattoos">
      <img className="brand__mark" src="/assets/logo-mark.png" alt="" />
      <img className="brand__word" src="/assets/logo-word.png" alt="" />
    </span>
  );
}

export function ButtonLink({ to, variant = "primary", className = "", children }) {
  return <SiteLink className={`button button--${variant} ${className}`} to={to}>{children}</SiteLink>;
}

export function Header() {
  const { path } = useSiteNavigation();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [path]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => event.key === "Escape" && setOpen(false);
    document.body.classList.add("menu-open");
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("menu-open");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <header className="site-header">
      <div className="site-header__inner container">
        <SiteLink to="/" className="site-header__brand" aria-label="Rebel Tattoos home"><Brand /></SiteLink>
        <nav className="desktop-nav" aria-label="Primary navigation">
          {navItems.map((item) => (
            <SiteLink key={item.path} to={item.path} className={path === item.path ? "is-active" : ""} aria-current={path === item.path ? "page" : undefined}>
              {item.label}
            </SiteLink>
          ))}
        </nav>
        <ButtonLink className="site-header__cta" to="/booking">Book a home session</ButtonLink>
        <button className="menu-toggle" type="button" aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? "Close navigation" : "Open navigation"} onClick={() => setOpen((value) => !value)}>
          <span>{open ? "Close" : "Menu"}</span>
          {open ? <X size={18} weight="bold" /> : <Plus size={18} weight="bold" />}
        </button>
      </div>
      <div id="mobile-menu" className={`mobile-menu${open ? " is-open" : ""}`} aria-hidden={!open}>
        <nav aria-label="Mobile navigation">
          {navItems.map((item) => (
            <SiteLink key={item.path} to={item.path} className={path === item.path ? "is-active" : ""} aria-current={path === item.path ? "page" : undefined}>{item.label}</SiteLink>
          ))}
        </nav>
        <ButtonLink to="/booking">Book a home session</ButtonLink>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container site-footer__grid">
        <div>
          <Brand inverse footer />
          <p>Fine-line tattooing with softness, movement, and meaning.</p>
        </div>
        <div>
          <nav className="site-footer__nav" aria-label="Footer navigation">
            {navItems.map((item) => <SiteLink key={item.path} to={item.path}>{item.label}</SiteLink>)}
          </nav>
          <p className="site-footer__meta">Home service only · By appointment · Replies in 2–3 business days</p>
        </div>
      </div>
      <div className="container site-footer__bottom">© Rebel Tattoos</div>
    </footer>
  );
}

export function PageShell({ children }) {
  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Header />
      <main id="main-content" tabIndex="-1">{children}</main>
      <Footer />
    </div>
  );
}

export function BookingCTA({ title = "Let’s make something personal." }) {
  return (
    <section className="booking-cta-section" aria-labelledby="booking-cta-title">
      <div className="booking-cta container">
        <span className="booking-cta__accent" aria-hidden="true" />
        <div className="booking-cta__copy">
          <p className="eyebrow eyebrow--light">Your idea, your ink</p>
          <h2 id="booking-cta-title">{title}</h2>
          <p>Tell us what you’re imagining. Michelle will reply with timing, pricing, and home session availability.</p>
        </div>
        <ButtonLink variant="paper" to="/booking">Book a home session</ButtonLink>
      </div>
    </section>
  );
}

export function GalleryCard({ item, format = item.format, onOpen }) {
  const content = (
    <>
      <span className="gallery-card__media">
        <img src={item.image} alt={item.alt} />
        <span className="gallery-card__hover">View piece</span>
      </span>
      <span className="gallery-card__caption">
        <span><strong>{item.title}</strong><small>{item.category} · {item.placement}</small></span>
        <ArrowUpRight size={20} weight="bold" aria-hidden="true" />
      </span>
    </>
  );

  if (onOpen) return <button className={`gallery-card gallery-card--${format}`} type="button" onClick={() => onOpen(item)}>{content}</button>;
  return <SiteLink className={`gallery-card gallery-card--${format}`} to="/gallery">{content}</SiteLink>;
}

export function SectionEyebrow({ children, light = false }) {
  return <p className={`eyebrow${light ? " eyebrow--light" : ""}`}>{children}</p>;
}
