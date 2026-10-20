// Small progressive enhancements. The site works without this file.
(function () {
  // Filter chips on the homepage (Allt / Þessi vika / Helgin).
  var bar = document.querySelector(".filters[hidden]");
  if (bar) {
    bar.hidden = false;
    var cards = [].slice.call(document.querySelectorAll(".card"));
    var groups = [].slice.call(document.querySelectorAll(".group"));
    bar.addEventListener("click", function (e) {
      var b = e.target.closest("[data-filter]");
      if (!b) return;
      [].forEach.call(bar.querySelectorAll(".chip"), function (c) { c.classList.toggle("is-on", c === b); });
      var f = b.getAttribute("data-filter");
      cards.forEach(function (c) {
        c.hidden = !(f === "all" || (f === "this" && c.dataset.week === "this") || (f === "helgin" && c.dataset.helgin === "1"));
      });
      groups.forEach(function (g) { g.hidden = !g.querySelector(".card:not([hidden])"); });
    });
  }
  // Until a mailing list is connected (signupAction in site.json), the form only explains itself.
  var form = document.querySelector(".signup[data-inactive]");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var s = document.getElementById("signup-status");
      if (s) s.textContent = "Skráning opnar fljótlega. Takk fyrir áhugann!";
    });
  }
})();
