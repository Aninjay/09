/* TAPMI Volunteer Allocation System - dashboard logic (vanilla JavaScript).
   The allocation functions below mirror event_staffing_optimizer.py exactly
   (same eligibility rules, same heuristic, same objective as the ILP). */
(function () {
"use strict";
var KEY = "tapmi_vas_v1";
var PW = { Critical: 10, High: 5, Normal: 1 }, PR = { Critical: 0, High: 1, Normal: 2 };
var $ = function (s, r) { return (r || document).querySelector(s); };
var esc = function (t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
var ICON = {
  grid: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M16 5a3 3 0 010 6M18 14c2 .7 3 2.600 3 6"/>',
  userset: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.500 2.700-6 6-6 1.500 0 2.800.5 3.800 1.300"/><circle cx="18" cy="17" r="2"/><path d="M18 13v1.300M18 20.700V22M14.500 15l1.100.7M20.400 18.300l1.100.7"/>',
  award: '<circle cx="12" cy="9" r="5"/><path d="M9 13.500L7.500 21l4.500-2.500 4.500 2.500L15 13.500"/>',
  shield: '<path d="M12 3l7 3v5c0 5-3 8.500-7 10-4-1.500-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
  warn: '<path d="M12 4L2.500 20h19z"/><path d="M12 10v5M12 17.500v.5"/>',
  greedy: '<path d="M4 6h16M4 12h11M4 18h6"/><path d="M17 10l3 2-3 2"/>',
  simulate: '<path d="M4 19V5M4 19h17"/><path d="M7 15l4-5 3 2 5-7"/><circle cx="19" cy="5" r="1.5"/>',
  chev: '<path d="M6 9l6 6 6-6"/>', arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>'
};
var svg = function (n) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[n] + "</svg>"; };
var PAGES = [["dashboard", "Dashboard", "grid"], ["events", "Events & Staffing", "cal"], ["roster", "Volunteers Roster", "users"],
  ["greedy", "Allocation", "greedy"], ["simulator", "What-if Simulator", "simulate"], ["committee", "Manage Core Committee", "userset"], ["skills", "Skills Catalog", "award"], ["audit", "Audit History", "shield"]];

/* ------------------------------------------------------------------ state */
var S, ui = { dashEvent: null, evSel: null, open: {}, q: "", skillF: "", greedyEvent: null, simEvent: null, simAttendees: null, simMethod: null, simDepts: {} };
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function makeEvent(e, depts) {
  var d = clone(depts);
  if (e.only) d.forEach(function (x) { var r = e.only[x.id] || 0; x.type = "fixed"; x.required = r; });
  return { id: e.id, name: e.name, venue: e.venue, date: e.date, attendees: e.attendees, status: e.status, method: e.method || "optimal", depts: d };
}
function freshState() {
  var sd = window.SEED;
  return { volunteers: clone(sd.volunteers), skills: clone(sd.skills), departments: clone(sd.departments), committee: clone(sd.committee), heads: {},
    events: sd.events.map(function (e) { return makeEvent(e, sd.departments); }), versions: [], audit: [{ t: Date.now(), a: "System ready", d: "Demo configuration loaded. Import a CSV to add volunteers." }] };
}
function uniqueHeads(heads) {
  var out = {}, people = {};
  Object.keys(heads || {}).forEach(function (deptId) {
    var personId = heads[deptId];
    if (!personId || people[personId]) return;
    people[personId] = 1; out[deptId] = personId;
  });
  return out;
}
function load() {
  try {
    var raw = localStorage.getItem(KEY); if (!raw) return freshState();
    var old = JSON.parse(raw), latest = freshState();
    if (old.departments && old.departments.some(function (d) { return d.id === "event-planning"; })) {
      var priorHeads = JSON.stringify(old.heads || {});
      old.heads = uniqueHeads(old.heads);
      if (!old.versions) old.versions = [];
      if (JSON.stringify(old.heads) !== priorHeads) localStorage.setItem(KEY, JSON.stringify(old));
      return old;
    }
    latest.volunteers = old.volunteers || [];
    latest.volunteers.forEach(function (v) { if (!v.role) v.role = "Volunteer"; });
    latest.committee = old.committee || [];
    latest.heads = uniqueHeads(old.heads);
    latest.versions = old.versions || [];
    latest.audit = old.audit || latest.audit;
    var skills = latest.skills.slice();
    (old.skills || []).forEach(function (s) { if (!skills.some(function (x) { return x.name === s.name; })) skills.push(s); });
    latest.skills = skills;
    if (old.events && old.events.length) latest.events = old.events.map(function (e) {
      var next = clone(e), prior = {};
      (e.depts || []).forEach(function (d) { prior[d.id] = d; });
      next.depts = clone(latest.departments).map(function (d) { if (prior[d.id]) { ["priority", "start", "end", "required", "maxCap", "serviceMin", "peakMin"].forEach(function (k) { if (prior[d.id][k] !== undefined) d[k] = prior[d.id][k]; }); } return d; });
      return next;
    });
    latest.audit.unshift({ t: Date.now(), a: "Roster roles updated", d: "Volunteer data retained; department roles now follow the latest roster CSV." });
    localStorage.setItem(KEY, JSON.stringify(latest));
    return latest;
  } catch (e) { return freshState(); }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast("Could not save in this browser"); } }
function log(a, d) { S.audit.unshift({ t: Date.now(), a: a, d: d }); S.audit = S.audit.slice(0, 300); }
function commit() { save(); render(); }
function toast(m) { var t = document.createElement("div"); t.className = "toast"; t.textContent = m; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2400); }

/* ------------------------------------------- capacity planning + eligibility */
function toH(t) { var p = t.split(":"); return +p[0] + +p[1] / 60; }
function reqOf(d, ev) { return d.type === "throughput" ? Math.ceil(ev.attendees * d.serviceMin / d.peakMin) : +d.required || 0; }
function shiftH(d) { return toH(d.end) - toH(d.start); }
function failed(v, d) {
  var f = [];
  if (d.skill && v.skills.indexOf(d.skill) < 0) f.push("skill");
  if (v.maxHours < shiftH(d)) f.push("hours");
  if (toH(v.start) > toH(d.start) || toH(v.end) < toH(d.end)) f.push("window");
  return f;
}
function tie(v, d) { var prefs = String(v.pref || "").split(/\s*,\s*/); return v.exp + (d.prefs.some(function (p) { return prefs.indexOf(p) >= 0; }) ? 10 : 0); }
function heuristic(vols, ds, elig, ev) {
  var used = {}, plan = {}, byId = {}; vols.forEach(function (v) { byId[v.id] = v; });
  ds.forEach(function (d) { plan[d.id] = []; });
  ds.slice().sort(function (a, b) { return PR[a.priority] - PR[b.priority]; }).forEach(function (d) {
    var target = Math.min(reqOf(d, ev), d.maxCap);
    var pool = elig[d.id].filter(function (i) { return !used[i]; }).map(function (i) { return byId[i]; });
    pool.sort(function (a, b) { return (tie(b, d) - tie(a, d)) || (a.id < b.id ? -1 : 1); });
    pool.forEach(function (v) { if (plan[d.id].length < target) { plan[d.id].push(v.id); used[v.id] = 1; } });
  });
  return plan;
}
/* Exact optimum of the ILP: the model is a bipartite b-matching (totally unimodular),
   so min-cost flow returns the same optimal objective that CBC finds in Python. */
function optimal(vols, ds, elig, ev) {
  var n = vols.length, m = ds.length, N = n + m + 2, s = n + m, t = n + m + 1, E = [], g = [], i, j;
  for (i = 0; i < N; i++) g.push([]);
  function add(u, v, cap, cost) { E.push({ u: u, v: v, cap: cap, cost: cost, f: 0 }); E.push({ u: v, v: u, cap: 0, cost: -cost, f: 0 }); g[u].push(E.length - 2); g[v].push(E.length - 1); return E.length - 2; }
  var idx = {}; vols.forEach(function (v, k) { idx[v.id] = k; add(s, k, 1, 0); });
  var pairs = [];
  ds.forEach(function (d, jj) {
    add(n + jj, t, Math.min(reqOf(d, ev), d.maxCap), 0);
    elig[d.id].forEach(function (id) { var v = vols[idx[id]]; pairs.push([add(idx[id], n + jj, 1, -(PW[d.priority] * 1000 + tie(v, d))), id, d.id]); });
  });
  for (;;) {
    var dist = new Array(N).fill(Infinity), pe = new Array(N).fill(-1), inq = new Array(N).fill(false), q = [s]; dist[s] = 0;
    while (q.length) {
      var u = q.shift(); inq[u] = false;
      g[u].forEach(function (ei) { var e = E[ei]; if (e.cap - e.f > 0 && dist[u] + e.cost < dist[e.v]) { dist[e.v] = dist[u] + e.cost; pe[e.v] = ei; if (!inq[e.v]) { inq[e.v] = true; q.push(e.v); } } });
    }
    if (!(dist[t] < 0)) break;
    var x = t; while (x !== s) { var ed = E[pe[x]]; ed.f += 1; E[pe[x] ^ 1].f -= 1; x = ed.u; }
  }
  var plan = {}; ds.forEach(function (d) { plan[d.id] = []; });
  pairs.forEach(function (p) { if (E[p[0]].f > 0) plan[p[2]].push(p[1]); });
  Object.keys(plan).forEach(function (k) { plan[k].sort(); });
  return plan;
}
function evaluate(plan, ds, ev) {
  var r = { w: 0, crit: 0, full: 0, alloc: 0, req: 0, rows: [] };
  ds.forEach(function (d) {
    var rq = reqOf(d, ev), got = plan[d.id].length, sh = Math.max(rq - got, 0);
    r.w += PW[d.priority] * sh; if (d.priority === "Critical") r.crit += sh; if (!sh) r.full++; r.alloc += got; r.req += rq;
    r.rows.push({ d: d, req: rq, got: got, vac: sh });
  });
  r.cov = r.req ? Math.round(100 * r.alloc / r.req) : 0; return r;
}
function compute(ev, volunteerRows) {
  var vols = volunteerRows || S.volunteers, ds = ev.depts.filter(function (d) { return reqOf(d, ev) > 0; });
  var elig = {}; ds.forEach(function (d) { elig[d.id] = vols.filter(function (v) { return !failed(v, d).length; }).map(function (v) { return v.id; }); });
  var t0 = performance.now(), h = heuristic(vols, ds, elig, ev), t1 = performance.now(), o = optimal(vols, ds, elig, ev), t2 = performance.now();
  var plan = ev.method === "heuristic" ? h : o;
  return { ds: ds, elig: elig, heur: h, opt: o, plan: plan, mh: evaluate(h, ds, ev), mo: evaluate(o, ds, ev), m: evaluate(plan, ds, ev), th: t1 - t0, to: t2 - t1 };
}
function pct1(v) { return (+v || 0).toFixed(1) + "%"; }
function planStats(plan, ev, c, volunteers, elapsed) {
  var met = evaluate(plan, c.ds, ev), used = {}, nPref = 0, nAssigned = 0, weightedReq = 0, weightedGot = 0, coverage = [], skillBad = 0, capBad = 0;
  c.ds.forEach(function (d) {
    var ids = plan[d.id] || [], req = reqOf(d, ev), cov = req ? ids.length / req : 1;
    coverage.push(cov); weightedReq += PW[d.priority] * req; weightedGot += PW[d.priority] * Math.min(ids.length, req);
    if (ids.length > d.maxCap) capBad += ids.length - d.maxCap;
    ids.forEach(function (id) {
      used[id] = 1; nAssigned++;
      var v = volunteers.filter(function (x) { return x.id === id; })[0];
      if (v && d.skill && v.skills.indexOf(d.skill) < 0) skillBad++;
      if (v && d.prefs.some(function (p) { return String(v.pref || "").split(/\s*,\s*/).indexOf(p) >= 0; })) nPref++;
    });
  });
  var mean = coverage.length ? coverage.reduce(function (a,b) { return a+b; },0) / coverage.length : 0;
  var variance = coverage.length ? coverage.reduce(function (a,b) { return a + Math.pow(b-mean,2); },0) / coverage.length : 0;
  var eligibleUnused = volunteers.filter(function (v) { return !used[v.id] && c.ds.some(function (d) { return !failed(v,d).length; }); }).length;
  return { required: met.req, allocated: met.alloc, vacant: Math.max(0,met.req-met.alloc), coverage: met.cov,
    priorityCoverage: weightedReq ? 100*weightedGot/weightedReq : 0, prefFit: nAssigned ? 100*nPref/nAssigned : 0,
    minDeptCoverage: coverage.length ? 100*Math.min.apply(null,coverage) : 0, fairness: Math.sqrt(variance),
    skillViolations: skillBad, capacityViolations: capBad, eligibleUnassigned: eligibleUnused,
    weightedShortage: met.w, criticalShortage: met.crit, fullyStaffed: met.full, runtime: elapsed || 0 };
}
function versionNumber() { return (S.versions || []).reduce(function (n, v) { return Math.max(n, parseInt(String(v.id).replace(/\D/g,""),10) || 0); },0) + 1; }
function saveDraftVersion(ev, volunteerRows, source, scenario) {
  var c = compute(ev, volunteerRows), now = Date.now(), n = versionNumber(), people = {};
  volunteerRows.forEach(function (v) { people[v.id] = { id:v.id, name:v.name, simulated: String(v.id).indexOf("SIM-") === 0 }; });
  S.versions = S.versions || [];
  var v = { id:"v"+n, eventId:ev.id, eventName:ev.name, createdAt:now, status:"draft", source:source,
    scenario:scenario || null, eventSnapshot:clone(ev), people:people, greedyPlan:clone(c.heur), optimalPlan:clone(c.opt),
    greedyMetrics:planStats(c.heur,ev,c,volunteerRows,c.th), optimalMetrics:planStats(c.opt,ev,c,volunteerRows,c.to) };
  S.versions.unshift(v); ui.openVersionId = v.id; log("Draft created", v.id + " for " + ev.name + " (" + source + ")"); save();
  return v;
}
function bottleneck(c, ev) {
  return c.m.rows.map(function (r) {
    var pool = c.elig[r.d.id].length, cause = "Fully staffed";
    if (r.vac) cause = r.req > r.d.maxCap ? "Capacity-constrained" : (pool >= r.req ? "Eligibility-constrained (pool shared with higher-priority depts)" : "Eligibility-constrained");
    return { r: r, pool: pool, cause: cause };
  });
}
function recommendations(c, ev) {
  var used = {}, out = []; Object.keys(c.plan).forEach(function (k) { c.plan[k].forEach(function (i) { used[i] = 1; }); });
  var free = S.volunteers.filter(function (v) { return !used[v.id]; });
  c.m.rows.forEach(function (r) {
    if (!r.vac) return; var d = r.d, cand = [];
    free.forEach(function (v) { var f = failed(v, d); if (f.length === 1) cand.push([v, f[0]]); });
    cand.sort(function (a, b) { return (b[0].exp - a[0].exp) || (a[0].id < b[0].id ? -1 : 1); });
    cand.slice(0, r.vac).forEach(function (p) {
      var act = { skill: "acquire the '" + d.skill + "' skill", hours: "extend max hours to " + shiftH(d) + " h", window: "widen availability to " + d.start + "-" + d.end }[p[1]];
      out.push(d.name + ": ask " + p[0].id + " " + p[0].name + " to " + act + " (then eligible).");
    });
    if (cand.length < r.vac) out.push(d.name + ": recruit " + (r.vac - cand.length) + " more volunteer(s) available " + d.start + "-" + d.end + ".");
    if (r.req > d.maxCap) out.push(d.name + ": physical capacity (" + d.maxCap + ") is below the requirement - raise it.");
  });
  return out;
}

/* ----------------------------------------------------------------- helpers */
function fmtDate(s) { var p = s.split("-"); return p[2] + "/" + p[1] + "/" + p[0]; }
function byName(id) { var v = S.volunteers.filter(function (x) { return x.id === id; })[0]; return v; }
function evById(id) { return S.events.filter(function (e) { return e.id === id; })[0]; }
function skillChips(v) { return v.skills.length ? v.skills.map(function (s) { return '<span class="chip s">' + esc(s) + "</span>"; }).join("") : '<span class="mut">None</span>'; }
function covBar(p) { var c = p >= 100 ? "" : p >= 50 ? "mid" : "low"; return '<div class="cov"><div class="bar"><i class="' + c + '" style="width:' + Math.min(p, 100) + '%"></i></div>' + p + "%</div>"; }
function pctOf(a, b) { return b ? Math.round(100 * a / b) : 0; }
function prefOptions() { var o = []; S.departments.forEach(function (d) { d.prefs.forEach(function (p) { if (o.indexOf(p) < 0) o.push(p); }); }); return o.sort(); }
function empty(t) { return '<div class="empty">' + t + "</div>"; }

/* ------------------------------------------------------------- SVG charts */
function hbars(rows, series, o) {
  o = o || {}; var lw = o.lw || 165, W = 470, rh = series.length * 15 + 12, H = rows.length * rh + 8, max = 0;
  rows.forEach(function (r) { r.v.forEach(function (x) { if (x > max) max = x; }); }); max = max || 1;
  var bw = W - lw - 40, out = '<svg viewBox="0 0 ' + W + " " + H + '" width="100%" role="img" aria-label="' + esc(o.label || "chart") + '">';
  rows.forEach(function (r, i) {
    var y = 4 + i * rh; out += '<text x="' + (lw - 8) + '" y="' + (y + rh / 2 + 3) + '" text-anchor="end">' + esc(r.l.length > 28 ? r.l.slice(0, 27) + "…" : r.l) + "</text>";
    r.v.forEach(function (x, k) {
      var w = Math.max(x / max * bw, x ? 2 : 0), yy = y + 3 + k * 15;
      out += '<rect x="' + lw + '" y="' + yy + '" width="' + w + '" height="11" rx="2" fill="' + series[k].c + '"/><text x="' + (lw + w + 5) + '" y="' + (yy + 9.500) + '">' + x + "</text>";
    });
  });
  var lg = series.length > 1 ? '<div class="legend">' + series.map(function (s) { return '<span><i style="background:' + s.c + '"></i>' + esc(s.n) + "</span>"; }).join("") + "</div>" : "";
  return out + "</svg>" + lg;
}
var ORG = "#C2571A", SAND = "#CFC6B8", GRN = "#2F7D4B";

/* ------------------------------------------------------------------- views */
function renderDashboard() {
  var ev = evById(ui.dashEvent) || S.events[0];
  if (!ev) return head("Organizer Dashboard", "Committee staffing overview across upcoming events", true) + '<div class="card">' + empty("No events yet. Add one from Events &amp; Staffing.") + "</div>";
  ui.dashEvent = ev.id; var c = compute(ev), m = c.m;
  var up = S.events.filter(function (e) { return e.status === "Upcoming"; }).length;
  var h = head("Organizer Dashboard", "Committee staffing overview across upcoming events", true);
  h += '<section class="kpis">' +
    kpi("Upcoming Events", up, "Cultural Committee Calendar", "cal", "") + kpi("Total Required Positions", m.req, esc(ev.name), "users", "") +
    kpi("Allocated Staff", m.alloc, m.cov + "% coverage for " + esc(ev.name), "check", "g") + kpi("Vacant Positions", m.req - m.alloc, "Awaiting assignment", "warn", "a") + "</section>";
  h += '<section class="grid2"><div class="card"><header><h2>Upcoming Cultural Events</h2></header><div class="tbl-wrap"><table><thead><tr><th>Event Name</th><th>Dates</th><th>Status</th><th>Staffing</th><th>Action</th></tr></thead><tbody>';
  S.events.forEach(function (e) {
    var x = compute(e).m;
    h += "<tr><td><b>" + esc(e.name) + "</b><small>" + esc(e.venue) + '</small></td><td>' + fmtDate(e.date) + '</td><td><span class="pill">' + esc(e.status) + '</span></td><td class="staff"><b>' + x.alloc + "</b> <span>/ " + x.req + '</span></td><td><button class="btn sm" data-go="events:' + e.id + '">Manage ' + svg("arrow") + "</button></td></tr>";
  });
  h += "</tbody></table></div></div>";
  h += '<div class="card"><header><div><h2>' + esc(ev.name) + ' Department Coverage</h2><p>Click a department to see its assigned volunteers.</p></div><label class="evsel">Event <select id="dashSel" aria-label="Event">' +
    S.events.map(function (e) { return '<option value="' + e.id + '"' + (e.id === ev.id ? " selected" : "") + ">" + esc(e.name) + "</option>"; }).join("") + "</select></label></header>";
  h += '<div class="tbl-wrap"><table><thead><tr><th>Department</th><th>Required</th><th>Allocated</th><th>Vacant</th><th>Coverage</th></tr></thead><tbody>';
  m.rows.forEach(function (r) {
    var k = ev.id + r.d.id, open = ui.open[k], p = pctOf(r.got, r.req), hd = S.committee.concat(S.volunteers).filter(function (x) { return x.id === S.heads[r.d.id]; })[0];
    h += '<tr class="dept' + (open ? " open" : "") + '" data-dept="' + k + '" tabindex="0"><td><span class="chev">' + svg("chev").replace("<svg", '<svg width="14" height="14" style="stroke:currentColor;fill:none;stroke-width:2"') + "</span> " + esc(r.d.name) + "</td><td>" + r.req + '</td><td class="' + (r.got ? "ok" : "bad") + '"><b>' + r.got + '</b></td><td class="' + (r.vac ? "bad" : "") + '">' + r.vac + "</td><td>" + covBar(p) + "</td></tr>";
    if (open) {
      h += '<tr class="detail"><td colspan="5"><div class="headline">Shift ' + r.d.start + "-" + r.d.end + " &middot; " + esc(r.d.priority) + " priority &middot; Department head: <b>" + (hd ? esc(hd.name) : "not assigned") + "</b></div><div class=\"vlist\">" +
        (c.plan[r.d.id].length ? c.plan[r.d.id].map(function (id) { var v = byName(id); return '<span class="vchip">' + esc(v.name) + "<small>" + id + " &middot; " + esc(v.phone) + "</small></span>"; }).join("") : '<span class="mut">No volunteers assigned yet.</span>') + "</div></td></tr>";
    }
  });
  h += "</tbody></table></div></div></section>";
  /* analytics */
  var rows = m.rows.map(function (r) { return { l: r.d.name, v: [r.req, r.got] }; });
  var pool = m.rows.map(function (r) { return { l: r.d.name, v: [r.req, c.elig[r.d.id].length] }; });
  h += '<section class="charts"><div class="card"><h2>Required vs allocated</h2><p class="note">Optimised plan for ' + esc(ev.name) + "</p>" + hbars(rows, [{ n: "Required", c: SAND }, { n: "Allocated", c: ORG }], { label: "Required versus allocated staff" }) + "</div>" +
    '<div class="card"><h2>Eligible pool vs requirement</h2><p class="note">Volunteers meeting skill, hours and availability rules. Thin pools are the bottlenecks.</p>' + hbars(pool, [{ n: "Required", c: SAND }, { n: "Eligible volunteers", c: GRN }], { label: "Eligible pool versus requirement" }) + "</div>" +
    '<div class="card"><h2>Heuristic vs optimised</h2><p class="note">Same data, same eligibility rules.</p>' + hbars([{ l: "Weighted shortage", v: [c.mh.w, c.mo.w] }, { l: "Critical shortage", v: [c.mh.crit, c.mo.crit] }, { l: "Vacant positions", v: [c.mh.req - c.mh.alloc, c.mo.req - c.mo.alloc] }], [{ n: "Heuristic", c: SAND }, { n: "Optimised (ILP)", c: GRN }], { lw: 130, label: "Heuristic versus optimised shortage" }) + "</div></section>";
  return h;
}
function kpi(l, v, n, ic, cl) { return '<div class="kpi ' + cl + '"><div class="l">' + l + svg(ic) + '</div><div class="v">' + v + '</div><div class="n">' + n + "</div></div>"; }
function head(t, s, cm) { return '<div class="top"><div><h1>' + t + '</h1><p class="sub">' + s + "</p></div>" + (cm ? '<a class="btn" href="#committee">' + svg("userset") + " Manage Core Committee</a>" : "") + "</div>"; }

function renderEvents() {
  var h = head("Events & Staffing", "Add upcoming events, tune department requirements and run the allocation");
  h += '<div class="card"><header><div><h2>Add upcoming event</h2></div></header><div class="formgrid">' +
    '<label class="f">Event name<input type="text" id="evName" placeholder="e.g. Kala Fest"></label><label class="f">Venue<input type="text" id="evVenue"></label>' +
    '<label class="f">Date<input type="date" id="evDate"></label><label class="f">Expected attendees<input type="number" id="evAtt" value="300" min="1"></label>' +
    '<button class="btn solid" id="evAdd">Add event</button></div></div>';
  h += '<div class="card"><header><h2>All events</h2></header>';
  if (!S.events.length) h += empty("No events yet."); else {
    h += '<div class="tbl-wrap"><table><thead><tr><th>Event</th><th>Date</th><th>Attendees</th><th>Status</th><th>Staffing</th><th>Action</th></tr></thead><tbody>';
    S.events.forEach(function (e) {
      var x = compute(e).m;
      h += "<tr><td><b>" + esc(e.name) + "</b><small>" + esc(e.venue) + "</small></td><td>" + fmtDate(e.date) + "</td><td>" + e.attendees + '</td><td><select data-st="' + e.id + '">' +
        ["Upcoming", "Completed"].map(function (s) { return "<option" + (s === e.status ? " selected" : "") + ">" + s + "</option>"; }).join("") + '</select></td><td class="staff"><b>' + x.alloc + "</b> <span>/ " + x.req + '</span></td><td><div class="row"><button class="btn sm" data-sel="' + e.id + '">Manage</button><button class="btn sm danger" data-delev="' + e.id + '">Delete</button></div></td></tr>';
    });
    h += "</tbody></table></div>";
  }
  h += "</div>";
  var ev = evById(ui.evSel);
  if (ev) h += eventDetail(ev);
  return h;
}
function eventDetail(ev) {
  var c = compute(ev), m = c.m, h = '<div class="card"><header><div><h2>Staffing plan: ' + esc(ev.name) + "</h2><p>Layer 1 sets the required headcount; Layer 2 assigns volunteers.</p></div>" +
    '<div class="tabs" role="group" aria-label="Allocation method"><button data-method="optimal" class="' + (ev.method !== "heuristic" ? "on" : "") + '">Optimised (ILP)</button><button data-method="heuristic" class="' + (ev.method === "heuristic" ? "on" : "") + '">Heuristic</button></div></header>';
  h += '<h3>Layer 1 - capacity planning (editable)</h3><div class="tbl-wrap cfg"><table><thead><tr><th>Department</th><th>Priority</th><th>Shift</th><th>Skill</th><th>Required</th><th>Max cap</th></tr></thead><tbody>';
  ev.depts.forEach(function (d) {
    var rq = d.type === "throughput" ? '<input type="number" step="0.1" min="0.1" data-cfg="serviceMin" data-d="' + d.id + '" value="' + d.serviceMin + '" title="Service time (min) per attendee"> min &divide; <input type="number" data-cfg="peakMin" data-d="' + d.id + '" value="' + d.peakMin + '" min="1" title="Peak window (min)"> min = <b>' + reqOf(d, ev) + "</b>"
      : '<input type="number" min="0" data-cfg="required" data-d="' + d.id + '" value="' + d.required + '">';
    h += "<tr><td>" + esc(d.name) + '</td><td><select data-cfg="priority" data-d="' + d.id + '">' + ["Critical", "High", "Normal"].map(function (p) { return "<option" + (p === d.priority ? " selected" : "") + ">" + p + "</option>"; }).join("") + '</select></td><td><input type="time" data-cfg="start" data-d="' + d.id + '" value="' + d.start + '"> - <input type="time" data-cfg="end" data-d="' + d.id + '" value="' + d.end + '"></td><td><select data-cfg="skill" data-d="' + d.id + '"><option value="">None</option>' +
      S.skills.map(function (s) { return "<option" + (s.name === d.skill ? " selected" : "") + ">" + esc(s.name) + "</option>"; }).join("") + "</select></td><td>" + rq + '</td><td><input type="number" min="1" data-cfg="maxCap" data-d="' + d.id + '" value="' + d.maxCap + '"></td></tr>';
  });
  h += "</tbody></table></div>";
  h += '<p class="note" style="margin-top:8px">Throughput departments use Required = CEILING(attendees &times; service time &divide; peak window). Set Required to 0 to exclude a department from this event.</p>';
  h += '<h3 style="margin-top:20px">Layer 2 - allocation result (' + (ev.method === "heuristic" ? "Heuristic" : "Optimised") + ')</h3><div class="tbl-wrap"><table><thead><tr><th>Department</th><th>Required</th><th>Eligible pool</th><th>Allocated</th><th>Vacant</th><th>Bottleneck</th></tr></thead><tbody>';
  bottleneck(c, ev).forEach(function (b) { h += "<tr><td>" + esc(b.r.d.name) + "<small>" + b.r.d.priority + "</small></td><td>" + b.r.req + "</td><td>" + b.pool + '</td><td class="ok"><b>' + b.r.got + '</b></td><td class="' + (b.r.vac ? "bad" : "") + '">' + b.r.vac + '</td><td class="' + (b.r.vac ? "bad" : "mut") + '">' + b.cause + "</td></tr>"; });
  h += "</tbody></table></div>";
  var bo = function (a, b, low) { return (low ? a <= b : a >= b) ? "best" : ""; };
  h += '<h3 style="margin-top:20px">Heuristic vs optimised comparison</h3><div class="tbl-wrap"><table class="cmp"><thead><tr><th>Metric</th><th>Heuristic</th><th>Optimised (ILP)</th></tr></thead><tbody>' +
    "<tr><td>Priority-weighted shortage</td><td class=\"" + bo(c.mh.w, c.mo.w, 1) + '">' + c.mh.w + '</td><td class="' + bo(c.mo.w, c.mh.w, 1) + '">' + c.mo.w + "</td></tr>" +
    "<tr><td>Critical-department shortage</td><td>" + c.mh.crit + "</td><td>" + c.mo.crit + "</td></tr><tr><td>Departments fully staffed</td><td>" + c.mh.full + "</td><td>" + c.mo.full + "</td></tr>" +
    "<tr><td>Volunteers allocated</td><td>" + c.mh.alloc + "</td><td>" + c.mo.alloc + "</td></tr><tr><td>Computation time (browser)</td><td>" + c.th.toFixed(2) + " ms</td><td>" + c.to.toFixed(2) + " ms</td></tr></tbody></table></div>";
  var recs = recommendations(c, ev);
  h += '<h3 style="margin-top:20px">Recommendations</h3>' + (recs.length ? '<ul class="recs">' + recs.map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") + "</ul>" : '<p class="note">All departments are fully staffed - no action needed.</p>');
  h += '<h3 style="margin-top:20px">Assigned volunteers</h3>';
  c.m.rows.forEach(function (r) {
    h += '<p class="headline"><b>' + esc(r.d.name) + "</b> (" + r.got + "/" + r.req + ", " + r.d.start + "-" + r.d.end + ")</p><div class=\"vlist\" style=\"margin-bottom:14px\">" +
      (c.plan[r.d.id].map(function (id) { var v = byName(id); return '<span class="vchip">' + esc(v.name) + "<small>" + id + (r.d.prefs.indexOf(v.pref) >= 0 ? " &middot; preferred" : "") + "</small></span>"; }).join("") || '<span class="mut">none</span>') + "</div>";
  });
  return h + "</div>";
}

function renderRoster() {
  var q = ui.q.toLowerCase(), list = S.volunteers.filter(function (v) {
    return (!q || (v.name + v.id + v.phone + v.pref).toLowerCase().indexOf(q) >= 0) && (!ui.skillF || (ui.skillF === "__none" ? !v.skills.length : v.skills.indexOf(ui.skillF) >= 0));
  });
  var ev = evById(ui.dashEvent) || S.events[0], asg = {};
  if (ev) { var c = compute(ev); Object.keys(c.plan).forEach(function (k) { c.plan[k].forEach(function (i) { asg[i] = c.ds.filter(function (d) { return d.id === k; })[0].name; }); }); }
  var h = head("Volunteers Roster", S.volunteers.length + " volunteers registered. Add individuals or import a CSV.");
  h += '<div class="card"><header><div class="row"><input type="search" id="rq" placeholder="Search name, ID, phone" value="' + esc(ui.q) + '" aria-label="Search volunteers"><select id="rsk" aria-label="Filter by skill"><option value="">All skills</option><option value="__none"' + (ui.skillF === "__none" ? " selected" : "") + ">No skills</option>" +
    S.skills.map(function (s) { return "<option" + (s.name === ui.skillF ? " selected" : "") + ">" + esc(s.name) + "</option>"; }).join("") + "</select></div>" +
    '<div class="row"><button class="btn solid" id="vAdd">Add volunteer</button><label class="btn" for="csvIn">Import CSV</label><input type="file" id="csvIn" accept=".csv" hidden><button class="btn ghost" id="csvOut">Download CSV</button></div></header>';
  h += '<p class="note">Showing ' + list.length + (ev ? " &middot; assignment column shows the " + esc(ev.name) + " plan" : "") + "</p>";
  h += '<div class="tbl-wrap" style="max-height:560px;overflow:auto"><table><thead><tr><th>ID</th><th>Name</th><th>Phone</th><th>Skills</th><th>Availability</th><th>Max hrs</th><th>Exp</th><th>Position</th><th>Preferred roles</th><th>Assigned to</th><th></th></tr></thead><tbody>';
  list.forEach(function (v) {
    h += "<tr><td>" + esc(v.id) + "</td><td><b>" + esc(v.name) + "</b></td><td>" + esc(v.phone) + "</td><td><div class=\"chips\">" + skillChips(v) + "</div></td><td>" + esc(v.start) + "-" + esc(v.end) + "</td><td>" + esc(v.maxHours) + "</td><td>" + esc(v.exp) + "</td><td>" + esc(v.role || "Volunteer") + "</td><td>" + esc(v.pref || "-") + "</td><td>" + (asg[v.id] ? esc(asg[v.id]) : '<span class="mut">-</span>') + '</td><td><div class="row"><button class="btn sm" data-vedit="' + esc(v.id) + '">Edit</button><button class="btn sm danger" data-vdel="' + esc(v.id) + '">Delete</button></div></td></tr>';
  });
  h += "</tbody></table></div></div>";
  var cnt = function (f) { var o = {}; S.volunteers.forEach(function (v) { var k = f(v); o[k] = (o[k] || 0) + 1; }); return Object.keys(o).sort().map(function (k) { return { l: k, v: [o[k]] }; }); };
  var sk = S.skills.map(function (s) { return { l: s.name, v: [S.volunteers.filter(function (v) { return v.skills.indexOf(s.name) >= 0; }).length] }; });
  h += '<section class="charts"><div class="card"><h2>Availability windows</h2>' + hbars(cnt(function (v) { return v.start + "-" + v.end; }), [{ n: "Volunteers", c: ORG }], { lw: 90 }) + "</div>" +
    '<div class="card"><h2>Experience (years)</h2>' + hbars(cnt(function (v) { return v.exp + (v.exp === 3 ? "+ yrs" : " yrs"); }), [{ n: "Volunteers", c: GRN }], { lw: 90 }) + "</div>" +
    '<div class="card"><h2>Skills held</h2>' + hbars(sk, [{ n: "Volunteers", c: ORG }], { lw: 110 }) + "</div></section>";
  return h;
}
function volDialog(id) {
  var v = id ? byName(id) : { name: "", phone: "", skills: [], start: "09:00", end: "21:00", maxHours: 4, exp: 0, pref: "", role: "Volunteer" };
  return '<form method="dialog" id="vf"><h2>' + (id ? "Edit volunteer " + id : "Add volunteer") + '</h2><div class="formgrid" style="margin:14px 0">' +
    '<label class="f">Full name<input type="text" id="vn" required value="' + esc(v.name) + '"></label><label class="f">Phone<input type="tel" id="vp" value="' + esc(v.phone) + '"></label>' +
    '<label class="f">Available from<input type="time" id="vs" value="' + v.start + '"></label><label class="f">Available until<input type="time" id="ve" value="' + v.end + '"></label>' +
    '<label class="f">Max working hours<input type="number" id="vh" step="0.5" min="1" value="' + v.maxHours + '"></label><label class="f">Experience<select id="vx">' +
    [0, 1, 2, 3].map(function (x) { return '<option value="' + x + '"' + (x === v.exp ? " selected" : "") + ">" + (x === 3 ? "3+ yrs" : x + (x === 1 ? " yr" : " yrs")) + "</option>"; }).join("") + '</select></label>' +
    '<label class="f">Portal position<select id="vr"><option' + ((v.role || "Volunteer") === "Volunteer" ? " selected" : "") + '>Volunteer</option><option' + (v.role === "Department Head" ? " selected" : "") + '>Department Head</option></select></label><label class="f">Preferred roles<select id="vd" multiple size="4">' + prefOptions().map(function (p) { return "<option" + (String(v.pref || "").split(/\s*,\s*/).indexOf(p) >= 0 ? " selected" : "") + ">" + esc(p) + "</option>"; }).join("") + "</select><small>Choose one or more from the CSV preference list.</small></label></div>" +
    '<p class="note">Skills (from the Skills Catalog)</p><div class="chips" style="margin-bottom:18px">' + S.skills.map(function (s) { return '<label class="tick"><input type="checkbox" name="sk" value="' + esc(s.name) + '"' + (v.skills.indexOf(s.name) >= 0 ? " checked" : "") + ">" + esc(s.name) + "</label>"; }).join("") + '</div>' +
    '<div class="row spread"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn solid" value="ok">Save</button></div></form>';
}
function nextVid() { var mx = 0; S.volunteers.forEach(function (v) { var n = parseInt(v.id.replace(/\D/g, ""), 10); if (n > mx) mx = n; }); return "V" + String(mx + 1).padStart(3, "0"); }

function renderCommittee() {
  var h = head("Manage Core Committee", "Add core committee members and appoint department heads");
  h += '<div class="card"><header><h2>Add core committee member</h2></header><div class="formgrid"><label class="f">Name<input type="text" id="cmN"></label><label class="f">Role<input type="text" id="cmR" value="Core Committee Member"></label><label class="f">Email<input type="email" id="cmE"></label><label class="f">Phone<input type="tel" id="cmP"></label><button class="btn solid" id="cmAdd">Add member</button></div></div>';
  h += '<section class="committee-grid"><div class="card"><header><h2>Core committee (' + S.committee.length + ")</h2></header>";
  if (!S.committee.length) h += empty("No members yet."); else {
    h += '<div class="tbl-wrap"><table><thead><tr><th>Name</th><th>Role</th><th>Heads</th><th></th></tr></thead><tbody>';
    S.committee.forEach(function (m) {
      var hs = S.departments.filter(function (d) { return S.heads[d.id] === m.id; });
      h += "<tr><td><b>" + esc(m.name) + "</b><small>" + esc(m.email || m.phone || "") + "</small></td><td>" + esc(m.role) + "</td><td>" + (hs.length ? hs.map(function (d) { return '<span class="chip s">' + esc(d.name) + "</span>"; }).join(" ") : '<span class="mut">-</span>') + '</td><td><button class="btn sm danger" data-cmdel="' + m.id + '">Remove</button></td></tr>';
    });
    h += "</tbody></table></div>";
  }
  h += '</div><div class="card"><header><div><h2>Department heads</h2><p>Each committee member or volunteer can head one department only. Choose them in the manual allocation column.</p></div></header><div class="tbl-wrap head-assignments"><table><thead><tr><th>Department</th><th>Department head position</th><th>Manual allocation</th></tr></thead><tbody>';
  S.departments.forEach(function (d) {
    var candidates = S.committee.concat(S.volunteers).filter(function (m) {
      return !Object.keys(S.heads).some(function (deptId) { return deptId !== d.id && S.heads[deptId] === m.id; });
    });
    h += "<tr><td><b>" + esc(d.name) + '</b></td><td><span class="pill">Department Head</span></td><td><select data-head="' + esc(d.id) + '" aria-label="Manual head allocation for ' + esc(d.name) + '"><option value="">Unassigned</option>' + candidates.map(function (m) { return '<option value="' + esc(m.id) + '"' + (S.heads[d.id] === m.id ? " selected" : "") + ">" + esc(m.name) + (m.role === "Department Head" ? " — Department Head" : "") + "</option>"; }).join("") + "</select></td></tr>";
  });
  if (!S.committee.length && !S.volunteers.length) h += '<tr><td colspan="3"><span class="mut">Import the volunteer CSV or add committee members to populate the manual allocation choices.</span></td></tr>';
  return h + "</tbody></table></div></div></section>";
}

function renderSkills() {
  var h = head("Skills Catalog", "Define skills, then attach them to volunteers. Departments can require a skill.");
  h += '<div class="card"><header><h2>Add skill</h2></header><div class="formgrid"><label class="f">Skill name<input type="text" id="skN" placeholder="e.g. Photography"></label><label class="f" style="grid-column:span 2">Description<input type="text" id="skD"></label><button class="btn solid" id="skAdd">Add skill</button></div></div>';
  h += '<div class="card"><header><h2>Catalog (' + S.skills.length + ")</h2></header>";
  if (!S.skills.length) h += empty("No skills."); else {
    h += '<div class="tbl-wrap"><table><thead><tr><th>Skill</th><th>Description</th><th>Volunteers</th><th>Required by</th><th></th></tr></thead><tbody>';
    S.skills.forEach(function (s) {
      var n = S.volunteers.filter(function (v) { return v.skills.indexOf(s.name) >= 0; }).length, rb = S.departments.filter(function (d) { return d.skill === s.name; }).map(function (d) { return d.name; });
      h += "<tr><td><b>" + esc(s.name) + "</b></td><td>" + esc(s.desc) + "</td><td>" + n + "</td><td>" + (rb.length ? esc(rb.join(", ")) : '<span class="mut">-</span>') + '</td><td><div class="row"><button class="btn sm" data-skas="' + esc(s.name) + '">Assign to volunteers</button><button class="btn sm danger" data-skdel="' + esc(s.name) + '">Delete</button></div></td></tr>';
    });
    h += "</tbody></table></div>";
  }
  var sk = S.skills.map(function (s) { return { l: s.name, v: [S.volunteers.filter(function (v) { return v.skills.indexOf(s.name) >= 0; }).length] }; });
  return h + '</div><div class="card"><h2>Skill supply</h2><p class="note">Volunteers holding each skill</p>' + hbars(sk, [{ n: "Volunteers", c: ORG }], { lw: 110 }) + "</div>";
}
function skillDialog(name) {
  var h = '<form method="dialog" id="sf" data-skill="' + esc(name) + '"><h2>Assign "' + esc(name) + '"</h2><p class="note">Tick the volunteers who hold this skill.</p><input type="search" id="sq" placeholder="Filter volunteers" style="width:100%;margin-bottom:10px"><div id="sl" style="max-height:340px;overflow:auto;display:flex;flex-direction:column;gap:2px">';
  S.volunteers.forEach(function (v) { h += '<label class="tick" style="border-radius:6px" data-n="' + esc((v.name + v.id).toLowerCase()) + '"><input type="checkbox" value="' + v.id + '"' + (v.skills.indexOf(name) >= 0 ? " checked" : "") + "> " + esc(v.name) + ' <span class="mut">' + v.id + "</span></label>"; });
  return h + '</div><div class="row spread" style="margin-top:16px"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn solid" value="ok">Save</button></div></form>';
}

function renderAudit() {
  var h = head("Audit History", "Every change made in this dashboard");
  h += '<div class="card"><header><h2>Activity (' + S.audit.length + ')</h2><button class="btn danger" id="reset">Reset to demo data</button></header><div class="tbl-wrap"><table><thead><tr><th>When</th><th>Action</th><th>Details</th></tr></thead><tbody>';
  S.audit.forEach(function (a) { h += "<tr><td>" + new Date(a.t).toLocaleString() + "</td><td><b>" + esc(a.a) + "</b></td><td>" + esc(a.d) + "</td></tr>"; });
  return h + "</tbody></table></div></div>";
}

function renderGreedy() {
  var ev = evById(ui.greedyEvent) || S.events[0];
  if (!ev) return head("Greedy Allocation", "Priority-first volunteer assignment") + '<div class="card">' + empty("Add an event in Events & Staffing to preview a greedy plan.") + "</div>";
  ui.greedyEvent = ev.id;
  var c = compute(ev), m = evaluate(c.heur, c.ds, ev), h = head("Greedy Allocation", "A fast, explainable plan that fills higher-priority departments first.");
  h += '<div class="card"><header><div><h2>Preview a greedy plan</h2><p>Choose an event to see the greedy assignments beside the optimised result.</p></div><label class="evsel">Event <select id="greedyEvent">' +
    S.events.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === ev.id ? " selected" : "") + ">" + esc(x.name) + "</option>"; }).join("") + '</select></label></header>' +
    '<section class="kpis">' + kpi("Greedy allocated", m.alloc, m.cov + "% coverage", "check", "g") + kpi("Vacant positions", m.req - m.alloc, "Greedy plan", "warn", "a") + kpi("Weighted shortage", m.w, "Greedy plan", "grid", "") + kpi("Optimised shortage", c.mo.w, "For comparison", "simulate", "") + '</section>' +
    '<p class="note">The greedy method sorts departments by priority, then eligible volunteers by preference and experience. Earlier assignments can use a volunteer another department also needs.</p>' +
    '<div class="tbl-wrap"><table><thead><tr><th>Priority</th><th>Department</th><th>Required</th><th>Greedy assigned</th><th>Vacant</th><th>Assigned volunteers</th></tr></thead><tbody>';
  m.rows.forEach(function (r) {
    var names = c.heur[r.d.id].map(function (id) { var v = byName(id); return v ? esc(v.name) + ' <small>' + esc(id) + '</small>' : esc(id); });
    h += '<tr><td>' + esc(r.d.priority) + '</td><td><b>' + esc(r.d.name) + '</b></td><td>' + r.req + '</td><td class="ok"><b>' + r.got + '</b></td><td class="' + (r.vac ? "bad" : "ok") + '">' + r.vac + '</td><td>' + (names.length ? names.join(", ") : '<span class="mut">None assigned</span>') + '</td></tr>';
  });
  h += '</tbody></table></div><div class="row" style="margin-top:16px"><button class="btn solid" data-apply-greedy="' + esc(ev.id) + '"' + (ev.method === "heuristic" ? " disabled" : "") + '>Use greedy plan for this event</button><span class="note">' + (ev.method === "heuristic" ? "This event already uses the greedy plan." : "Applying updates the event’s selected allocation method.") + '</span></div></div>';
  return h;
}

function renderSimulator() {
  var ev = evById(ui.simEvent) || S.events[0];
  if (!ev) return head("What-if Simulator", "Try staffing changes without editing the saved event") + '<div class="card">' + empty("Add an event in Events & Staffing to run a scenario.") + "</div>";
  if (ui.simEvent !== ev.id) { ui.simEvent = ev.id; ui.simAttendees = ev.attendees; ui.simMethod = ev.method || "optimal"; ui.simDepts = {}; }
  var base = compute(ev), trial = clone(ev);
  trial.attendees = Math.max(0, +ui.simAttendees || 0); trial.method = ui.simMethod || "optimal";
  trial.depts = trial.depts.map(function (d) {
    var o = ui.simDepts[d.id] || {};
    if (o.required !== undefined) { d.required = Math.max(0, +o.required || 0); d.type = "fixed"; }
    if (o.maxCap !== undefined) d.maxCap = Math.max(0, +o.maxCap || 0);
    if (o.priority) d.priority = o.priority;
    return d;
  });
  var sim = compute(trial), bm = base.m, sm = sim.m;
  var h = head("What-if Simulator", "Adjust a copy of an event and compare the results. Scenarios do not change saved event settings.");
  h += '<div class="card"><header><div><h2>Scenario inputs</h2><p>Changes below are temporary and stay on this screen.</p></div></header><div class="formgrid">' +
    '<label class="f">Event<select id="simEvent">' + S.events.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === ev.id ? " selected" : "") + ">" + esc(x.name) + "</option>"; }).join("") + '</select></label>' +
    '<label class="f">Expected attendees<input type="number" min="0" id="simAttendees" value="' + esc(trial.attendees) + '"></label>' +
    '<label class="f">Scenario allocation method<select id="simMethod"><option value="optimal"' + (trial.method === "optimal" ? " selected" : "") + '>Optimised</option><option value="heuristic"' + (trial.method === "heuristic" ? " selected" : "") + '>Greedy</option></select></label></div>' +
    '<h3 style="margin-top:20px">Department assumptions</h3><p class="note">Override required staff, capacity, or priority for this scenario. Attendee changes affect throughput departments unless you override their required staff.</p>' +
    '<div class="tbl-wrap cfg"><table><thead><tr><th>Department</th><th>Priority</th><th>Required staff</th><th>Max capacity</th></tr></thead><tbody>';
  ev.depts.forEach(function (d) {
    var o = ui.simDepts[d.id] || {}, required = o.required !== undefined ? o.required : reqOf(d, trial), cap = o.maxCap !== undefined ? o.maxCap : d.maxCap, priority = o.priority || d.priority;
    h += '<tr><td>' + esc(d.name) + '</td><td><select data-sim-dept="' + esc(d.id) + '" data-sim-field="priority">' + ["Critical", "High", "Normal"].map(function (p) { return '<option' + (p === priority ? " selected" : "") + '>' + p + '</option>'; }).join("") + '</select></td>' +
      '<td><input type="number" min="0" data-sim-dept="' + esc(d.id) + '" data-sim-field="required" value="' + esc(required) + '"></td>' +
      '<td><input type="number" min="0" data-sim-dept="' + esc(d.id) + '" data-sim-field="maxCap" value="' + esc(cap) + '"></td></tr>';
  });
  h += '</tbody></table></div></div><section class="kpis" style="margin-top:20px">' +
    kpi("Current coverage", bm.cov + "%", bm.alloc + " / " + bm.req + " positions", "grid", "") + kpi("Scenario coverage", sm.cov + "%", sm.alloc + " / " + sm.req + " positions", "check", "g") +
    kpi("Current weighted shortage", bm.w, "Selected event plan", "warn", "a") + kpi("Scenario weighted shortage", sm.w, trial.method === "heuristic" ? "Greedy plan" : "Optimised plan", "warn", "a") + '</section>' +
    '<div class="card"><header><h2>Current plan vs scenario</h2></header><div class="tbl-wrap"><table><thead><tr><th>Department</th><th>Current required</th><th>Scenario required</th><th>Current allocated</th><th>Scenario allocated</th><th>Scenario vacancies</th></tr></thead><tbody>';
  sm.rows.forEach(function (r) {
    var old = bm.rows.filter(function (x) { return x.d.id === r.d.id; })[0];
    h += '<tr><td><b>' + esc(r.d.name) + '</b></td><td>' + (old ? old.req : 0) + '</td><td>' + r.req + '</td><td>' + (old ? old.got : 0) + '</td><td class="ok"><b>' + r.got + '</b></td><td class="' + (r.vac ? "bad" : "ok") + '">' + r.vac + '</td></tr>';
  });
  return h + '</tbody></table></div></div>';
}

/* ---------------------------------------------------------------- routing */
function metricCard(title, m, selected) {
  return '<div class="card compare-card' + (selected ? ' selected' : '') + '"><header><b>' + esc(title) + '</b><span class="pill">' + (selected ? 'Selected draft' : 'Compared') + '</span></header>' +
    '<p>Filled ' + m.allocated + '/' + m.required + ' | Priority cov. ' + pct1(m.priorityCoverage) + ' | Pref fit ' + pct1(m.prefFit) + '</p>' +
    '<p>Min dept cov. ' + pct1(m.minDeptCoverage) + ' | Fairness std ' + m.fairness.toFixed(3) + '</p>' +
    '<p>Skill violations ' + m.skillViolations + ' | Capacity violations ' + m.capacityViolations + ' | ' + m.runtime.toFixed(1) + ' ms</p></div>';
}
function versionAssignments(v, plan, deptId) {
  return (plan[deptId] || []).map(function (id) { var p = v.people && v.people[id]; return p ? esc(p.name) + ' <small>' + esc(id) + (p.simulated ? ' · simulated' : '') + '</small>' : esc(id); }).join(', ') || '<span class="mut">None</span>';
}
function versionDetail(v) {
  var ev = v.eventSnapshot || evById(v.eventId), greedy = v.source === 'greedy', primary = greedy ? v.greedyMetrics : v.optimalMetrics,
      plan = greedy ? v.greedyPlan : v.optimalPlan, ds = ev.depts.filter(function(d){return reqOf(d,ev)>0;}), h='';
  h += '<div class="top" style="margin-top:24px"><div><h2>Version ' + esc(v.id) + ' <span class="pill ' + (v.status==='approved'?'ok':'warn') + '">' + (v.status==='approved'?'Approved':'Draft / not published') + '</span></h2><p class="sub">' + esc(ev.name) + (v.scenario?' · What-if scenario':'') + '</p></div></div>';
  if(v.scenario) h += '<div class="card"><b>Scenario:</b> ' + v.scenario.dropout + '% volunteer dropout ('+v.scenario.dropoutCount+' removed) · headcount × ' + v.scenario.headcount + ' · +' + v.scenario.extraHours + ' duty hours · ' + v.scenario.addedVolunteers + ' simulated volunteer(s) with ' + esc(v.scenario.skill||'no selected skill') + '</div>';
  h += '<section class="kpis version-metrics">' + kpi('Required',primary.required,'Scenario positions','grid','') + kpi('Allocated',primary.allocated,'Selected draft plan','check','g') + kpi('Vacant',primary.vacant,'Unfilled positions','warn','a') + kpi('Coverage',pct1(primary.coverage),'Selected draft plan','check','g') + kpi('Priority coverage',pct1(primary.priorityCoverage),'Weighted by priority','grid','') + kpi('Eligible unassigned',primary.eligibleUnassigned,'Could fill at least one role','users','') + '</section>';
  if(v.status!=='approved') h += '<div class="row" style="margin:0 0 18px"><button class="btn solid" data-approve-version="'+esc(v.id)+'">Approve this version</button><button class="btn ghost" data-regenerate-version="'+esc(v.id)+'">Regenerate…</button><span class="note">Drafts are private to this browser until approved.</span></div>';
  h += '<div class="card"><header><h2>Department assignments</h2><span class="pill">'+(greedy?'Greedy draft':'Optimal draft')+'</span></header><div class="tbl-wrap"><table><thead><tr><th>Department</th><th>Required</th><th>Assigned</th><th>Vacant</th><th>Volunteers in this plan</th></tr></thead><tbody>';
  ds.forEach(function(d){var req=reqOf(d,ev),ids=plan[d.id]||[],vac=Math.max(0,req-ids.length);h+='<tr><td><b>'+esc(d.name)+'</b><small>'+esc(d.priority)+' · '+d.start+'-'+d.end+'</small></td><td>'+req+'</td><td>'+ids.length+'</td><td class="'+(vac?'bad':'ok')+'">'+vac+'</td><td>'+versionAssignments(v,plan,d.id)+'</td></tr>';});
  return h+'</tbody></table></div><p class="note" style="margin-top:12px">Approval is recorded in this browser. Volunteer schedules are not currently published or synced across devices.</p></div>';
}
function renderVersionList(eventId) {
  var versions=(S.versions||[]).filter(function(v){return !eventId||v.eventId===eventId;}),h='<div class="card"><header><h2>Versions</h2></header>';
  if(!versions.length)return h+'<div class="empty">No versions yet. Run both allocation methods to create a private draft.</div></div>';
  h+='<div class="tbl-wrap"><table><thead><tr><th>#</th><th>Status</th><th>Source</th><th>Created</th><th></th></tr></thead><tbody>';
  versions.forEach(function(v){h+='<tr><td><b>'+esc(v.id)+'</b></td><td><span class="pill '+(v.status==='approved'?'ok':'warn')+'">'+(v.status==='approved'?'approved':'draft')+'</span></td><td>'+esc(v.source)+'</td><td>'+new Date(v.createdAt).toLocaleString()+(v.scenario?'<small>What-if: '+v.scenario.dropout+'% dropout</small>':'<small>Generated by '+esc(v.source==='greedy'?'Greedy baseline':'Optimal (global)')+'</small>')+'</td><td><button class="btn sm" data-open-version="'+esc(v.id)+'">Open</button></td></tr>';});
  return h+'</tbody></table></div></div>';
}
function renderAllocation() {
  var ev=evById(ui.greedyEvent)||S.events[0];
  if(!ev)return head('Allocation','Compare Greedy and Optimal staffing plans')+'<div class="card">'+empty('Add an event in Events & Staffing to create an allocation draft.')+'</div>';
  ui.greedyEvent=ev.id;
  var open=(S.versions||[]).filter(function(v){return v.id===ui.openVersionId&&v.eventId===ev.id;})[0]||(S.versions||[]).filter(function(v){return v.eventId===ev.id;})[0];
  var c=compute(ev),gm=planStats(c.heur,ev,c,S.volunteers,c.th),om=planStats(c.opt,ev,c,S.volunteers,c.to),h=head('Allocation','Compare plans, review saved drafts, and approve a version.');
  h+='<div class="card"><header><div><h2>Allocation</h2></div><div class="row"><label class="f">Event<select id="greedyEvent">'+S.events.map(function(x){return '<option value="'+esc(x.id)+'"'+(x.id===ev.id?' selected':'')+'>'+esc(x.name)+'</option>';}).join('')+'</select></label><label class="f">Draft from<select id="draftSource"><option value="optimal">Draft from Optimal</option><option value="greedy">Draft from Greedy</option></select></label><button class="btn solid" data-run-allocation="'+esc(ev.id)+'">Run Greedy + Optimal</button></div></header><p class="note">Creates a private draft. Volunteer accounts cannot see drafts. Both plans use the same roster and eligibility rules.</p><div class="grid2">'+metricCard('Greedy baseline',gm,open&&open.source==='greedy')+metricCard('Optimal (global)',om,open&&open.source!=='greedy')+'</div></div>'+renderVersionList(ev.id);
  if(open)h+=versionDetail(open);return h;
}
function makeScenario(cfg) {
  var ev=evById(cfg.eventId)||S.events[0];if(!ev)return null;
  var dropout=Math.max(0,Math.min(100,+cfg.dropout||0)),multiplier=Math.max(.1,Math.min(5,+cfg.headcount||1)),extra=Math.max(0,Math.min(24,+cfg.extraHours||0)),add=Math.max(0,Math.min(200,Math.floor(+cfg.addedVolunteers||0))),pool=clone(S.volunteers),removed=Math.min(pool.length,Math.round(pool.length*dropout/100));
  for(var i=pool.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1)),tmp=pool[i];pool[i]=pool[j];pool[j]=tmp;}
  pool=pool.slice(removed).map(function(v){v.maxHours=(+v.maxHours||0)+extra;return v;});
  var skill=cfg.skill||'',stamp=Date.now();for(var k=0;k<add;k++)pool.push({id:'SIM-'+stamp+'-'+(k+1),name:'Simulated Volunteer '+String(k+1).padStart(3,'0'),phone:'',skills:skill?[skill]:[],start:'00:00',end:'23:59',maxHours:24,exp:0,pref:'',role:'Volunteer'});
  var trial=clone(ev);trial.name=ev.name+' (What-if)';trial.depts=trial.depts.map(function(d){d.required=Math.ceil(reqOf(d,ev)*multiplier);d.type='fixed';return d;});
  return {event:trial,volunteers:pool,detail:{dropout:dropout,dropoutCount:removed,headcount:multiplier,extraHours:extra,addedVolunteers:add,skill:skill}};
}
function runScenario(cfg){var b=makeScenario(cfg);if(!b)return null;var v=saveDraftVersion(b.event,b.volunteers,'what-if',b.detail);ui.openVersionId=v.id;return v;}
function renderWhatIf() {
  var ev=evById(ui.simEvent)||S.events[0];if(!ev)return head('What-if Simulator','Simulate roster changes without editing saved data')+'<div class="card">'+empty('Add an event in Events & Staffing to run a what-if scenario.')+'</div>';
  ui.simEvent=ev.id;var skills=S.skills.map(function(s){return s.name;}),skill=ui.simSkill||skills[0]||'',h=head('What-if Simulator','Simulation drafts are private planning versions and are not published to volunteers.');
  h+='<div class="card sim-controls"><header><div><h2>Scenario inputs <span class="pill warn">Simulation - not published</span></h2><p>Test changes to the current event. Your live roster and event settings stay unchanged.</p></div><label class="f">Event<select id="simEvent">'+S.events.map(function(x){return '<option value="'+esc(x.id)+'"'+(x.id===ev.id?' selected':'')+'>'+esc(x.name)+'</option>';}).join('')+'</select></label></header><div class="sim-inputs">'+
    '<label>Volunteer dropout % <input type="number" id="simDropout" min="0" max="100" value="'+esc(ui.simDropout===undefined?20:ui.simDropout)+'"></label><label>Headcount × <input type="number" id="simHeadcount" min="0.1" max="5" step="0.1" value="'+esc(ui.simHeadcount===undefined?1.2:ui.simHeadcount)+'"></label><label>Extra duty hours <input type="number" id="simExtraHours" min="0" max="24" value="'+esc(ui.simExtraHours===undefined?0:ui.simExtraHours)+'"></label><label>Add simulated volunteers <input type="number" id="simAddVolunteers" min="0" max="200" value="'+esc(ui.simAddVolunteers===undefined?0:ui.simAddVolunteers)+'"></label><label>With skill <select id="simSkill">'+skills.map(function(s){return '<option'+(s===skill?' selected':'')+'>'+esc(s)+'</option>';}).join('')+'</select></label><button class="btn solid" data-run-scenario="1">Run scenario</button></div></div>'+
    '<div class="card"><header><h2>How this scenario is applied</h2></header><p class="note">Dropout removes a random sample from the roster for this run. Headcount multiplies each department’s requirement. Extra duty hours extend remaining volunteers’ maximum hours. Added volunteers are synthetic, available all day, and receive the selected skill. Every run computes Greedy and Optimal plans and saves a draft version in this browser.</p></div>';
  var latest=(S.versions||[]).filter(function(v){return v.scenario&&v.eventId===ev.id;})[0];if(latest)h+='<div class="card"><header><div><h2>Latest scenario · '+esc(latest.id)+'</h2><p>Saved as an unpublished draft.</p></div><button class="btn" data-open-version="'+esc(latest.id)+'">Review in Allocation</button></header><div class="grid2">'+metricCard('Greedy baseline',latest.greedyMetrics,false)+metricCard('Optimal (global)',latest.optimalMetrics,false)+'</div></div>';return h;
}

function page() { return (location.hash.replace("#", "") || "dashboard"); }
function render() {
  var role = sessionStorage.getItem("tapmi_role") || "convenor";
  var allowed = role === "volunteer" ? ["my"] : role === "co-convenor" ? ["dashboard", "events", "roster", "greedy", "simulator", "committee", "skills", "audit"] : PAGES.map(function (x) { return x[0]; });
  var p = page(); if (allowed.indexOf(p) < 0) p = allowed[0];
  var navItems = PAGES.filter(function (x) { return allowed.indexOf(x[0]) >= 0; });
  if (role === "volunteer") navItems = [["my", "My Portal", "users"]];
  $("#nav").innerHTML = navItems.map(function (x) { return '<a href="#' + x[0] + '" class="' + (x[0] === p ? "on" : "") + '"' + (x[0] === p ? ' aria-current="page"' : "") + ">" + svg(x[2]) + x[1] + "</a>"; }).join("") + '<div class="role-label">' + esc(role.replace(/-/g, " ")) + '</div><button class="nav-logout" id="logout">Sign out</button>';
  var v = p === "my" ? function () { return head("Volunteer Portal", "Your event information will appear here") + '<div class="card"><h2>Welcome to the volunteer portal</h2><p class="note" style="margin-top:10px">This demo portal is ready for volunteer specific schedules and contact details to be added.</p></div>'; } : { dashboard: renderDashboard, events: renderEvents, roster: renderRoster, greedy: renderAllocation, simulator: renderWhatIf, committee: renderCommittee, skills: renderSkills, audit: renderAudit }[p];
  var y = window.scrollY; $("#view").innerHTML = v(); window.scrollTo(0, y);
}
function showAuth(message) {
  var auth = $("#auth"), app = $(".app");
  app.hidden = true; auth.hidden = false;
  auth.innerHTML = '<div class="auth-card"><img src="assets/logo.png" alt="TAPMI"><p class="auth-place">TAPMI, Manipal</p><h1><span>Cultural Committee</span> portal</h1>' +
    (message ? '<div class="auth-error">' + esc(message) + '</div>' : '') +
    '<form id="loginForm"><label class="f"><span class="sr-only">Email</span><input type="email" id="loginEmail" placeholder="name@tapmi.edu.in" autocomplete="username" required></label><label class="f"><span class="sr-only">Password</span><input type="password" id="loginPassword" placeholder="Password" autocomplete="current-password" required></label><button class="btn solid" type="submit">Sign in</button></form>' +
    '<p class="quick-label">Demo quick fill</p><div class="quick-fill"><button type="button" data-demo="convenor">Convenor</button><button type="button" data-demo="co-convenor">Co-convenor</button><button type="button" data-demo="volunteer">Volunteer</button></div></div>';
}
function startApp(role) {
  sessionStorage.setItem("tapmi_role", role);
  var auth = $("#auth"), app = $(".app");
  auth.hidden = true; app.hidden = false;
  if (role === "volunteer") location.hash = "my";
  render();
}
window.addEventListener("hashchange", function () { render(); window.scrollTo(0, 0); });

/* ----------------------------------------------------------------- events */
var dlg = $("#dlg");
function openDlg(html) { dlg.innerHTML = html; dlg.showModal(); }
function parseCSV(t) {
  var rows = [], row = [], cur = "", q = false, i, c;
  for (i = 0; i < t.length; i++) { c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.length > 1 || row[0]) rows.push(row); row = []; }
    else cur += c; }
  if (cur || row.length) { row.push(cur); rows.push(row); } return rows;
}
function importCSV(text) {
  var r = parseCSV(text), hd = r.shift().map(function (x) { return x.trim().toLowerCase(); }), add = 0, update = 0, skip = 0, col = function (row, n) { var k = hd.indexOf(n.toLowerCase()); return k < 0 ? "" : (row[k] || "").trim(); };
  r.forEach(function (row) {
    var id = col(row, "volunteer_id") || nextVid(), nm = col(row, "name"), old = byName(id); if (!nm) { skip++; return; }
    var sk = col(row, "skills").split(",").map(function (s) { return s.trim(); }).filter(function (s) { return s && s !== "None"; });
    sk.forEach(function (s) { if (!S.skills.some(function (x) { return x.name === s; })) S.skills.push({ name: s, desc: "Imported from CSV" }); });
    var role = col(row, "role") || col(row, "position") || (old && old.role) || "Volunteer";
    var rec = { id: id, name: nm, phone: col(row, "phone"), skills: sk, start: col(row, "availability_start") || "09:00", end: col(row, "availability_end") || "21:00", maxHours: parseFloat(col(row, "max_hours")) || 4, exp: parseInt(col(row, "experience_level"), 10) || 0, pref: col(row, "department_preference"), interviewer: col(row, "interviewed_by"), role: role };
    if (old) { Object.assign(old, rec); update++; } else { S.volunteers.push(rec); add++; }
  });
  log("CSV import", add + " added, " + update + " updated, " + skip + " skipped (missing name)"); commit(); toast(add + " added, " + update + " updated");
}
document.addEventListener("click", function (e) {
  var t = e.target.closest("[data-go],[data-dept],[data-sel],[data-delev],[data-method],[data-vedit],[data-vdel],[data-cmdel],[data-skas],[data-skdel],[data-close],[data-apply-greedy],[data-run-allocation],[data-run-scenario],[data-open-version],[data-approve-version],[data-regenerate-version],#evAdd,#vAdd,#csvOut,#cmAdd,#skAdd,#reset"); if (!t) return;
  var d = t.dataset;
  if (d.go) { var p = d.go.split(":"); ui.evSel = p[1]; location.hash = p[0]; render(); window.scrollTo(0, 0); }
  else if (d.dept) { ui.open[d.dept] = !ui.open[d.dept]; render(); }
  else if (d.sel) { ui.evSel = d.sel; render(); setTimeout(function () { var x = document.querySelectorAll("#view .card"); x[x.length - 1].scrollIntoView({ behavior: "smooth" }); }, 30); }
  else if (d.delev) { if (confirm("Delete this event?")) { var ev = evById(d.delev); S.events = S.events.filter(function (x) { return x.id !== d.delev; }); log("Event deleted", ev.name); if (ui.evSel === d.delev) ui.evSel = null; if (ui.dashEvent === d.delev) ui.dashEvent = null; commit(); } }
  else if (d.method) { var ev2 = evById(ui.evSel); ev2.method = d.method; log("Allocation method", ev2.name + " set to " + d.method); commit(); }
  else if (d.applyGreedy) { var ge = evById(d.applyGreedy); if (ge) { ge.method = "heuristic"; log("Allocation method", ge.name + " set to greedy"); commit(); toast("Greedy plan selected for " + ge.name); } }
  else if (d.runAllocation) { var ae=evById(d.runAllocation), source=$("#draftSource").value||"optimal"; if(ae){ui.greedyEvent=ae.id;saveDraftVersion(ae,S.volunteers,source,null);commit();} }
  else if (d.runScenario !== undefined) { var cfg={eventId:$("#simEvent").value,dropout:$("#simDropout").value,headcount:$("#simHeadcount").value,extraHours:$("#simExtraHours").value,addedVolunteers:$("#simAddVolunteers").value,skill:$("#simSkill").value};ui.simDropout=cfg.dropout;ui.simHeadcount=cfg.headcount;ui.simExtraHours=cfg.extraHours;ui.simAddVolunteers=cfg.addedVolunteers;ui.simSkill=cfg.skill;runScenario(cfg);commit();toast("Scenario saved as a private draft"); }
  else if (d.openVersion) { var ov=(S.versions||[]).filter(function(v){return v.id===d.openVersion;})[0];if(ov){ui.openVersionId=ov.id;ui.greedyEvent=ov.eventId;location.hash="greedy";render();} }
  else if (d.approveVersion) { var av=(S.versions||[]).filter(function(v){return v.id===d.approveVersion;})[0];if(av){av.status="approved";av.approvedAt=Date.now();log("Allocation approved",av.id+" for "+av.eventName);commit();toast("Version approved in this browser");} }
  else if (d.regenerateVersion) { var rv=(S.versions||[]).filter(function(v){return v.id===d.regenerateVersion;})[0];if(rv){if(rv.scenario){runScenario({eventId:rv.eventId,dropout:rv.scenario.dropout,headcount:rv.scenario.headcount,extraHours:rv.scenario.extraHours,addedVolunteers:rv.scenario.addedVolunteers,skill:rv.scenario.skill});}else{var re=evById(rv.eventId);if(re)saveDraftVersion(re,S.volunteers,rv.source,null);}commit();} }
  else if (d.close !== undefined) dlg.close();
  else if (d.vedit) { openDlg(volDialog(d.vedit)); dlg.dataset.id = d.vedit; }
  else if (d.vdel) { var v = byName(d.vdel); if (confirm("Delete " + v.name + "?")) { S.volunteers = S.volunteers.filter(function (x) { return x.id !== d.vdel; }); log("Volunteer deleted", v.id + " " + v.name); commit(); } }
  else if (d.cmdel) { var m = S.committee.filter(function (x) { return x.id === d.cmdel; })[0]; S.committee = S.committee.filter(function (x) { return x.id !== d.cmdel; }); Object.keys(S.heads).forEach(function (k) { if (S.heads[k] === d.cmdel) delete S.heads[k]; }); log("Committee member removed", m.name); commit(); }
  else if (d.skas) { openDlg(skillDialog(d.skas)); }
  else if (d.skdel) {
    if (S.departments.some(function (x) { return x.skill === d.skdel; })) return toast("Skill is required by a department - cannot delete");
    S.skills = S.skills.filter(function (x) { return x.name !== d.skdel; }); S.volunteers.forEach(function (v) { v.skills = v.skills.filter(function (s) { return s !== d.skdel; }); }); log("Skill deleted", d.skdel); commit();
  }
  else if (t.id === "evAdd") {
    var n = $("#evName").value.trim(), dt = $("#evDate").value; if (!n || !dt) return toast("Enter an event name and date");
    var ne = makeEvent({ id: "E" + Date.now(), name: n, venue: $("#evVenue").value.trim() || "TBA", date: dt, attendees: +$("#evAtt").value || 100, status: "Upcoming", method: "optimal" }, S.departments);
    S.events.push(ne); ui.evSel = ne.id; log("Event added", n + " on " + fmtDate(dt)); commit(); toast("Event added");
  }
  else if (t.id === "vAdd") { openDlg(volDialog(null)); delete dlg.dataset.id; }
  else if (t.id === "csvOut") {
    var rows = [["volunteer_id", "interviewed_by", "name", "phone", "skills", "availability_start", "availability_end", "max_hours", "experience_level", "department_preference", "role"]];
    S.volunteers.forEach(function (v) { rows.push([v.id, v.interviewer || "", v.name, v.phone, v.skills.join(", ") || "None", v.start, v.end, v.maxHours, v.exp === 3 ? "3+ yrs" : v.exp + (v.exp === 1 ? " yr" : " yrs"), v.pref, v.role || "Volunteer"]); });
    var csv = rows.map(function (r) { return r.map(function (x) { return '"' + String(x).replace(/"/g, '""') + '"'; }).join(","); }).join("\n");
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "volunteers_export.csv"; a.click();
  }
  else if (t.id === "cmAdd") {
    var cn = $("#cmN").value.trim(); if (!cn) return toast("Enter a name");
    S.committee.push({ id: "C" + Date.now(), name: cn, role: $("#cmR").value.trim() || "Core Committee Member", email: $("#cmE").value.trim(), phone: $("#cmP").value.trim() }); log("Committee member added", cn); commit();
  }
  else if (t.id === "skAdd") {
    var sn = $("#skN").value.trim(); if (!sn) return toast("Enter a skill name"); if (S.skills.some(function (x) { return x.name.toLowerCase() === sn.toLowerCase(); })) return toast("Skill already exists");
    S.skills.push({ name: sn, desc: $("#skD").value.trim() || "-" }); log("Skill added", sn); commit();
  }
  else if (t.id === "reset") { if (confirm("Reset everything to the original demo data?")) { S = freshState(); ui.evSel = null; ui.dashEvent = null; commit(); } }
});
document.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && e.target.matches("tr.dept")) { e.preventDefault(); e.target.click(); } });
document.addEventListener("change", function (e) {
  var t = e.target, d = t.dataset;
  if (t.id === "dashSel") { ui.dashEvent = t.value; render(); }
  else if (t.id === "greedyEvent") { ui.greedyEvent = t.value; render(); }
  else if (t.id === "simEvent") { var se = evById(t.value); ui.simEvent = t.value; ui.simAttendees = se ? se.attendees : 0; ui.simMethod = se && se.method || "optimal"; ui.simDepts = {}; render(); }
  else if (t.id === "simAttendees") { ui.simAttendees = Math.max(0, +t.value || 0); render(); }
  else if (t.id === "simMethod") { ui.simMethod = t.value; render(); }
  else if (d.simDept && d.simField) {
    if (!ui.simDepts[d.simDept]) ui.simDepts[d.simDept] = {};
    ui.simDepts[d.simDept][d.simField] = d.simField === "priority" ? t.value : Math.max(0, parseFloat(t.value) || 0);
    render();
  }
  else if (t.id === "rsk") { ui.skillF = t.value; render(); }
  else if (t.id === "csvIn" && t.files[0]) { var fr = new FileReader(); fr.onload = function () { importCSV(fr.result); }; fr.readAsText(t.files[0]); }
  else if (d.st) { var ev = evById(d.st); ev.status = t.value; log("Event status", ev.name + " -> " + t.value); commit(); }
  else if (d.head !== undefined) {
    var alreadyLeads = Object.keys(S.heads).some(function (deptId) { return deptId !== d.head && t.value && S.heads[deptId] === t.value; });
    if (alreadyLeads) { toast("This person already heads another department"); render(); return; }
    var dp = S.departments.filter(function (x) { return x.id === d.head; })[0];
    if (t.value) S.heads[d.head] = t.value; else delete S.heads[d.head];
    var mm = S.committee.concat(S.volunteers).filter(function (x) { return x.id === t.value; })[0];
    log("Department head", dp.name + " -> " + (mm ? mm.name : "unassigned")); commit();
  }
  else if (d.cfg) { var e2 = evById(ui.evSel), dd = e2.depts.filter(function (x) { return x.id === d.d; })[0], val = t.value;
    if (["required", "maxCap", "serviceMin", "peakMin"].indexOf(d.cfg) >= 0) val = parseFloat(val) || 0; if (d.cfg === "skill") val = val || null;
    dd[d.cfg] = val; log("Department updated", e2.name + ": " + dd.name + " " + d.cfg + " = " + (val === null ? "none" : val)); commit(); }
});
document.addEventListener("input", function (e) {
  if (e.target.id === "rq") { ui.q = e.target.value; var pos = e.target.selectionStart; render(); var el = $("#rq"); el.focus(); el.setSelectionRange(pos, pos); }
  else if (e.target.id === "sq") { var q = e.target.value.toLowerCase(); document.querySelectorAll("#sl label").forEach(function (l) { l.style.display = l.dataset.n.indexOf(q) >= 0 ? "" : "none"; }); }
});
dlg.addEventListener("submit", function (e) {
  var f = e.target;
  if (f.id === "vf") {
    var nm = $("#vn").value.trim(), sk = Array.prototype.map.call(f.querySelectorAll('input[name="sk"]:checked'), function (x) { return x.value; });
    var pref = Array.prototype.map.call($("#vd").selectedOptions, function (x) { return x.value; }).join(", ");
    var rec = { name: nm, phone: $("#vp").value.trim(), start: $("#vs").value, end: $("#ve").value, maxHours: parseFloat($("#vh").value) || 4, exp: +$("#vx").value, pref: pref, role: $("#vr").value, skills: sk };
    if (dlg.dataset.id) { Object.assign(byName(dlg.dataset.id), rec); log("Volunteer updated", dlg.dataset.id + " " + nm); }
    else { rec.id = nextVid(); rec.interviewer = ""; S.volunteers.push(rec); log("Volunteer added", rec.id + " " + nm); }
    commit(); toast("Volunteer saved");
  } else if (f.id === "sf") {
    var name = f.dataset.skill, on = {}; f.querySelectorAll("#sl input:checked").forEach(function (x) { on[x.value] = 1; });
    S.volunteers.forEach(function (v) { var has = v.skills.indexOf(name) >= 0; if (on[v.id] && !has) v.skills.push(name); if (!on[v.id] && has) v.skills = v.skills.filter(function (s) { return s !== name; }); });
    log("Skill assigned", name + " now held by " + Object.keys(on).length + " volunteers"); commit(); toast("Skill assignments saved");
  }
});

S = load(); if (!S.events) S = freshState(); ui.dashEvent = S.events[0] && S.events[0].id;
document.addEventListener("submit", function (e) {
  if (e.target.id !== "loginForm") return;
  e.preventDefault();
  var u = $("#loginEmail").value.trim().toLowerCase(), p = $("#loginPassword").value;
  var accounts = { "convenor@tapmi.edu.in": ["tapmi-demo", "convenor"], "coconvenor@tapmi.edu.in": ["tapmi-demo", "co-convenor"], "volunteer@tapmi.edu.in": ["tapmi-demo", "volunteer"] };
  if (!accounts[u] || accounts[u][0] !== p) { showAuth("Demo sign-in did not match. Use a quick-fill role to try the portal."); return; }
  startApp(accounts[u][1]);
});
document.addEventListener("click", function (e) {
  var demo = e.target.closest("[data-demo]");
  if (demo) {
    var role = demo.dataset.demo, email = role === "co-convenor" ? "coconvenor@tapmi.edu.in" : role + "@tapmi.edu.in";
    $("#loginEmail").value = email; $("#loginPassword").value = "tapmi-demo";
    return;
  }
  if (e.target.id === "logout") { sessionStorage.removeItem("tapmi_role"); showAuth(); }
});
var activeRole = sessionStorage.getItem("tapmi_role");
if (activeRole) startApp(activeRole); else showAuth();
})();
