(function () {
  const config = window.PORTFOLIO_TRACKING || {};

  if (!config.enabled || !config.endpoint) {
    return;
  }

  const endpoint = String(config.endpoint).trim();
  const siteName = String(config.siteName || window.location.hostname).trim();
  const trackableSelector = [
    ".site-logo-link",
    ".nav-link",
    ".project-link",
    ".note-link",
    ".book-link",
    ".back-link",
    ".genre-tag",
    ".book-header"
  ].join(",");

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "unknown";
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function getAnchorHref(element) {
    if (!(element instanceof HTMLAnchorElement)) {
      return "";
    }

    const rawHref = element.getAttribute("href");
    if (!rawHref || rawHref.startsWith("#")) {
      return rawHref || "";
    }

    try {
      return new URL(rawHref, window.location.href).href;
    } catch {
      return rawHref;
    }
  }

  function isExternalHref(href) {
    if (!href) {
      return false;
    }

    try {
      return new URL(href, window.location.href).origin !== window.location.origin;
    } catch {
      return false;
    }
  }

  function getNearestText(element, ancestorSelector, targetSelector) {
    const ancestor = element.closest(ancestorSelector);
    const target = ancestor ? ancestor.querySelector(targetSelector) : null;
    return cleanText(target ? target.textContent : "");
  }

  function deriveCategory(element) {
    if (element.classList.contains("site-logo-link")) return "logo";
    if (element.classList.contains("nav-link")) return "nav";
    if (element.classList.contains("project-link")) return "project-link";
    if (element.classList.contains("note-link")) return "note-link";
    if (element.classList.contains("book-link")) return "book-link";
    if (element.classList.contains("back-link")) return "back-link";
    if (element.classList.contains("book-header")) return "book-toggle";
    if (element.classList.contains("genre-tag")) return "filter";
    return "click";
  }

  function deriveId(element) {
    if (element.dataset.trackId) {
      return element.dataset.trackId;
    }

    if (element.classList.contains("site-logo-link")) {
      return "logo_home";
    }

    if (element.classList.contains("nav-link")) {
      return "nav_" + slugify(element.dataset.page || element.textContent);
    }

    if (element.classList.contains("project-link")) {
      const title = getNearestText(element, ".project-card", ".project-title");
      const action = cleanText(element.textContent);
      return "project_" + slugify(title) + "_" + slugify(action);
    }

    if (element.classList.contains("note-link")) {
      return "note_" + slugify(element.textContent);
    }

    if (element.classList.contains("book-link")) {
      const title = getNearestText(element, ".book-item", ".book-title");
      return "book_" + slugify(title) + "_" + slugify(element.textContent);
    }

    if (element.classList.contains("back-link")) {
      return "back_" + slugify(window.location.pathname);
    }

    if (element.classList.contains("book-header")) {
      const title = getNearestText(element, ".book-item", ".book-title");
      return "book_toggle_" + slugify(title);
    }

    if (element.classList.contains("genre-tag")) {
      const filter = cleanText(element.dataset.filter || element.textContent);
      const title = getNearestText(element, ".project-card", ".project-title");

      if (element.closest(".project-filter-strip")) {
        return "project_filter_" + slugify(filter);
      }

      if (title) {
        return "project_tag_" + slugify(title) + "_" + slugify(filter);
      }

      return "tag_" + slugify(filter);
    }

    return "click_" + slugify(element.textContent || element.tagName);
  }

  function deriveLabel(element) {
    if (element.classList.contains("book-header")) {
      return getNearestText(element, ".book-item", ".book-title");
    }

    return cleanText(
      element.getAttribute("aria-label") ||
      element.dataset.page ||
      element.dataset.filter ||
      element.textContent
    );
  }

  function sendEvent(payload) {
    const body = JSON.stringify(payload);

    if (navigator.sendBeacon) {
      const accepted = navigator.sendBeacon(
        endpoint,
        new Blob([body], { type: "application/json" })
      );

      if (accepted) {
        return;
      }
    }

    fetch(endpoint, {
      method: "POST",
      mode: "cors",
      keepalive: true,
      headers: {
        "Content-Type": "application/json"
      },
      body
    }).catch(() => {});
  }

  document.addEventListener("click", (event) => {
    const element = event.target.closest(trackableSelector);

    if (!element) {
      return;
    }

    const href = getAnchorHref(element);
    const payload = {
      site: siteName,
      event: "click",
      id: deriveId(element),
      category: deriveCategory(element),
      label: deriveLabel(element),
      page: window.location.pathname,
      href,
      external: isExternalHref(href),
      target: element instanceof HTMLAnchorElement ? (element.getAttribute("target") || "") : "",
      timestamp: new Date().toISOString()
    };

    sendEvent(payload);
  }, { capture: true });
})();
