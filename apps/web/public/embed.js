/* Fernway embed forms. Put the form's code where it should appear:
     <div data-fernway-form="fwf_..."></div>
     <script src="https://fernway.jeromebadour.com/embed.js" async></script>
   Each placeholder becomes the form, in a frame sized to its content, so the page's own styles never touch it and it
   never touches theirs. Only the form's owner chooses its fields, its look and the sites allowed to show it. */
(function () {
  "use strict";
  var me = document.currentScript;
  var origin = me ? new URL(me.src).origin : "https://fernway.jeromebadour.com";
  var frames = {};
  function mount(el) {
    var key = el.getAttribute("data-fernway-form") || "";
    if (!/^fwf_[a-z2-7]{20}$/.test(key) || el.getAttribute("data-fernway-ready")) return;
    el.setAttribute("data-fernway-ready", "1");
    var f = document.createElement("iframe");
    f.src = origin + "/f/" + key + "?site=" + encodeURIComponent(location.hostname);
    f.title = "Contact form";
    f.loading = "lazy";
    f.setAttribute("allow", "clipboard-write");
    // Hidden until the form says how tall it is: a page the form isn't open on (the browser refuses to show it there)
    // gets no empty box at all.
    f.style.cssText = "display:block;width:100%;max-width:640px;height:0;border:0;background:transparent;color-scheme:normal;visibility:hidden";
    el.appendChild(f);
    (frames[key] = frames[key] || []).push(f);
  }
  function scan() { var els = document.querySelectorAll("[data-fernway-form]"); for (var i = 0; i < els.length; i++) mount(els[i]); }
  window.addEventListener("message", function (e) {
    var d = e.data;
    if (e.origin !== origin || !d || d.fernway !== "size" || typeof d.height !== "number") return;
    var list = frames[d.key] || [];
    for (var i = 0; i < list.length; i++) if (list[i].contentWindow === e.source) {
      list[i].style.height = Math.min(Math.max(d.height, 120), 4000) + "px";
      list[i].style.visibility = "visible";
    }
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scan); else scan();
  // Pages that add the placeholder later (GHL funnels, single-page sites) are picked up too.
  if (window.MutationObserver) new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
})();
