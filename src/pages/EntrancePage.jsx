import { InstagramLogo } from "@phosphor-icons/react";
import { SiteLink } from "../navigation.jsx";
import "./EntrancePage.css";

export function EntrancePage() {
  return (
    <main className="entrance" aria-labelledby="entrance-title">
      <div className="entrance__shade" aria-hidden="true" />
      <h1 className="entrance__brand" id="entrance-title">
        <img className="entrance__mark" src="/assets/logo-mark.png" alt="" />
        <img className="entrance__word" src="/assets/logo-word.png" alt="" />
        <span className="entrance__sr-only">Rebel Tattoos</span>
      </h1>

      <nav className="entrance__actions" aria-label="Enter Rebel Tattoos">
        <SiteLink to="/booking" className="entrance__button entrance__button--primary">Book now</SiteLink>
        <SiteLink to="/home" className="entrance__button entrance__button--secondary">Home</SiteLink>
      </nav>

      <div className="entrance__footer">
        <p>Only homeservice offered for now</p>
        <a href="https://www.instagram.com/rebeltattoos101/" target="_blank" rel="noopener noreferrer" aria-label="Rebel Tattoos on Instagram, @rebeltattoos101">
          <InstagramLogo size={25} weight="bold" aria-hidden="true" />
          <span>rebeltattoos101</span>
        </a>
      </div>
    </main>
  );
}
