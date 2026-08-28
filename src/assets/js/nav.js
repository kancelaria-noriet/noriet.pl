// Progressive enhancement only: without JS the menu stays fully visible.
document.documentElement.classList.remove("no-js");
document.documentElement.classList.add("js");

var toggle = document.querySelector(".nav-toggle");
var nav = document.getElementById("site-nav");

if (toggle && nav) {
  toggle.addEventListener("click", function () {
    var open = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!open));
    nav.classList.toggle("site-nav--open", !open);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      toggle.setAttribute("aria-expanded", "false");
      nav.classList.remove("site-nav--open");
      toggle.focus();
    }
  });
}

// Dark/light toggle: two-state override of the system preference, persisted.
var themeBtn = document.querySelector(".theme-toggle");
if (themeBtn) {
  themeBtn.addEventListener("click", function () {
    var sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var cur = document.documentElement.getAttribute("data-theme") || (sysDark ? "dark" : "light");
    var next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("theme", next); } catch (e) {}
  });
}

// Blog categories: shipped open so no-JS visitors and crawlers get the links.
// Below the two-column breakpoint the rail stacks above the article list, where
// an expanded 600px card would bury the articles, so collapse it there.
var catCard = document.querySelector(".cat-card");
if (catCard) {
  var narrow = window.matchMedia("(max-width: 63.99rem)");
  var syncCatCard = function (mq) { catCard.open = !mq.matches; };
  syncCatCard(narrow);
  narrow.addEventListener("change", syncCatCard);
}
