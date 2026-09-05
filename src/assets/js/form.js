// Contact form: JSON POST to the Pages Function at /api/kontakt.
// The button ships disabled in the markup and is enabled only when Turnstile
// has issued a token (data-callback below) — never on the mere presence of
// the widget div, because a submit without a token is a guaranteed 400
// (review02 #16). If the Turnstile script never loads (blocked or offline),
// a visible fallback points at the phone and e-mail instead of a dead form.
(function () {
  var form = document.querySelector(".form-grid");
  if (!form) return;
  var btn = form.querySelector("button[type=submit]");
  var errEl = form.querySelector(".form-error");
  var okEl = form.querySelector(".form-success");
  var widget = form.querySelector(".cf-turnstile[data-sitekey]");
  if (!widget) return;

  // Turnstile calls these by name — the data-callback attributes sit in the
  // widget markup (form-contact.njk), because the async Turnstile script
  // reads them whenever it loads. form.js is deferred, so these definitions
  // exist before the earliest implicit render (DOMContentLoaded).
  window.norietTsReady = function () {
    btn.disabled = false;
    errEl.classList.remove("show");
  };
  window.norietTsStale = function () {
    // Expired or errored token: disable until the widget issues a fresh one.
    btn.disabled = true;
    if (window.turnstile) window.turnstile.reset();
  };

  // The script is loaded async from challenges.cloudflare.com; privacy
  // extensions and strict DNS filters block that host. If it has not turned
  // up after 8s, say so honestly instead of leaving a button that can never
  // work — the enquiry survives through the phone or e-mail.
  setTimeout(function () {
    if (window.turnstile || !btn.disabled) return;
    errEl.textContent = "Nie udało się załadować weryfikacji antyspamowej "
      + "(możliwa blokada przez rozszerzenie przeglądarki). Prosimy o kontakt "
      + "telefoniczny lub e-mail — dane obok formularza.";
    errEl.classList.add("show");
  }, 8000);

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var fd = new FormData(form);
    var token = fd.get("cf-turnstile-response") || "";
    if (!token) {
      // The button should not be enabled in this state; belt and braces.
      errEl.textContent = "Trwa weryfikacja antyspamowa — prosimy spróbować za chwilę.";
      errEl.classList.add("show");
      return;
    }
    var payload = {
      name: (fd.get("name") || "").trim(),
      email: (fd.get("email") || "").trim(),
      phone: (fd.get("phone") || "").trim(),
      message: (fd.get("message") || "").trim(),
      contact_time: fd.get("contact_time") || "",
      "cf-turnstile-response": token
    };
    errEl.classList.remove("show");
    var label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Wysyłanie…";
    fetch("/api/kontakt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) throw new Error(data.error || "Coś poszło nie tak. Prosimy spróbować ponownie.");
          form.querySelectorAll(".form-grid > div, .form-smallprint").forEach(function (el) {
            el.hidden = true;
          });
          okEl.hidden = false;
          if (window.umami) window.umami.track("formularz");
        });
      })
      .catch(function (err) {
        errEl.textContent = err.message;
        errEl.classList.add("show");
        btn.textContent = label;
        // A Turnstile token is single-use; reset and wait for the fresh
        // token's callback to re-enable the button.
        if (window.turnstile) {
          window.turnstile.reset();
        } else {
          btn.disabled = false;
        }
      });
  });
})();
