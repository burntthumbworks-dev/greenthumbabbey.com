(function () {
  "use strict";

  var yearEls = document.querySelectorAll("[data-year]");
  for (var i = 0; i < yearEls.length; i++) {
    yearEls[i].textContent = String(new Date().getFullYear());
  }

  var toggle = document.querySelector("[data-nav-toggle]");
  var nav = document.getElementById("primary-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("nav--open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  var filterBtns = document.querySelectorAll("[data-filter]");
  var items = document.querySelectorAll("[data-game]");
  if (filterBtns.length && items.length) {
    for (var f = 0; f < filterBtns.length; f++) {
      filterBtns[f].addEventListener("click", function (ev) {
        var target = ev.currentTarget.getAttribute("data-filter");
        for (var b = 0; b < filterBtns.length; b++) {
          filterBtns[b].classList.toggle("is-active", filterBtns[b] === ev.currentTarget);
        }
        for (var c = 0; c < items.length; c++) {
          var g = items[c].getAttribute("data-game");
          items[c].style.display = (target === "all" || g === target) ? "" : "none";
        }
      });
    }
  }
})();
