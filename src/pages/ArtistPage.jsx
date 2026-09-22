import {
  BookingCTA,
  ButtonLink,
  GalleryCard,
  PageShell,
  SectionEyebrow,
} from "../components.jsx";
import { images, portfolioItems } from "../data.js";
import "./ArtistPage.css";

const principles = [
  {
    number: "01",
    title: "Original work",
    description: "Drawn for you.",
  },
  {
    number: "02",
    title: "Calm experience",
    description: "Judgment-free and unhurried.",
  },
  {
    number: "03",
    title: "Clear guidance",
    description: "Before and after your appointment.",
  },
];

const selectedWork = [portfolioItems[0], portfolioItems[1], portfolioItems[3]];

export function ArtistPage() {
  return (
    <PageShell>
      <div className="artist-page">
        <section className="artist-hero" aria-labelledby="artist-title">
          <div className="artist-container artist-hero__layout">
            <figure className="artist-hero__portrait">
              <img
                src={images.hero}
                alt="Michelle in her bright tattoo studio, showing a botanical upper-arm tattoo"
                width="1586"
                height="992"
                fetchPriority="high"
              />
              <figcaption className="artist-hero__portrait-label">The artist</figcaption>
            </figure>

            <div className="artist-hero__copy">
              <SectionEyebrow>Meet the maker</SectionEyebrow>
              <h1 id="artist-title">
                <span>Meet</span>
                <span>Michelle.</span>
              </h1>
              <p className="artist-hero__lead">
                Fine-line tattooing with softness, movement, and meaning.
              </p>
              <p className="artist-hero__description">
                Michelle creates custom tattoos inspired by nature, memory, and the small details people carry with them.
              </p>
              <div className="artist-hero__actions" aria-label="Artist actions">
                <ButtonLink to="/contact">Book with Michelle</ButtonLink>
                <ButtonLink to="/gallery" variant="outline">View her work</ButtonLink>
              </div>
            </div>
          </div>
        </section>

        <section className="artist-story" aria-labelledby="artist-story-title">
          <div className="artist-container">
            <div className="artist-story__intro">
              <h2 id="artist-story-title">
                <span>Softness, movement,</span>
                <span>meaning.</span>
              </h2>

              <div className="artist-story__desktop-copy">
                <p>
                  Her approach is collaborative and unhurried, balancing delicate linework with designs that sit naturally on the body.
                </p>
                <p>
                  Every appointment is designed to feel calm, welcoming, and considered—from the first conversation to aftercare.
                </p>
              </div>

              <p className="artist-story__mobile-copy">
                Michelle creates custom tattoos inspired by nature, memory, and the small details people carry with them. Her approach is collaborative and unhurried, balancing delicate linework with designs that sit naturally on the body.
              </p>
            </div>

            <div className="artist-story__details">
              <figure className="artist-story__studio">
                <img
                  src={images.studio}
                  alt="Michelle's calm, light-filled tattoo studio"
                  width="1586"
                  height="992"
                  loading="lazy"
                />
              </figure>

              <div className="artist-story__practice">
                <p className="artist-story__specialties">
                  <strong>Specialties</strong>
                  <span>Fine line · Botanical · Celestial · Ornamental · Small-scale custom work</span>
                </p>

                <div className="artist-principles" aria-label="Michelle's approach">
                  {principles.map((principle) => (
                    <article className="artist-principle" key={principle.number}>
                      <span className="artist-principle__number">{principle.number}</span>
                      <h3>{principle.title}</h3>
                      <p>{principle.description}</p>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="artist-work" aria-labelledby="artist-work-title">
          <div className="artist-container">
            <SectionEyebrow>Selected work</SectionEyebrow>
            <h2 id="artist-work-title">Drawn for the body.</h2>
            <div className="artist-work__grid">
              {selectedWork.map((item) => (
                <GalleryCard key={item.id} item={item} format="portrait" />
              ))}
            </div>
            <ButtonLink className="artist-work__button" to="/gallery" variant="outline">
              View all work
            </ButtonLink>
          </div>
        </section>

        <BookingCTA />
      </div>
    </PageShell>
  );
}
