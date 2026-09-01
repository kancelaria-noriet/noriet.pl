// Contact form: JSON POST to the Pages Function at /api/kontakt.
// The button ships disabled in the markup. It is enabled here only when
// JavaScript runs AND the Turnstile site key is configured (the form cannot
// pass the anti-spam check otherwise, so it stays disabled rather than
// failing on submit).
(function () {
  var form = document.querySelector(".form-grid");
  if (!form) return;
  var btn = form.querySelector("button[type=submit]");
  var errEl = form.querySelector(".form-error");
  var okEl = form.querySelector(".form-success");
  var hasTurnstile = !!form.querySelector(".cf-turnstile[data-sitekey]");
  if (!hasTurnstile) return;
  btn.disabled = false;

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var fd = new FormData(form);
    var payload = {
      name: (fd.get("name") || "").trim(),
      email: (fd.get("email") || "").trim(),
      phone: (fd.get("phone") || "").trim(),
      message: (fd.get("message") || "").trim(),
      contact_time: fd.get("contact_time") || "",
      "cf-turnstile-response": fd.get("cf-turnstile-response") || ""
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
        btn.disabled = false;
        btn.textContent = label;
        // A Turnstile token is single-use; without a reset the retry fails too.
        if (window.turnstile) window.turnstile.reset();
      });
  });
})();
