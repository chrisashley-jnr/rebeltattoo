export const navItems = [
  { label: "Home", path: "/" },
  { label: "Gallery", path: "/gallery" },
  { label: "FAQ", path: "/faq" },
  { label: "Artist", path: "/artist" },
  { label: "Contact", path: "/contact" },
];

export const images = {
  hero: "/assets/hero-botanical-portrait.png",
  studio: "/assets/studio-interior.png",
  sunMoon: "/assets/sun-moon-forearm.png",
  botanicalBack: "/assets/botanical-upper-back.png",
  tiger: "/assets/tattoo-blackwork-tiger.png",
  heron: "/assets/tattoo-heron-botanical.png",
};

export const portfolioItems = [
  { id: "sun-moon", title: "Sun / Moon", category: "Fine line", placement: "Forearm", image: images.sunMoon, alt: "Healed fine-line sun and moon tattoo on a forearm", format: "portrait" },
  { id: "wildflower-study", title: "Wildflower Study", category: "Botanical", placement: "Shoulder", image: images.botanicalBack, alt: "Healed botanical linework tattoo across the upper back and shoulder", format: "landscape" },
  { id: "night-garden", title: "Night Garden", category: "Blackwork", placement: "Upper arm", image: images.tiger, alt: "Healed blackwork tiger and botanical upper-arm tattoo", format: "portrait" },
  { id: "tidal-form", title: "Tidal Form", category: "Fine line", placement: "Calf", image: images.heron, alt: "Healed fine-line heron and botanical calf tattoo", format: "landscape" },
  { id: "soft-orbit", title: "Soft Orbit", category: "Botanical", placement: "Back", image: images.botanicalBack, alt: "Botanical tattoo following the natural line of the shoulder", format: "portrait" },
  { id: "tiny-symbols", title: "Tiny Symbols", category: "Small pieces", placement: "Forearm", image: images.sunMoon, alt: "Delicate celestial symbols tattooed on a forearm", format: "portrait" },
];

export const faqs = [
  { question: "How do I book?", answer: "Complete the booking form with your idea, placement, approximate size, and reference images. You’ll receive availability and next steps by email." },
  { question: "Do you accept walk-ins?", answer: "The studio is appointment-only so every session has enough time, privacy, and preparation." },
  { question: "How much will my tattoo cost?", answer: "Pricing depends on size, placement, detail, and session length. You’ll receive a clear estimate before confirming." },
  { question: "Can I bring reference images?", answer: "Absolutely. References help communicate mood and direction; your final tattoo will be drawn as an original piece." },
  { question: "How should I prepare?", answer: "Eat a full meal, stay hydrated, wear comfortable clothing, and avoid alcohol for 24 hours before your appointment." },
  { question: "What if I need to reschedule?", answer: "Please give at least 48 hours’ notice. Deposits secure your appointment and are applied to the final total." },
];
