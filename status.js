/* Beloplan status page: the "Status" view of the approved public-site design, drawn from the data Upptime
   already publishes in this repository (history/*.yml, history/summary.json) and its GitHub issues.
   Loaded by the `js:` hook in .upptimerc.yml; Upptime's own page stays underneath and is only hidden
   (html.bp-on) once this has drawn, so a failure here leaves Upptime's page as it was. */
(function () {
  "use strict";
  var REPO = "Beloplan/status";
  var RAW = "https://raw.githubusercontent.com/" + REPO + "/master/";
  var API = "https://api.github.com/repos/" + REPO + "/";
  var DAYS = 90;
  var DAY_MS = 864e5;
  var root = document.documentElement;
  var HOME = window.BP_TEST || location.pathname === "/" || location.pathname === "/index.html";
  if (!HOME) return;

  var MARK = '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="4.25" y="12.00" width="26.00" height="11.00" rx="3" fill="currentColor"/><rect x="4.25" y="26.50" width="11.25" height="11.00" rx="3" fill="currentColor"/><rect x="19.00" y="26.50" width="26.00" height="11.00" rx="3" fill="currentColor"/><rect x="4.25" y="41.00" width="26.00" height="11.00" rx="3" fill="currentColor"/><rect x="33.75" y="41.00" width="26.00" height="11.00" rx="3" fill="currentColor"/></svg>';
  var SUN = '<svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
  var MOON = '<svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z"/></svg>';

  /* ---------- small helpers ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function getJson(url) {
    return fetch(url, { headers: { Accept: "application/json" } }).then(function (r) {
      if (!r.ok) throw new Error(url + " " + r.status);
      return r.json();
    });
  }
  function getText(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url + " " + r.status);
      return r.text();
    });
  }
  /* The GitHub API is rate limited per visitor address: keep an answer for five minutes. */
  function cached(key, load) {
    try {
      var hit = JSON.parse(sessionStorage.getItem("bp-status:" + key) || "null");
      if (hit && Date.now() - hit.at < 3e5) return Promise.resolve(hit.v);
    } catch (e) {}
    return load().then(function (v) {
      try { sessionStorage.setItem("bp-status:" + key, JSON.stringify({ at: Date.now(), v: v })); } catch (e) {}
      return v;
    });
  }
  function ago(iso) {
    var m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 6e4));
    if (m < 1) return "just now";
    if (m < 60) return m + (m === 1 ? " minute ago" : " minutes ago");
    var h = Math.round(m / 60);
    if (h < 48) return h + (h === 1 ? " hour ago" : " hours ago");
    return Math.round(h / 24) + " days ago";
  }
  function stamp(iso) {
    return new Date(iso).toLocaleString("en-GB", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels"
    }).replace(",", "").replace("Sept", "Sep");
  }
  function dayKey(ms) { return new Date(ms).toISOString().slice(0, 10); }
  function percent(n) { return (Math.floor(n * 100) / 100).toFixed(2).replace(/\.?0+$/, "") + "%"; }

  /* ---------- the components: one per monitored site ---------- */
  function parseHistory(text) {
    var out = {};
    text.split("\n").forEach(function (line) {
      var m = /^(\w+):\s*(.*)$/.exec(line);
      if (m) out[m[1]] = m[2].trim();
    });
    return out;
  }
  var STATE = {
    up: { label: "Operational", cls: "" },
    degraded: { label: "Degraded", cls: "w" },
    down: { label: "Down", cls: "c" }
  };
  function barClass(minutes, hasData) {
    if (!hasData) return "n";
    if (minutes >= 30) return "c";
    return minutes > 0 ? "w" : "";
  }
  function buildComponent(site, hist, now) {
    var start = new Date(hist.startTime || now).getTime();
    var minutes = site.dailyMinutesDown || {};
    var today = Date.parse(dayKey(now));
    var bars = [], down = 0, seen = 0;
    for (var i = DAYS - 1; i >= 0; i--) {
      var day = today - i * DAY_MS;
      var has = day + DAY_MS > start;
      var m = Number(minutes[dayKey(day)] || 0);
      if (i === 0 && hist.status === "down") m = Math.max(m, 30);
      if (has) { seen++; down += m; }
      bars.push(barClass(m, has));
    }
    var uptime = seen ? Math.max(0, 100 - (down / (seen * 1440)) * 100) : parseFloat(site.uptime) || 100;
    return { name: site.name, status: hist.status || site.status || "up", bars: bars, uptime: uptime };
  }
  function loadComponents() {
    return getJson(RAW + "history/summary.json").then(function (sites) {
      return Promise.all(sites.map(function (site) {
        return getText(RAW + "history/" + site.slug + ".yml").then(parseHistory, function () { return {}; })
          .then(function (hist) { return buildComponent(site, hist, Date.now()); });
      }));
    });
  }

  /* ---------- incidents: Upptime opens a GitHub issue for every outage and every maintenance window ---------- */
  function plain(md) {
    return String(md || "").replace(/<!--[\s\S]*?-->/g, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[*_`#>]/g, "").replace(/\s+/g, " ").trim();
  }
  function firstSentence(text) {
    var s = text.length > 220 ? text.slice(0, 217).replace(/\s+\S*$/, "") + "..." : text;
    return s;
  }
  function updateOf(label, body) {
    var text = plain(body).replace(/^(resolved|update|investigating)\s*:?\s*/i, "");
    var m = /^(resolved|completed|closed)/i.exec(plain(body));
    return { label: m ? "Resolved" : label, text: firstSentence(text) };
  }
  function toIncident(issue, comments) {
    var maintenance = (issue.labels || []).some(function (l) { return l.name === "maintenance"; });
    var open = issue.state === "open";
    var ups = [{ at: issue.created_at, u: updateOf(maintenance ? "Scheduled" : "Investigating", issue.body) }];
    comments.forEach(function (c) { ups.push({ at: c.created_at, u: updateOf("Update", c.body) }); });
    if (!open && !comments.length) ups.push({ at: issue.closed_at, u: { label: maintenance ? "Completed" : "Resolved", text: "" } });
    ups.sort(function (a, b) { return a.at < b.at ? 1 : -1; });
    var chip = maintenance ? (open ? ["warn", "In progress"] : ["idle", "Completed"]) : (open ? ["crit", "Ongoing"] : ["good", "Resolved"]);
    return { title: issue.title.replace(/^\[[^\]]*\]\s*/, ""), chip: chip, updates: ups };
  }
  function loadIncidents() {
    return cached("issues", function () {
      return getJson(API + "issues?state=all&per_page=6&sort=created&direction=desc").then(function (issues) {
        issues = issues.filter(function (i) { return !i.pull_request; }).slice(0, 5);
        return Promise.all(issues.map(function (i) {
          var comments = i.comments ? getJson(i.comments_url) : Promise.resolve([]);
          return comments.then(function (c) { return toIncident(i, c); });
        }));
      });
    });
  }
  function loadChecked() {
    return cached("runs", function () {
      return getJson(API + "actions/workflows/uptime.yml/runs?per_page=1&status=success").then(function (r) {
        return r.workflow_runs && r.workflow_runs[0] ? r.workflow_runs[0].updated_at : null;
      });
    });
  }

  /* ---------- markup, the design's own classes ---------- */
  var HEADLINE = {
    up: { cls: "", text: "All systems operational" },
    degraded: { cls: "w", text: "Some systems are degraded" },
    down: { cls: "c", text: "Some systems are down" }
  };
  function overall(comps) {
    var states = comps.map(function (c) { return c.status; });
    if (states.indexOf("down") > -1) return "down";
    return states.indexOf("degraded") > -1 ? "degraded" : "up";
  }
  function compHtml(c) {
    var s = STATE[c.status] || STATE.up;
    var bars = c.bars.map(function (b) { return '<i class="' + b + '"></i>'; }).join("");
    var label = c.name + ": " + percent(c.uptime) + " uptime over the last " + DAYS + " days";
    return '<div class="comp"><div class="top"><b>' + esc(c.name) + '</b><span class="st ' + s.cls + '">' + s.label + "</span></div>" +
      '<div class="bars" role="img" aria-label="' + esc(label) + '">' + bars + "</div>" +
      '<div class="foot"><span>' + DAYS + ' days ago</span><span class="num">' + percent(c.uptime) + ' uptime</span><span>today</span></div></div>';
  }
  function incHtml(inc) {
    var rows = inc.updates.map(function (x) {
      var body = "<b>" + x.u.label + ".</b>" + (x.u.text ? " " + esc(x.u.text) : "");
      return "<dt>" + stamp(x.at) + "</dt><dd>" + body + "</dd>";
    }).join("");
    return '<article class="inc"><div class="top"><b>' + esc(inc.title) + '</b><span class="chip ' + inc.chip[0] + '">' + inc.chip[1] + "</span></div>" +
      '<dl class="upd">' + rows + "</dl></article>";
  }
  function pageHtml() {
    var logo = '<a class="logo" href="https://www.beloplan.be/"><span class="logo-mark is-svg">' + MARK + '</span><span class="logo-word">Beloplan</span>';
    return '<nav class="site-nav" aria-label="Site"><div class="wrap"><a class="logo" href="/"><span class="logo-mark is-svg">' + MARK +
      '</span><span class="logo-word">Beloplan</span> <span class="logo-sub">status</span></a>' +
      '<div class="right"><button type="button" class="theme-switch" aria-label="Light or dark">' + SUN + MOON + "</button>" +
      '<a class="btn btn-line" href="mailto:status@beloplan.be?subject=Subscribe%20to%20status%20updates"><span>Subscribe<span class="long"> to updates</span></span></a></div></div></nav>' +
      '<div class="wrap narrow"><section class="status-top"><div class="state"><i></i><h1>Checking the systems</h1></div>' +
      '<div class="row"><p id="bp-checked">Checked every 5 minutes, from outside AWS</p></div></section>' +
      '<div class="comps" id="bp-comps"></div>' +
      '<section class="incidents"><h2>Recent incidents</h2><div id="bp-incs" class="incs"></div></section></div>' +
      '<footer class="site-foot"><div class="wrap">' + logo + '</a><a href="https://www.beloplan.be/">www.beloplan.be</a>' +
      '<a href="https://www.beloplan.be/support">Support</a><a href="https://www.beloplan.be/security">Security</a>' +
      '<span class="spacer">contact@beloplan.be</span></div></footer>';
  }

  /* ---------- the light/dark switch, the landing's own ("bp-theme") ---------- */
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  var darkQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  function isDark() {
    var set = root.getAttribute("data-theme");
    return set ? set === "dark" : !!(darkQuery && darkQuery.matches);
  }
  function paintTheme(theme) {
    root.setAttribute("data-theme", theme);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", theme === "dark" ? "#111214" : "#f4f4f3");
  }
  function flipTheme(event) {
    var next = isDark() ? "light" : "dark";
    store("bp-theme", next);
    var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!document.startViewTransition || still) { paintTheme(next); return; }
    var r = event.currentTarget.getBoundingClientRect();
    root.style.setProperty("--reveal-x", Math.round(r.left + r.width / 2) + "px");
    root.style.setProperty("--reveal-y", Math.round(r.top + r.height / 2) + "px");
    document.startViewTransition(function () { paintTheme(next); });
  }

  /* ---------- boot ---------- */
  function fill(comps, incidents, checkedAt) {
    var h = HEADLINE[overall(comps)];
    var state = document.querySelector("#bp-status .state");
    state.className = "state " + h.cls;
    state.querySelector("h1").textContent = h.text;
    document.getElementById("bp-comps").innerHTML = comps.map(compHtml).join("");
    document.getElementById("bp-incs").innerHTML = incidents.length ? incidents.map(incHtml).join("") :
      '<div class="inc none"><p>No incidents or maintenance have been reported.</p></div>';
    if (checkedAt) document.getElementById("bp-checked").textContent = checkText(checkedAt);
  }
  /* The schedule is "every 5 minutes", but GitHub runs it when it can: say how old the last check really is. */
  function checkText(iso) {
    var fresh = Date.now() - new Date(iso).getTime() < 20 * 6e4;
    return fresh ? "Checked " + ago(iso) + " \u00b7 every 5 minutes, from outside AWS" : "Last checked " + ago(iso) + ", from outside AWS";
  }
  function boot() {
    var host = document.createElement("div");
    host.id = "bp-status";
    host.innerHTML = pageHtml();
    document.body.appendChild(host);
    host.querySelector(".theme-switch").addEventListener("click", flipTheme);
    root.classList.add("bp-on");
    Promise.all([
      loadComponents(),
      loadIncidents().catch(function () { return []; }),
      loadChecked().catch(function () { return null; })
    ]).then(function (r) { fill(r[0], r[1], r[2]); }, function () {
      root.classList.remove("bp-on");
      host.remove();
    });
  }
  if (document.body) boot(); else document.addEventListener("DOMContentLoaded", boot);
})();
