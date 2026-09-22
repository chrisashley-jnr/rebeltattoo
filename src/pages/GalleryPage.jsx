import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, X } from "@phosphor-icons/react";
import {
  BookingCTA,
  ButtonLink,
  GalleryCard,
  PageShell,
  SectionEyebrow,
} from "../components.jsx";
import { portfolioItems } from "../data.js";
import "./GalleryPage.css";

const filters = [
  "All",
  "Fine line",
  "Botanical",
  "Celestial",
  "Ornamental",
  "Small pieces",
];

const itemTags = {
  "sun-moon": ["Fine line", "Celestial"],
  "wildflower-study": ["Botanical"],
  "night-garden": ["Ornamental"],
  "tidal-form": ["Fine line", "Botanical"],
  "soft-orbit": ["Botanical", "Celestial"],
  "tiny-symbols": ["Small pieces", "Celestial", "Ornamental"],
};

function itemMatchesFilter(item, filter) {
  if (filter === "All") return true;
  return itemTags[item.id]?.includes(filter) || item.category === filter;
}

export function GalleryPage() {
  const [activeFilter, setActiveFilter] = useState("All");
  const [selectedId, setSelectedId] = useState(null);
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);

  const filteredItems = useMemo(
    () => portfolioItems.filter((item) => itemMatchesFilter(item, activeFilter)),
    [activeFilter],
  );

  const selectedIndex = filteredItems.findIndex((item) => item.id === selectedId);
  const selectedItem = selectedIndex >= 0 ? filteredItems[selectedIndex] : null;
  const isLightboxOpen = Boolean(selectedItem);

  function closeLightbox() {
    setSelectedId(null);
  }

  function stepLightbox(direction) {
    if (!filteredItems.length) return;
    setSelectedId((currentId) => {
      const currentIndex = filteredItems.findIndex((item) => item.id === currentId);
      const nextIndex = (currentIndex + direction + filteredItems.length) % filteredItems.length;
      return filteredItems[nextIndex].id;
    });
  }

  function selectFilter(filter) {
    setSelectedId(null);
    setActiveFilter(filter);
  }

  useEffect(() => {
    if (!isLightboxOpen) return undefined;

    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeLightbox();
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        stepLightbox(-1);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        stepLightbox(1);
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll("button:not([disabled]), a[href]")];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [isLightboxOpen, filteredItems]);

  return (
    <PageShell>
      <div className="gallery-page">
        <section className="gallery-hero" aria-labelledby="gallery-heading">
          <div className="container gallery-hero__inner">
            <div className="gallery-hero__title-block">
              <SectionEyebrow>Portfolio</SectionEyebrow>
              <h1 id="gallery-heading">Recent work,<br />made one at a time.</h1>
            </div>
            <p className="gallery-hero__lede">
              A collection of original fine-line pieces across botanical, celestial, and ornamental styles.
            </p>
            <div className="gallery-filters" role="group" aria-label="Filter portfolio by style">
              {filters.map((filter) => (
                <button
                  key={filter}
                  className={activeFilter === filter ? "is-active" : ""}
                  type="button"
                  aria-pressed={activeFilter === filter}
                  onClick={() => selectFilter(filter)}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="gallery-portfolio" aria-labelledby="portfolio-grid-heading">
          <div className="container">
            <h2 id="portfolio-grid-heading" className="gallery-page__sr-only">
              {activeFilter === "All" ? "All portfolio pieces" : `${activeFilter} portfolio pieces`}
            </h2>
            <p className="gallery-filter-status gallery-page__sr-only" aria-live="polite">
              Showing {filteredItems.length} {filteredItems.length === 1 ? "piece" : "pieces"}.
            </p>

            <div className="gallery-grid">
              {filteredItems.map((item, index) => (
                <div
                  className={`gallery-grid__item gallery-grid__item--${(index % 6) + 1}`}
                  key={item.id}
                >
                  <GalleryCard item={item} onOpen={(piece) => setSelectedId(piece.id)} />
                </div>
              ))}
            </div>

            <aside className="gallery-originality" aria-label="Original design note">
              <p>
                See something that feels like you? Bring the feeling—not a copy.<br />
                Your design will be original.
              </p>
              <ButtonLink to="/booking">Book a home session</ButtonLink>
            </aside>
          </div>
        </section>

        <BookingCTA />
      </div>

      {selectedItem && (
        <div
          className="portfolio-lightbox"
          onMouseDown={(event) => event.target === event.currentTarget && closeLightbox()}
        >
          <div
            className="portfolio-lightbox__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lightbox-title"
            aria-describedby="lightbox-details"
            ref={dialogRef}
          >
            <button
              className="portfolio-lightbox__close"
              type="button"
              aria-label="Close image viewer"
              onClick={closeLightbox}
              ref={closeButtonRef}
            >
              <X size={24} weight="bold" aria-hidden="true" />
            </button>

            <div className="portfolio-lightbox__media">
              <img src={selectedItem.image} alt={selectedItem.alt} />
            </div>

            <div className="portfolio-lightbox__caption">
              <p>{selectedItem.category}</p>
              <h2 id="lightbox-title">{selectedItem.title}</h2>
              <span id="lightbox-details">
                {selectedItem.category} · {selectedItem.placement} · {selectedIndex + 1} of {filteredItems.length}
              </span>
            </div>

            {filteredItems.length > 1 && (
              <div className="portfolio-lightbox__controls" aria-label="Portfolio image controls">
                <button type="button" onClick={() => stepLightbox(-1)} aria-label="View previous piece">
                  <ArrowLeft size={22} weight="bold" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => stepLightbox(1)} aria-label="View next piece">
                  <ArrowRight size={22} weight="bold" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}
