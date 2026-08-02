const HASH_ALIASES = {
  studio: "source",
  generator: "generate",
  deck: "model",
  "how-it-works": "learn",
};

export function createScreenRouter(options = {}) {
  const screens = new Map(
    [...document.querySelectorAll("[data-app-screen]")].map((screen) => [screen.dataset.appScreen, screen])
  );
  const links = [...document.querySelectorAll("[data-screen-link]")];
  const defaultScreen = screens.has(options.defaultScreen) ? options.defaultScreen : screens.keys().next().value;
  let currentScreen = "";

  function screenFromHash() {
    const requested = decodeURIComponent(window.location.hash.slice(1));
    if (screens.has(requested)) return requested;
    return HASH_ALIASES[requested] ?? defaultScreen;
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
    if (!screens.has(screenName)) return;
    const nextHash = `#${screenName}`;
    if (window.location.hash === nextHash) show(screenName);
    else window.location.hash = nextHash;
  }

  window.addEventListener("hashchange", syncFromHash);
  syncFromHash();

  return {
    navigate,
    get currentScreen() {
      return currentScreen;
    },
  };
}
