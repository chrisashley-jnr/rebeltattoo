export const navItems = [
  { label: "Home", path: "/" },
  { label: "Gallery", path: "/gallery" },
  { label: "Booking", path: "/booking" },
  { label: "Artist", path: "/artist" },
  { label: "FAQ", path: "/faq" },
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
  { question: "How do I book a home session?", answer: "Complete the booking form with your idea, placement, approximate size, and location in Accra. Michelle will reply with availability, pricing, and home session logistics." },
  { question: "Where do sessions take place?", answer: "Rebel Tattoos is exclusively a home service. Michelle travels directly to your home across Accra with all professional sterilized equipment, a portable ergonomic bed, medical-grade hygiene supplies, and lighting. There are no studio visits or walk-ins." },
  { question: "How should I prepare my space at home?", answer: "Choose a clean, comfortable, and well-lit area with enough room for a portable massage bed. Michelle brings protective surface coverings, sanitized tools, and everything required for a safe, medical-grade home session." },
  { question: "How much will my tattoo cost?", answer: "Pricing depends on size, placement, linework complexity, and session length. You’ll receive a clear upfront estimate before confirming your booking." },
  { question: "Can I bring reference images?", answer: "Absolutely. References help communicate mood and direction; your final tattoo will be drawn as an original piece drawn specifically for you." },
  { question: "What if I need to reschedule?", answer: "Please give at least 48 hours’ notice. Deposits secure your home appointment time and are applied to the final total." },
];
