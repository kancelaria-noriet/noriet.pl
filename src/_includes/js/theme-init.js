// Runs inline in <head>, before first paint, on purpose (the one sanctioned
// inline script): the persisted theme (anti-flash) and the progressive
// enhancement flag. The flag must land before the first paint: when the
// deferred nav.js set it, the mobile nav painted expanded and then collapsed,
// a 0.28 layout shift on most pages (review03 #23).
(function () {
  document.documentElement.classList.remove("no-js");
  document.documentElement.classList.add("js");
  try {
    var t = localStorage.getItem("theme");
    if (t === "light" || t === "dark") {
      document.documentElement.setAttribute("data-theme", t);
    }
  } catch (e) {}
})();
