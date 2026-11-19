(function () {
  "use strict";
  var W = window.WIKI;
  var $ = function (id) { return document.getElementById(id); };
  var doc = $("doc"), toc = $("toc"), sheet = $("sheet"), rail = $("rail"), scrim = $("scrim"), mast = $("mast");
  var input = $("q"), results = $("results");
  var order = W.order;
  var pendingAnchor = null, observer = null, current = "home";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function slug(s) { return s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  /* theme */
  var saved = store("oaw-theme");
  if (saved === "dark" || saved === "light") document.documentElement.dataset.theme = saved;
  $("theme").addEventListener("click", function () {
    var r = document.documentElement;
    var dark = (r.dataset.theme || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")) === "dark";
    r.dataset.theme = dark ? "light" : "dark";
    store("oaw-theme", r.dataset.theme);
  });

  /* navigation */
  function buildNav() {
    var html = "";
    W.groups.forEach(function (g) {
      html += '<p class="grp">' + esc(g.name) + '</p><div class="nav">';
      g.pages.forEach(function (id) {
        if (W.pages[id]) html += '<a href="#' + id + '" data-id="' + id + '">' + esc(W.pages[id].nav) + "</a>";
      });
      html += "</div>";
    });
    $("nav").innerHTML = html;
  }

  function markdown(md) {
    if (window.marked) return window.marked.parse(md, { mangle: false, headerIds: false });
    return "<pre>" + esc(md) + "</pre>";
  }

  function icons(md) { return md.replace(/\{\{icon:([a-z0-9_-]+)(?:\|([^}]*))?\}\}/g, function (m, n, l) { return "<i class=\"spr i-" + n + "\"" + (l ? " role=\"img\" aria-label=\"" + l + "\"" : " aria-hidden=\"true\"") + "></i>"; }); }

  function pageHtml(id) {
    if (id === "home") {
      var h = "<h1>" + esc(W.home.title) + "</h1><p class=\"lead\">" + esc(W.home.lead) + "</p>";
      h += "<h2 id=\"quick-answers\">Quick answers</h2><div class=\"quick\">";
      W.quick.forEach(function (q) {
        h += '<a class="btn" href="#' + q.page + '" data-page="' + q.page + '" data-anchor="' + q.anchor + '">' + esc(q.label) + "</a>";
      });
      h += "</div><h2 id=\"all-pages\">All pages</h2><ul class=\"plist\">";
      order.forEach(function (pid) {
        var p = W.pages[pid];
        h += '<li><a href="#' + pid + '"><b>' + esc(p.title) + "</b><span>" + esc(p.summary) + "</span></a></li>";
      });
      return h + "</ul>" + stamp();
    }
    var p = W.pages[id];
    var wrap = document.createElement("div");
    wrap.innerHTML = markdown(icons(p.md));
    var first = wrap.querySelector("h1 + p");
    if (first) first.className = "lead";
    wrap.querySelectorAll("table").forEach(function (t) {
      if (t.rows[0] && t.rows[0].cells.length >= 4) t.classList.add("wide");
      if (t.tBodies[0] && t.tBodies[0].rows[0] && t.tBodies[0].rows[0].cells[0].querySelector(".spr")) t.classList.add("ic");
      var d = document.createElement("div");
      d.className = "tw";
      d.tabIndex = 0;
      d.setAttribute("role", "region");
      d.setAttribute("aria-label", "Table, scrolls sideways");
      t.parentNode.insertBefore(d, t);
      d.appendChild(t);
    });
    var seen = {};
    wrap.querySelectorAll("h2, h3").forEach(function (hd) {
      var s = slug(hd.textContent) || "section", n = s, i = 2;
      while (seen[n]) n = s + "-" + i++;
      seen[n] = 1;
      hd.id = n;
    });
    wrap.querySelectorAll("a[href^='#']").forEach(function (a) {
      var t = a.getAttribute("href").slice(1);
      if (W.pages[t] || t === "home") a.setAttribute("data-page", t);
    });
    return wrap.innerHTML + footer(id);
  }

  function stamp() {
    return '<p class="stamp">Prices and numbers come from the game and can change with updates. Updated ' + esc(W.built) + ". Spotted a mistake? Tell us in the game's Discord.</p>";
  }
  function footer(id) {
    var i = order.indexOf(id), prev = order[i - 1], next = order[i + 1], h = '<div class="foot">';
    if (prev) h += '<a class="btn btn-quiet prev" href="#' + prev + '"><small>Previous</small>' + esc(W.pages[prev].title) + "</a>";
    if (next) h += '<a class="btn next" href="#' + next + '"><small>Next</small>' + esc(W.pages[next].title) + "</a>";
    return h + stamp() + "</div>";
  }

  function render(id, anchor) {
    if (id !== "home" && !W.pages[id]) id = "home";
    current = id;
    closeLayers();
    doc.innerHTML = pageHtml(id);
    if (!reduce) { doc.classList.remove("enter"); void doc.offsetWidth; doc.classList.add("enter"); }
    document.title = (id === "home" ? W.home.title : W.pages[id].title + " | Own A World Player Wiki");
    document.querySelectorAll("#nav a").forEach(function (a) { if (a.dataset.id === id) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    var home = $("s-home");
    if (id === "home") home.setAttribute("aria-current", "page"); else home.removeAttribute("aria-current");
    buildToc();
    var target = anchor && document.getElementById(anchor);
    if (target) { target.scrollIntoView({ block: "start" }); } else { window.scrollTo(0, 0); }
    setupSpy();
  }

  function heads() { return Array.prototype.slice.call(doc.querySelectorAll("h2")); }
  function buildToc() {
    var hs = heads(), html = "", sh = "";
    if (hs.length > 1) {
      html = '<p class="toc-title">On this page</p>';
      sh = "<h2>On this page</h2>";
      hs.forEach(function (h) {
        var a = '<a href="#' + h.id + '" data-jump="' + h.id + '">' + esc(h.textContent) + "</a>";
        html += a; sh += a;
      });
    }
    toc.innerHTML = html; toc.hidden = !html;
    sheet.innerHTML = sh;
    $("s-toc").hidden = !html;
  }
  function setupSpy() {
    if (observer) observer.disconnect();
    var hs = heads();
    if (!hs.length || !("IntersectionObserver" in window)) return;
    var active = null;
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) active = e.target.id; });
      if (active) document.querySelectorAll("[data-jump]").forEach(function (a) { a.setAttribute("aria-current", a.dataset.jump === active ? "true" : "false"); });
    }, { rootMargin: "-" + (parseInt(getComputedStyle(document.documentElement).getPropertyValue("--mast")) + 20) + "px 0px -65% 0px" });
    hs.forEach(function (h) { observer.observe(h); });
  }

  function route() {
    var id = decodeURIComponent(location.hash.slice(1)) || "home";
    var a = pendingAnchor; pendingAnchor = null;
    render(id, a);
  }
  window.addEventListener("hashchange", route);

  /* in-page jumps and anchored links never rewrite the address (only #page ids are valid) */
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a");
    if (!a) return;
    var jump = a.getAttribute("data-jump");
    if (jump) {
      e.preventDefault();
      closeLayers();
      var t = document.getElementById(jump);
      if (t) t.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
      return;
    }
    var page = a.getAttribute("data-page");
    if (page) {
      pendingAnchor = a.getAttribute("data-anchor");
      closeResults();
      if (location.hash.slice(1) === page || (!location.hash && page === "home")) { e.preventDefault(); route(); }
    } else if (a.closest("#nav") || a.closest(".foot") || a.closest(".plist") || a.closest(".brand")) {
      closeResults();
    }
  });

  /* layers: pages drawer, contents sheet */
  var layer = null;
  function openLayer(name) {
    closeLayers();
    var el = name === "pages" ? rail : sheet;
    el.classList.add("open"); scrim.classList.add("on");
    document.documentElement.style.overflow = "hidden";
    $(name === "pages" ? "s-pages" : "s-toc").setAttribute("aria-pressed", "true");
    layer = name;
  }
  function closeLayers() {
    rail.classList.remove("open"); sheet.classList.remove("open"); scrim.classList.remove("on");
    document.documentElement.style.overflow = "";
    $("s-pages").setAttribute("aria-pressed", "false"); $("s-toc").setAttribute("aria-pressed", "false");
    layer = null;
  }
  $("s-pages").addEventListener("click", function () { layer === "pages" ? closeLayers() : openLayer("pages"); });
  $("s-toc").addEventListener("click", function () { layer === "toc" ? closeLayers() : openLayer("toc"); });
  scrim.addEventListener("click", closeLayers);
  $("s-search").addEventListener("click", function () {
    var on = !mast.classList.contains("searching");
    closeLayers();
    mast.classList.toggle("searching", on);
    $("s-search").setAttribute("aria-pressed", on ? "true" : "false");
    if (on) input.focus(); else closeResults();
  });

  /* search over sections */
  var index = [];
  order.forEach(function (pid) {
    var p = W.pages[pid], parts = p.md.split(/\n(?=## )/);
    parts.forEach(function (part, i) {
      var m = part.match(/^##\s+(.+)/);
      var title = m ? m[1].trim() : p.title;
      var text = part.replace(/<[^>]+>/g, " ").replace(/\{\{icon:[^}]*\}\}/g, " ").replace(/^#+\s+.+\n?/, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\|\s*:?-{2,}:?\s*(?=\|)/g, " ").replace(/[*`|>#_]/g, " ").replace(/\s-{2,}\s/g, " ").replace(/\s+/g, " ").trim();
      index.push({ pid: pid, ptitle: p.title, stitle: title, sid: m ? slug(title) : "", text: text, low: (title + " " + p.title + " " + text).toLowerCase(), lt: title.toLowerCase(), lp: p.title.toLowerCase() });
    });
  });

  var sel = -1, hits = [], resultsOpen = false;
  function terms(q) { return q.toLowerCase().split(/\s+/).filter(Boolean); }
  function search(q) {
    var ts = terms(q);
    if (!ts.length) return [];
    var out = [];
    index.forEach(function (s) {
      if (!ts.every(function (t) { return s.low.indexOf(t) > -1; })) return;
      var score = 0;
      ts.forEach(function (t) { if (s.lt.indexOf(t) > -1) score += 12; if (s.lp.indexOf(t) > -1) score += 5; score += Math.min(6, s.low.split(t).length - 1); });
      out.push({ s: s, score: score });
    });
    out.sort(function (a, b) { return b.score - a.score; });
    return out.slice(0, 8).map(function (o) { return o.s; });
  }
  function snippet(s, ts) {
    var low = s.text.toLowerCase(), at = -1;
    for (var i = 0; i < ts.length && at < 0; i++) at = low.indexOf(ts[i]);
    var start = Math.max(0, at < 0 ? 0 : at - 50), t = s.text.slice(start, start + 150);
    var h = esc((start > 0 ? "…" : "") + t + (start + 150 < s.text.length ? "…" : ""));
    ts.forEach(function (x) { h = h.replace(new RegExp("(" + x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig"), "<mark>$1</mark>"); });
    return h;
  }
  function showResults() {
    var q = input.value.trim();
    if (q.length < 2) { closeResults(); return; }
    hits = search(q); sel = hits.length ? 0 : -1;
    var ts = terms(q), h = "";
    hits.forEach(function (s, i) {
      h += '<a class="res" role="option" id="r' + i + '" aria-selected="' + (i === sel) + '" href="#' + s.pid + '" data-page="' + s.pid + '" data-anchor="' + s.sid + '"><b>' + esc(s.ptitle) + (s.sid ? " › " + esc(s.stitle) : "") + "</b><span>" + snippet(s, ts) + "</span></a>";
    });
    if (!hits.length) h = '<div class="res-none">No page matches “' + esc(q) + "”. Try fewer words.</div>";
    results.innerHTML = h;
    if (!resultsOpen) { results.hidden = false; if (!reduce) { results.classList.remove("enter"); void results.offsetWidth; results.classList.add("enter"); } }
    resultsOpen = true; input.setAttribute("aria-expanded", "true");
  }
  function closeResults() {
    results.hidden = true; resultsOpen = false; sel = -1; hits = [];
    input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant");
  }
  function mark() {
    results.querySelectorAll(".res").forEach(function (r, i) { r.setAttribute("aria-selected", i === sel ? "true" : "false"); });
    if (sel > -1) { var r = $("r" + sel); input.setAttribute("aria-activedescendant", "r" + sel); if (r && r.scrollIntoView) r.scrollIntoView({ block: "nearest" }); }
  }
  function open(s) {
    pendingAnchor = s.sid || null;
    closeResults(); input.blur(); mast.classList.remove("searching"); $("s-search").setAttribute("aria-pressed", "false");
    if (location.hash.slice(1) === s.pid) route(); else location.hash = s.pid;
  }
  input.addEventListener("input", showResults);
  input.addEventListener("focus", function () { if (input.value.trim().length > 1 && !resultsOpen) showResults(); });
  input.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown" && hits.length) { e.preventDefault(); sel = (sel + 1) % hits.length; mark(); }
    else if (e.key === "ArrowUp" && hits.length) { e.preventDefault(); sel = (sel - 1 + hits.length) % hits.length; mark(); }
    else if (e.key === "Enter") { e.preventDefault(); if (!resultsOpen) showResults(); if (hits[sel > -1 ? sel : 0]) open(hits[sel > -1 ? sel : 0]); }
    else if (e.key === "Escape") { if (resultsOpen) { closeResults(); } else { input.value = ""; input.blur(); } }
  });
  document.addEventListener("click", function (e) { if (resultsOpen && !e.target.closest(".search")) closeResults(); });
  document.addEventListener("keydown", function (e) {
    var tag = (e.target.tagName || "").toLowerCase();
    if (e.key === "/" && tag !== "input" && tag !== "textarea" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); input.focus(); input.select(); }
    else if (e.key === "Escape" && layer) closeLayers();
  });
  window.addEventListener("resize", function () { if (window.innerWidth >= 900) { closeLayers(); mast.classList.remove("searching"); } });

  buildNav();
  route();
})();
