// Applies the persisted theme before first paint (anti-flash). Kept as a
// separate ~0.2 KB head script — the one deliberate exception to "no
// render-blocking JS", because a deferred script would flash the wrong theme.
(function () {
  try {
    var t = localStorage.getItem("theme");
    if (t === "light" || t === "dark") {
      document.documentElement.setAttribute("data-theme", t);
    }
  } catch (e) {}
})();
