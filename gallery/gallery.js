/* Design Inspiration Gallery behaviour (loaded after adhd.js).
 * Cards are drawn from gallery-data.json (built by build-gallery.py), in
 * batches as you scroll, grouped under sticky style headers.
 * 1. Browse: style chips, palette-family chips, text search (title, style,
 *    concept, mood, use, colour names) and "surprise me". Clicking a mood or
 *    best-for tag on a card searches for it.
 * 2. Theme follows the design: hovering (or keyboard-focusing) a card switches
 *    the whole page, lava included, to that design's theme; leaving eases back
 *    to the neutral "gallery" theme. Touch screens have no hover, so the card
 *    nearest the middle of the screen (or the one just tapped) sets it.
 * 3. Lightbox: larger image in a modal <dialog>; Esc closes, arrows move
 *    through every image in the current results, focus returns to the card.
 */
(function () {
  "use strict";
  var NEUTRAL = "gallery", BATCH = 10;
  var adhd = window.ADHD || { setTheme: function () {}, themes: {}, addThemes: function () {} };
  var mm = function (q) { return window.matchMedia && window.matchMedia(q).matches; };
  var touchMode = mm("(hover: none)"), reduceMotion = mm("(prefers-reduced-motion: reduce)");
  var results = document.querySelector(".results"), moreBtn = document.querySelector(".more");
  var statusText = document.querySelector(".status-text"), clearBtn = document.querySelector(".clear-filters");
  var search = document.querySelector(".search-input");
  var dlg = document.querySelector(".lightbox");
  var designs = [], byKey = {}, filtered = [], rendered = 0, lastGroup = null;
  var state = { style: "", family: "", q: "" };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* ---------- Theme follows the design ---------- */
  var active = null, leaveTimer = 0, holdUntil = 0;
  function activate(card) {
    clearTimeout(leaveTimer);
    if (card === active) return;
    if (active) active.classList.remove("is-active");
    active = card;
    if (card) card.classList.add("is-active");
    var k = card && card.getAttribute("data-design");
    adhd.setTheme(k && adhd.themes[k] ? k : NEUTRAL);
  }
  // a short grace period, so sliding from card to card skips the neutral theme
  function release(card) {
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(function () { if (active === card && !dlg.open) activate(null); }, 160);
  }
  var isMouse = function (e) { return e.pointerType === "mouse" || e.pointerType === "pen"; };
  // delegated on the results, so 150 cards cost one set of listeners
  results.addEventListener("pointerover", function (e) {
    var c = e.target.closest(".design");
    // right after a jump (surprise me), cards sliding under a resting pointer don't steal the theme
    if (c && isMouse(e) && Date.now() > holdUntil) activate(c);
  });
  results.addEventListener("pointerout", function (e) {
    var c = e.target.closest(".design");
    if (c && isMouse(e) && !c.contains(e.relatedTarget)) release(c);
  });
  results.addEventListener("focusin", function (e) { var c = e.target.closest(".design"); if (c) activate(c); });
  results.addEventListener("focusout", function (e) {
    var c = e.target.closest(".design");
    if (c && !c.contains(e.relatedTarget)) release(c);
  });
  results.addEventListener("pointerdown", function (e) {
    var c = e.target.closest(".design");
    if (c && e.pointerType === "touch") activate(c);
  }, { passive: true });

  // touch: the card crossing a thin band through the middle of the viewport
  var bandIO = null, inBand = [];
  if (touchMode && "IntersectionObserver" in window) {
    bandIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var i = inBand.indexOf(en.target);
        if (en.isIntersecting && i < 0) inBand.push(en.target);
        else if (!en.isIntersecting && i >= 0) inBand.splice(i, 1);
      });
      if (!dlg.open) activate(inBand.filter(function (c) { return c.isConnected; })[0] || null);
    }, { rootMargin: "-46% 0px -46% 0px", threshold: 0 });
  }

  /* ---------- Cards ---------- */
  function shotButton(d, n) {
    var im = d.i[n], label = n ? "landing page" : "app UI";
    var ar = im[4] / im[5];
    var b = el("button", "shot");
    b.type = "button";
    b.style.setProperty("--ar", ar.toFixed(4));
    b.setAttribute("data-n", n);
    b.setAttribute("aria-label", "Open larger: " + d.t + ", " + label);
    var img = el("img");
    var other = d.i[1 - n], share = ar / (ar + other[4] / other[5]);
    img.sizes = "(max-width: 820px) 92vw, " + Math.round(1000 * share) + "px";
    img.srcset = "img/" + im[0] + " " + im[1] + "w, img/" + im[3] + " " + im[4] + "w";
    img.src = "img/" + im[0];
    img.width = im[1]; img.height = im[2];
    img.alt = d.t + ": AI-generated " + label + " exploration for the concept " + d.c;
    img.loading = "lazy"; img.decoding = "async";
    b.appendChild(img);
    b.appendChild(el("span", "shot-label", label));
    return b;
  }
  function factBlock(dl, term, dim, content) {
    var w = el("div"), dt = el("dt", null, term);
    if (dim) { dt.appendChild(document.createTextNode(" ")); dt.appendChild(el("span", "dim", dim)); }
    var dd = el("dd");
    content.forEach(function (c) { dd.appendChild(c); });
    w.appendChild(dt); w.appendChild(dd); dl.appendChild(w);
  }
  function tagList(items) {
    var ul = el("ul", "tags");
    items.forEach(function (t) {
      var li = el("li"), b = el("button", "tag", t);
      b.type = "button";
      b.setAttribute("data-tag", t.toLowerCase());
      b.setAttribute("aria-pressed", state.q === t.toLowerCase() ? "true" : "false");
      li.appendChild(b); ul.appendChild(li);
    });
    return ul;
  }
  function card(d) {
    var a = el("article", "design glass");
    a.id = d.k;
    a.setAttribute("data-design", d.k);
    a.setAttribute("aria-labelledby", d.k + "-title");
    var shots = el("div", "design-shots");
    shots.appendChild(shotButton(d, 0)); shots.appendChild(shotButton(d, 1));
    a.appendChild(shots);
    var copy = el("div", "design-copy"), main = el("div", "design-main");
    main.appendChild(el("p", "meta", d.g.toLowerCase() + " · " + d.s.toLowerCase()));
    var h = el("h3", null, d.t); h.id = d.k + "-title"; main.appendChild(h);
    var concept = el("p", "concept");
    concept.appendChild(el("span", "k", "concept"));
    concept.appendChild(document.createTextNode(" " + d.c));
    main.appendChild(concept);
    main.appendChild(el("p", "desc", d.d));
    copy.appendChild(main);
    var dl = el("dl", "design-facts"), pal = [];
    if (d.p.length) {
      var ul = el("ul", "swatches");
      d.p.forEach(function (c) {
        var li = el("li"), sw = el("span", "chip-sw");
        sw.style.background = c;
        li.appendChild(sw); li.appendChild(el("code", null, c)); ul.appendChild(li);
      });
      pal.push(ul);
    }
    if (d.n.length) pal.push(el("p", "named", d.n.join(" · ")));
    if (pal.length) factBlock(dl, "palette", d.p.length ? "(sampled from the artwork)" : "(named)", pal);
    if (d.y) factBlock(dl, "typography", null, [document.createTextNode(d.y)]);
    if (d.m.length) factBlock(dl, "mood", null, [tagList(d.m)]);
    if (d.b.length) factBlock(dl, "best for", null, [tagList(d.b)]);
    copy.appendChild(dl);
    a.appendChild(copy);
    return a;
  }
  function groupFor(d) {
    if (lastGroup && lastGroup.name === d.g) return lastGroup;
    var sec = el("section", "style-group");
    var id = "style-" + d.g.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    var head = el("h2", "section-title style-head");
    head.id = id;
    head.appendChild(el("span", "hash", "#"));
    head.appendChild(document.createTextNode(" " + d.g.toLowerCase() + " "));
    var total = filtered.filter(function (x) { return x.g === d.g; }).length;
    head.appendChild(el("span", "count", total + (total === 1 ? " design" : " designs")));
    sec.setAttribute("aria-labelledby", id);
    sec.appendChild(head);
    results.appendChild(sec);
    return (lastGroup = { name: d.g, el: sec });
  }
  function renderMore(upTo) {
    var end = Math.min(filtered.length, Math.max(upTo == null ? 0 : upTo + 1, rendered + BATCH));
    for (; rendered < end; rendered++) {
      var d = filtered[rendered], c = card(d);
      groupFor(d).el.appendChild(c);
      if (bandIO) bandIO.observe(c);
    }
    var left = filtered.length - rendered;
    moreBtn.hidden = left <= 0;
    moreBtn.textContent = "show more · " + left + " left";
  }
  // keep adding batches as the end of the list comes near
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting && rendered < filtered.length) renderMore();
    }, { rootMargin: "0px 0px 1400px 0px" }).observe(moreBtn);
  }
  moreBtn.addEventListener("click", function () {
    var first = rendered;
    renderMore();
    var c = filtered[first] && document.getElementById(filtered[first].k);
    if (c) c.querySelector(".shot").focus({ preventScroll: true });
  });

  /* ---------- Browse: filters + search ---------- */
  function haystack(d) {
    return (d.h = d.h || [d.t, d.g, d.s, d.c, d.y, d.f || ""].concat(d.m, d.b, d.n).join(" | ").toLowerCase());
  }
  function hasTag(d, t) { return d.m.concat(d.b).some(function (x) { return x.toLowerCase() === t; }); }
  function apply() {
    var words = state.q.split(/\s+/).filter(Boolean);
    // a query that is exactly a tag (clicked on a card) matches that tag only
    var exactTag = state.q && designs.some(function (d) { return hasTag(d, state.q); });
    filtered = designs.filter(function (d) {
      if (state.style && d.g !== state.style) return false;
      if (state.family && d.f !== state.family) return false;
      if (exactTag) return hasTag(d, state.q);
      var h = haystack(d);
      return words.every(function (w) { return h.indexOf(w) >= 0; });
    });
    results.textContent = "";
    rendered = 0; lastGroup = null; inBand = [];
    if (active && !active.isConnected) activate(null);
    renderMore();
    var bits = [];
    if (state.style) bits.push(state.style);
    if (state.family) bits.push(state.family === "neon" ? "neon & bold palettes" : state.family + " palettes");
    if (state.q) bits.push("“" + state.q + "”");
    statusText.textContent = filtered.length
      ? filtered.length + (filtered.length === 1 ? " design" : " designs") + (bits.length ? " · " + bits.join(" · ") : "")
      : "No designs match " + bits.join(" · ") + ". Try fewer words, or clear the filters.";
    clearBtn.hidden = !bits.length;
    if (!filtered.length) results.appendChild(el("p", "empty glass panel", "Nothing here. Clear the filters, or let “surprise me” pick one."));
  }
  function pressChips(sel, attr, val) {
    document.querySelectorAll(sel).forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute(attr) === val ? "true" : "false"); });
  }
  document.querySelector(".style-chips").addEventListener("click", function (e) {
    var b = e.target.closest(".chip"); if (!b) return;
    state.style = b.getAttribute("data-style");
    pressChips(".style-chips .chip", "data-style", state.style);
    apply();
  });
  document.querySelector(".palette-chips").addEventListener("click", function (e) {
    var b = e.target.closest(".chip"); if (!b) return;
    state.family = b.getAttribute("data-family");
    pressChips(".palette-chips .chip", "data-family", state.family);
    apply();
  });
  var qTimer = 0;
  search.addEventListener("input", function () {
    clearTimeout(qTimer);
    qTimer = setTimeout(function () { state.q = search.value.trim().toLowerCase(); apply(); }, 140);
  });
  results.addEventListener("click", function (e) {
    var t = e.target.closest(".tag");
    if (!t) return;
    var v = t.getAttribute("data-tag");
    state.q = state.q === v ? "" : v;
    search.value = state.q;
    apply();
    document.getElementById("browse").scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
  });
  clearBtn.addEventListener("click", function () {
    state = { style: "", family: "", q: "" };
    search.value = "";
    pressChips(".style-chips .chip", "data-style", "");
    pressChips(".palette-chips .chip", "data-family", "");
    apply();
  });

  // make sure a design's card is on the page, then bring it into view
  function reveal(d, focus) {
    var i = filtered.indexOf(d);
    if (i < 0) return null;
    if (i >= rendered) renderMore(i);
    var c = document.getElementById(d.k);
    c.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
    if (focus) c.querySelector(".shot").focus({ preventScroll: true });
    return c;
  }
  var lastPick = null;
  document.querySelector(".surprise").addEventListener("click", function () {
    if (!filtered.length) clearBtn.click();
    var d;
    do { d = filtered[Math.floor(Math.random() * filtered.length)]; } while (filtered.length > 1 && d === lastPick);
    lastPick = d;
    holdUntil = Date.now() + 1200;
    var c = reveal(d, true);
    if (c) {
      activate(c);
      c.classList.remove("surprised"); void c.offsetWidth; c.classList.add("surprised");
    }
  });

  /* ---------- Lightbox: every image in the current results ---------- */
  var lbImg = dlg.querySelector(".lb-img"), lbCap = dlg.querySelector(".lb-caption");
  var idx = 0;
  function show(i) {
    var total = filtered.length * 2;
    idx = (i + total) % total;
    var d = filtered[idx >> 1], n = idx & 1, im = d.i[n];
    var label = n ? "landing page" : "app UI";
    lbImg.src = "img/" + im[0];   // the thumbnail stands in until the full image arrives
    lbImg.width = im[4]; lbImg.height = im[5];
    lbImg.alt = d.t + ": AI-generated " + label + " exploration for the concept " + d.c;
    var want = idx, pre = new Image();
    pre.onload = function () { if (want === idx && dlg.open) lbImg.src = "img/" + im[3]; };
    pre.src = "img/" + im[3];
    lbCap.textContent = d.t + " · " + label;
    lbCap.appendChild(el("span", "n", (idx + 1) + " / " + total));
    if ((idx >> 1) >= rendered) renderMore(idx >> 1);
    activate(document.getElementById(d.k));
  }
  results.addEventListener("click", function (e) {
    var s = e.target.closest(".shot");
    if (!s) return;
    var d = byKey[s.closest(".design").getAttribute("data-design")];
    show(filtered.indexOf(d) * 2 + (+s.getAttribute("data-n")));
    dlg.showModal();
    dlg.querySelector(".lb-close").focus();
  });
  dlg.querySelector(".lb-close").addEventListener("click", function () { dlg.close(); });
  dlg.querySelector(".lb-prev").addEventListener("click", function () { show(idx - 1); });
  dlg.querySelector(".lb-next").addEventListener("click", function () { show(idx + 1); });
  dlg.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") { e.preventDefault(); show(idx - 1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); show(idx + 1); }
  });
  dlg.addEventListener("click", function (e) {
    if (e.target === dlg || e.target.classList.contains("lb-frame")) dlg.close();
  });
  dlg.addEventListener("close", function () {
    lbImg.removeAttribute("src");
    var d = filtered[idx >> 1];
    var c = d && document.getElementById(d.k);
    if (c) {
      // land focus on the image that was showing, so you're where you left off
      c.querySelectorAll(".shot")[idx & 1].focus({ preventScroll: true });
      c.scrollIntoView({ block: "nearest" });
      if (!touchMode && !c.matches(":hover")) release(c);
    }
  });

  /* ---------- Load ---------- */
  fetch("gallery-data.json").then(function (r) {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }).then(function (data) {
    designs = data.designs;
    var gen = {};
    designs.forEach(function (d) { byKey[d.k] = d; if (d.T) gen[d.k] = d.T; });
    adhd.addThemes(gen);
    apply();
    // deep link: /gallery/#<design> opens straight onto that card
    var h = decodeURIComponent(location.hash.slice(1));
    if (byKey[h]) reveal(byKey[h], false);
  }).catch(function () {
    statusText.textContent = "The gallery data didn't load. Please refresh the page.";
  });
})();
