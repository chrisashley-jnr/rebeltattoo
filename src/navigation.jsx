import { createContext, useContext } from "react";

const NavigationContext = createContext({ path: "/", navigate: () => {} });

export function NavigationProvider({ value, children }) {
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useSiteNavigation() {
  return useContext(NavigationContext);
}

export function SiteLink({ to, onClick, children, ...props }) {
  const { navigate } = useSiteNavigation();

  function handleClick(event) {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) return;
    event.preventDefault();
    navigate(to);
  }

  return <a href={to} onClick={handleClick} {...props}>{children}</a>;
}
