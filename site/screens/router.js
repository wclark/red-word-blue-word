const HASH_ALIASES = {
  studio: "source",
  generator: "generate",
  deck: "model",
  "how-it-works": "learn",
};

function canonicalScreenName(screenName) {
  return HASH_ALIASES[screenName] ?? screenName;
}

export function createScreenRouter(options = {}) {
  const screens = new Map(
    [...document.querySelectorAll("[data-app-screen]")].map((screen) => [screen.dataset.appScreen, screen])
  );
  const links = [...document.querySelectorAll("[data-screen-link]")];
  const defaultScreen = screens.has(options.defaultScreen) ? options.defaultScreen : screens.keys().next().value;
  let currentScreen = "";

  function screenFromHash() {
    const requested = decodeURIComponent(window.location.hash.slice(1));
    const canonical = canonicalScreenName(requested);
    return screens.has(canonical) ? canonical : defaultScreen;
  }

  function show(screenName) {
    const nextScreen = screens.has(screenName) ? screenName : defaultScreen;
    const screenChanged = Boolean(currentScreen && currentScreen !== nextScreen);
    screens.forEach((screen, name) => {
      screen.hidden = name !== nextScreen;
    });
    links.forEach((link) => {
      const active = link.dataset.screenLink === nextScreen;
      link.classList.toggle("is-active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    currentScreen = nextScreen;
    document.body.dataset.activeScreen = nextScreen;
    if (screenChanged) window.scrollTo({ top: 0, behavior: "auto" });
    options.onChange?.(nextScreen);
  }

  function syncFromHash() {
    show(screenFromHash());
  }

  function navigate(screenName) {
    const nextScreen = canonicalScreenName(screenName);
    if (!screens.has(nextScreen)) return;
    const nextHash = `#${nextScreen}`;
    if (window.location.hash === nextHash) show(nextScreen);
    else window.location.hash = nextHash;
  }

  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const screenName = decodeURIComponent(link.getAttribute("href").slice(1));
      if (!screens.has(canonicalScreenName(screenName))) return;
      event.preventDefault();
      navigate(screenName);
    });
  });

  window.addEventListener("hashchange", syncFromHash);
  syncFromHash();

  return {
    navigate,
    get currentScreen() {
      return currentScreen;
    },
  };
}
