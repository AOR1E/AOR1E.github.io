(function () {
  "use strict";

  var contentSelector = ".content";
  var sidebarSelector = "#page-sidebar-context";
  var activeRequest = null;
  var homeLink = document.querySelector(".masthead-title a");
  var homePath = homeLink ? new URL(homeLink.href, window.location.href).pathname : "/";

  if (!window.fetch || !window.DOMParser || !window.history || !document.querySelector(contentSelector)) {
    return;
  }

  window.history.scrollRestoration = "manual";
  window.history.replaceState(
    Object.assign({}, window.history.state, { persistentNavigation: true, scrollY: window.scrollY }),
    "",
    window.location.href
  );

  function isPageLink(link, event) {
    if (!link || event.defaultPrevented || event.button !== 0) return false;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
    if (link.target || link.hasAttribute("download")) return false;
    if ((link.getAttribute("rel") || "").split(/\s+/).indexOf("external") !== -1) return false;

    var url;
    try {
      url = new URL(link.href, window.location.href);
    } catch (error) {
      return false;
    }

    if (url.origin !== window.location.origin) return false;
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;

    var sameDocument = url.pathname === window.location.pathname && url.search === window.location.search;
    if (sameDocument && url.hash) return false;

    var lastSegment = url.pathname.split("/").pop();
    if (lastSegment && lastSegment.indexOf(".") !== -1 && !/\.html?$/.test(lastSegment)) return false;

    return true;
  }

  function copyHeadValue(nextDocument, selector, attribute) {
    var current = document.head.querySelector(selector);
    var incoming = nextDocument.head.querySelector(selector);
    if (!current || !incoming) return;
    if (attribute) {
      current.setAttribute(attribute, incoming.getAttribute(attribute) || "");
    } else {
      current.textContent = incoming.textContent;
    }
  }

  function runScripts(container) {
    var scripts = Array.prototype.slice.call(container.querySelectorAll("script"));
    return scripts.reduce(function (chain, oldScript) {
      return chain.then(function () {
        return new Promise(function (resolve) {
          var script = document.createElement("script");
          Array.prototype.forEach.call(oldScript.attributes, function (attribute) {
            script.setAttribute(attribute.name, attribute.value);
          });

          if (oldScript.src) {
            script.addEventListener("load", resolve, { once: true });
            script.addEventListener("error", resolve, { once: true });
          } else {
            script.textContent = oldScript.textContent;
          }

          oldScript.replaceWith(script);
          if (!oldScript.src) resolve();
        });
      });
    }, Promise.resolve());
  }

  function updateScroll(url, restoredScroll) {
    window.requestAnimationFrame(function () {
      if (typeof restoredScroll === "number") {
        window.scrollTo(0, restoredScroll);
      } else if (url.hash) {
        var target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
        if (target) target.scrollIntoView();
      } else {
        var forceContent = sessionStorage.getItem("forceCheckScroll") === "true";
        var showContentFirst = window.matchMedia("(max-width: 48rem)").matches &&
          (forceContent || url.pathname !== homePath);
        window.scrollTo(0, showContentFirst ? window.innerHeight : 0);
      }
      sessionStorage.removeItem("forceCheckScroll");
    });
  }

  async function navigate(url, options) {
    options = options || {};

    if (activeRequest) activeRequest.abort();
    var controller = new AbortController();
    activeRequest = controller;

    var currentContent = document.querySelector(contentSelector);
    currentContent.setAttribute("aria-busy", "true");

    try {
      var response = await fetch(url.href, {
        credentials: "same-origin",
        headers: { "X-Requested-With": "persistent-navigation" },
        signal: controller.signal
      });
      if (!response.ok) throw new Error("Page request failed");

      var html = await response.text();
      var nextDocument = new DOMParser().parseFromString(html, "text/html");
      var nextContent = nextDocument.querySelector(contentSelector);
      var nextSidebar = nextDocument.querySelector(sidebarSelector);
      if (!nextContent || !nextSidebar) throw new Error("Page regions missing");

      var importedContent = document.importNode(nextContent, true);
      var importedSidebar = document.importNode(nextSidebar, true);
      currentContent.replaceWith(importedContent);
      document.querySelector(sidebarSelector).replaceWith(importedSidebar);

      document.title = nextDocument.title;
      document.documentElement.lang = nextDocument.documentElement.lang || document.documentElement.lang;
      copyHeadValue(nextDocument, 'meta[name="description"]', "content");
      copyHeadValue(nextDocument, 'link[rel="canonical"]', "href");

      if (options.push !== false) {
        window.history.replaceState(
          Object.assign({}, window.history.state, { persistentNavigation: true, scrollY: options.previousScroll }),
          "",
          window.location.href
        );
        window.history.pushState(
          { persistentNavigation: true, scrollY: 0 },
          "",
          url.href
        );
      }

      updateScroll(url, options.restoredScroll);
      await runScripts(importedContent);
      document.dispatchEvent(new CustomEvent("site:navigation-complete", { detail: { url: url.href } }));
    } catch (error) {
      if (error.name === "AbortError") return;
      if (options.push === false) {
        window.location.reload();
      } else {
        window.location.assign(url.href);
      }
    } finally {
      if (activeRequest === controller) activeRequest = null;
      var latestContent = document.querySelector(contentSelector);
      if (latestContent) latestContent.removeAttribute("aria-busy");
    }
  }

  document.addEventListener("click", function (event) {
    var link = event.target.closest("a[href]");
    if (!isPageLink(link, event)) return;

    event.preventDefault();
    var url = new URL(link.href, window.location.href);
    navigate(url, { push: true, previousScroll: window.scrollY });
  });

  window.addEventListener("popstate", function (event) {
    var url = new URL(window.location.href);
    navigate(url, {
      push: false,
      restoredScroll: event.state && typeof event.state.scrollY === "number" ? event.state.scrollY : 0
    });
  });
})();
