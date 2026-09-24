import { useEffect, useMemo, useState } from "react";
import { NavigationProvider } from "./navigation.jsx";
import { LandingPage } from "./pages/LandingPage.jsx";
import { EntrancePage } from "./pages/EntrancePage.jsx";
import { GalleryPage } from "./pages/GalleryPage.jsx";
import { BookingPage } from "./pages/BookingPage.jsx";
import { FaqPage } from "./pages/FaqPage.jsx";
import { ContactPage } from "./pages/ContactPage.jsx";
import { ArtistPage } from "./pages/ArtistPage.jsx";
import { AdminPage } from "./pages/AdminPage.jsx";

const routes = {
  "/": EntrancePage,
  "/home": LandingPage,
  "/gallery": GalleryPage,
  "/booking": BookingPage,
  "/faq": FaqPage,
  "/contact": ContactPage,
  "/artist": ArtistPage,
  "/admin": AdminPage,
};

const routeTitles = {
  "/": "Rebel Tattoos — Enter",
  "/home": "Rebel Tattoos — Fine-line tattoos · Home service only",
  "/gallery": "Gallery — Rebel Tattoos",
  "/booking": "Book a home session — Rebel Tattoos",
  "/faq": "FAQ — Rebel Tattoos",
  "/contact": "Contact & Enquiries — Rebel Tattoos",
  "/artist": "Meet Michelle — Rebel Tattoos",
  "/admin": "Bookings dashboard — Rebel Tattoos",
};

function normalizePath(pathname) {
  if (!pathname || pathname === "/index.html") return "/";
  return pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
}

export function App() {
  const [path, setPath] = useState(() => normalizePath(window.location.pathname));

  useEffect(() => {
    const onPopState = () => setPath(normalizePath(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    document.title = routeTitles[path] ?? routeTitles["/"];
  }, [path]);

  const navigation = useMemo(
    () => ({
      path,
      navigate(to) {
        const nextPath = normalizePath(to);
        if (nextPath === path) {
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
        window.history.pushState({}, "", nextPath);
        setPath(nextPath);
      },
    }),
    [path],
  );

  const Page = routes[path] ?? LandingPage;

  return (
    <NavigationProvider value={navigation}>
      <Page />
    </NavigationProvider>
  );
}
