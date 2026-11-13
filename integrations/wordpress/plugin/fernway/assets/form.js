/* Fernway for WordPress: the form, made quicker where a browser can help. Everything here also works without it:
   the form posts to the server, which draws the receipt. No libraries, no build step. */
(function () {
	"use strict";

	var uuid = function () {
		if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
		var a = new Uint8Array(16);
		(window.crypto || window.msCrypto).getRandomValues(a);
		return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
	};

	// Times at a house are the business's times: shown in the site's time zone, whatever the visitor's device says.
	var zoneOf = function (tz) {
		try { new Intl.DateTimeFormat([], { timeZone: tz }); return tz; } catch (e) { return undefined; }
	};
	var timeOf = function (iso, tz) {
		return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: zoneOf(tz) });
	};
	var dayOf = function (iso, tz) {
		var parts = new Intl.DateTimeFormat([], { weekday: "short", day: "numeric", timeZone: zoneOf(tz) }).formatToParts(new Date(iso));
		var get = function (t) { return (parts.filter(function (p) { return p.type === t; })[0] || {}).value || ""; };
		return get("weekday") + " " + get("day");
	};

	function setup(root) {
		root.classList.add("has-js");
		var w = {};
		try { w = JSON.parse(root.dataset.words || "{}"); } catch (e) { w = {}; }
		var form = root.querySelector(".fw-form");
		if (root.dataset.number) poll(root, 0);
		if (!form) return;
		var key = form.querySelector("[name=fw_key]");
		if (key && !key.value) key.value = uuid();

		// The day and half-day: each day knows its first free time in the morning and the afternoon.
		var slot = form.querySelector(".fw-slot-value");
		var send = form.querySelector(".fw-send-t");
		var label = form.querySelector(".fw-send") ? form.querySelector(".fw-send").dataset.label : "";
		var pick = function () {
			var day = form.querySelector("[name=fw_day]:checked");
			var halves = form.querySelectorAll("[name=fw_half]");
			Array.prototype.forEach.call(halves, function (h) {
				var iso = day ? day.dataset[h.value] : "";
				h.disabled = !!day && !iso;
				if (h.disabled && h.checked) h.checked = false;
				var from = h.parentNode.querySelector(".fw-from");
				if (from) from.textContent = iso ? " " + (w.from || "from") + " " + timeOf(iso, root.dataset.tz) : "";
			});
			var half = form.querySelector("[name=fw_half]:checked");
			var iso = day && half ? day.dataset[half.value] : "";
			if (slot) slot.value = iso || "";
			if (send) send.textContent = iso ? label + " · " + dayOf(iso, root.dataset.tz) + ", " + (half.value === "am" ? (w.morning || "morning") : (w.afternoon || "afternoon")) : label;
		};
		Array.prototype.forEach.call(form.querySelectorAll("[name=fw_day],[name=fw_half]"), function (r) { r.addEventListener("change", pick); });
		var firstOpen = form.querySelector("[name=fw_day]:not(:disabled)");
		if (firstOpen && !form.querySelector("[name=fw_day]:checked")) { firstOpen.checked = true; }
		pick();

		// The service area: told while typing, from the ZIP at the end of the address.
		var area = (root.dataset.area || "").split(/\s*,\s*/).filter(Boolean);
		var addr = form.querySelector("[name=address]");
		var badge = form.querySelector(".fw-area");
		if (addr && badge && area.length) {
			var check = function () {
				var m = addr.value.match(/(\d{5})(?:-\d{4})?\s*$/);
				if (!m) { badge.textContent = ""; badge.className = "fw-area"; return; }
				var inside = area.some(function (a) { return m[1].indexOf(a) === 0; });
				badge.textContent = inside ? (w.in || "in our area") : (w.out || "we'll confirm we cover it");
				badge.className = "fw-area " + (inside ? "is-in" : "is-out");
			};
			addr.addEventListener("input", check);
			check();
		}

		// A field's problem goes as soon as the visitor changes that field.
		form.addEventListener("input", function (e) {
			var field = e.target.closest(".fw-field, .fw-slot");
			if (!field || !field.classList.contains("is-bad")) return;
			field.classList.remove("is-bad");
			Array.prototype.forEach.call(field.querySelectorAll(".fw-problem"), function (p) { p.remove(); });
		});
		form.addEventListener("change", function (e) {
			var field = e.target.closest(".fw-slot");
			if (field && slot && slot.value) {
				field.classList.remove("is-bad");
				Array.prototype.forEach.call(field.querySelectorAll(".fw-problem"), function (p) { p.remove(); });
			}
		});

		form.addEventListener("submit", function (e) {
			e.preventDefault();
			var button = form.querySelector(".fw-send");
			clear(form);
			button.disabled = true;
			root.classList.add("is-sending");
			fetch(root.dataset.rest + "send", { method: "POST", body: new URLSearchParams(new FormData(form)), credentials: "same-origin" })
				.then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); })
				.then(function (res) {
					root.classList.remove("is-sending");
					button.disabled = false;
					if (res.body && res.body.ok) {
						if (!res.body.html) { form.reset(); return; }
						root.dataset.number = res.body.number;
						root.dataset.sig = res.body.sig;
						root.dataset.booked = res.body.booked || "";
						root.dataset.first = res.body.first || "";
						root.classList.add("is-sent");
						root.innerHTML = res.body.html;
						var title = root.querySelector(".fw-sent-title");
						if (title) { title.setAttribute("tabindex", "-1"); title.focus(); }
						wire(root);
						poll(root, 0);
						return;
					}
					show(form, (res.body && res.body.problems) || { form: "Something went wrong. Please try again." });
				})
				.catch(function () {
					root.classList.remove("is-sending");
					button.disabled = false;
					show(form, { form: "We couldn't reach the site just now. Please try again in a moment." });
				});
		});
		wire(root, w);
	}

	function clear(form) {
		Array.prototype.forEach.call(form.querySelectorAll(".fw-problem.is-live"), function (p) { p.remove(); });
		Array.prototype.forEach.call(form.querySelectorAll(".is-bad"), function (f) { f.classList.remove("is-bad"); });
	}

	function show(form, problems) {
		var first = null;
		Object.keys(problems).forEach(function (k) {
			var p = document.createElement(k === "form" ? "p" : "span");
			p.className = "fw-problem is-live" + (k === "form" ? " fw-problem-form" : "");
			p.setAttribute("role", "alert");
			p.textContent = problems[k];
			var field = k === "form" ? null : form.querySelector("[data-field=" + k + "]") || (k === "slot" ? form.querySelector(".fw-slot") : null);
			if (field) {
				field.classList.add("is-bad");
				field.appendChild(p);
				first = first || field.querySelector("input,textarea");
			} else {
				form.insertBefore(p, form.querySelector(".fw-fields"));
			}
		});
		if (first) first.focus();
	}

	function wire(root, w) {
		if (!w) { try { w = JSON.parse(root.dataset.words || "{}"); } catch (e) { w = {}; } }
		var copy = root.querySelector(".fw-copy");
		// Without a script this link opens the receipt; with one it copies the link, which is what a visitor wants to keep.
		if (copy && navigator.clipboard) {
			var t = copy.querySelector("span");
			if (t && copy.dataset.copyLabel) t.textContent = copy.dataset.copyLabel;
			copy.addEventListener("click", function (e) {
				e.preventDefault();
				navigator.clipboard.writeText(copy.dataset.copy).then(function () {
					if (t) t.textContent = w.copied || "Copied";
				});
			});
		}
	}

	// While the lead is still on its way, the receipt is redrawn every 1.5 s, for up to a minute.
	function poll(root, n) {
		var box = root.querySelector(".fw-sent");
		if (!box || box.dataset.moving !== "1" || n > 40) return;
		setTimeout(function () {
			var q = new URLSearchParams({ n: root.dataset.number, t: root.dataset.sig, b: root.dataset.booked || "", f: root.dataset.first || "" });
			fetch(root.dataset.rest + "receipt?" + q.toString(), { credentials: "same-origin" })
				.then(function (r) { return r.ok ? r.json() : null; })
				.then(function (j) {
					if (j && j.ok) { root.innerHTML = j.html; wire(root); }
					poll(root, n + 1);
				})
				.catch(function () { poll(root, n + 1); });
		}, 1500);
	}

	var start = function () { Array.prototype.forEach.call(document.querySelectorAll(".fernway"), setup); };
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
