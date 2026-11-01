"""
EVENT STAFFING & RESOURCE ALLOCATION OPTIMIZATION SYSTEM
TAPMI Cultural Committee - Volunteer Allocation System
=========================================================
Course : Introduction to Python Programming (BBAT5E07), BBAH 2023-27

Layer 1  Capacity planning  -> how many staff does each department need?
Layer 2  Assignment         -> which volunteer goes to which department?
            (a) Heuristic  : priority-ordered, rule-based baseline
            (b) Optimised  : Integer Linear Program solved with PuLP / CBC

Run:   python event_staffing_optimizer.py
Needs: pip install pandas numpy matplotlib openpyxl "pulp==2.9.0"

Outputs (in ./output):
    Staffing_Allocation_Output.xlsx   - full workbook (8 sheets)
    chart_coverage.png / chart_comparison.png
    ../js/data.js                     - seed data read by the website dashboard

Code sections follow the session plan of the course:
    1  Numbers & strings      5  Loops               9  Visualization
    2  Lists, tuples          6  Input & Output      10 NumPy / Pandas
    3  Sets & dictionaries    7  Functions           11 Objects & inheritance
    4  Decisions              8  Recursion           12 Files, exceptions, sorting, searching
"""

import math
import os
import time
import json

import numpy as np
import pandas as pd
import matplotlib

matplotlib.use("Agg")  # draw charts to files (no pop-up window needed)
import matplotlib.pyplot as plt
import pulp
from openpyxl.styles import Font, PatternFill


# =============================================================================
# SECTION 1-3  CONSTANTS  (numbers, strings, tuples, dictionaries, sets)
# =============================================================================
CSV_FILE = "volunteers_complete.csv"
OUTPUT_DIR = "output"

# Priority classes -> numeric weight used in the optimisation objective
PRIORITY_WEIGHT = {"Critical": 10, "High": 5, "Normal": 1}
PRIORITY_RANK = {"Critical": 0, "High": 1, "Normal": 2}   # processing order

# Tie-break scores used (identically) by the heuristic, the ILP and the website
PREF_SCORE = 10      # volunteer asked for this department
EPSILON = 0.001      # keeps tie-break far smaller than any shortage weight

# Skills catalogue (name, description) - shown in the website's Skill Catalog
SKILL_CATALOG = tuple((name, "Volunteer-reported skill from the roster.") for name in (
    "Anchoring & Public Speaking", "Art", "Branding & Visual Design", "Budgeting & Finance",
    "Crowd Management & Security", "Dance & Choreography", "Debating & MUN", "Event Coordination",
    "Event Volunteering", "Hospitality & Guest Handling", "Logistics", "Marketing & Promotions",
    "Music & Vocals", "Operations Management", "Participant Coordination", "Photography & Video Editing",
    "Props & Decoration", "Public Relations & Outreach", "Sales", "Scriptwriting",
    "Social Media & Content Creation", "Sound & Audio Editing", "Sponsorship & Fundraising",
    "Stage & Backstage Management", "Stall Management", "Teaching & Mentoring", "Team Leadership",
    "Technical Support", "Theatre & Acting", "Vendor Management", "Volunteer & Manpower Management",
))


# =============================================================================
# SECTION 11  OBJECTS AND INHERITANCE
# =============================================================================
class Department:
    """A department with a FIXED staffing requirement (posts / zones)."""

    def __init__(self, dept_id, name, priority, start, end, required,
                 max_capacity, skill=None, prefs=()):
        self.dept_id = dept_id
        self.name = name
        self.priority = priority
        self.start = start            # "HH:MM"
        self.end = end
        self.fixed_required = required
        self.max_capacity = max_capacity
        self.skill = skill            # None -> no skill needed
        self.prefs = list(prefs)      # CSV preference labels that map here

    def shift_hours(self):
        return to_hours(self.end) - to_hours(self.start)

    def required_staff(self, attendees=0):
        return self.fixed_required

    def weight(self):
        return PRIORITY_WEIGHT[self.priority]


class ThroughputDepartment(Department):
    """Child class: need depends on attendee volume (e.g. registration).

    Required = CEILING( workload x service time / peak window )
    """

    def __init__(self, dept_id, name, priority, start, end, max_capacity,
                 service_min, peak_min, skill=None, prefs=()):
        super().__init__(dept_id, name, priority, start, end, 0,
                         max_capacity, skill, prefs)
        self.service_min = service_min   # minutes to serve one attendee
        self.peak_min = peak_min         # minutes available to absorb the rush

    def required_staff(self, attendees=0):   # overrides the parent method
        return math.ceil(attendees * self.service_min / self.peak_min)


def build_departments():
    """Staffing roles based on the volunteer CSV department_preference values."""
    return [
        Department("event-planning", "Event Planning & Execution", "High", "09:00", "18:00", 4, 6,
                   None, ["Event Planning & Execution"]),
        Department("finance", "Finance & Budgeting", "Normal", "09:00", "15:00", 2, 3,
                   None, ["Finance & Budgeting"]),
        Department("logistics", "Logistics", "Normal", "09:00", "15:00", 4, 6,
                   None, ["Logistics"]),
        Department("marketing", "Marketing & Promotions", "Normal", "11:00", "15:00", 4, 6,
                   None, ["Marketing & Promotions"]),
        Department("public-relations", "Public Relations & Outreach", "Normal", "09:00", "18:00", 3, 4,
                   None, ["Public Relations & Outreach"]),
        Department("sponsorships", "Sponsorships", "Normal", "11:00", "15:00", 2, 3,
                   None, ["Sponsorships"]),
        Department("stage-backstage", "Stage/ Backstage Management", "High", "16:00", "21:00", 3, 5,
                   None, ["Stage/ Backstage Management"]),
        Department("artist-participant", "Artist/ Participant Coordination", "High", "13:00", "18:00", 3, 5,
                   None, ["Artist/ Participant Coordination"]),
        Department("vendor", "Vendor Management", "Normal", "09:00", "15:00", 2, 3,
                   None, ["Vendor Management"]),
        Department("hospitality", "Hospitality", "High", "13:00", "18:00", 3, 5,
                   None, ["Hospitality"]),
    ]


# =============================================================================
# SECTION 7  FUNCTIONS - helpers
# =============================================================================
def to_hours(clock_text):
    """'13:30' -> 13.5"""
    hh, mm = clock_text.split(":")
    return int(hh) + int(mm) / 60


def experience_years(text):
    """'3+ yrs' -> 3,  '1 yr' -> 1"""
    return int(str(text).split()[0].replace("+", ""))


# =============================================================================
# SECTION 12  FILES, EXCEPTIONS
# =============================================================================
def load_volunteers(path):
    """Read the volunteer CSV and return a list of dictionaries."""
    try:
        table = pd.read_csv(path)
    except FileNotFoundError:
        print("ERROR: could not find", path)
        return []
    except pd.errors.ParserError as err:
        print("ERROR: CSV is malformed ->", err)
        return []

    volunteers = []
    for _, row in table.iterrows():
        skills = []
        if not pd.isna(row["skills"]):
            for piece in str(row["skills"]).split(","):
                piece = piece.strip()
                if piece and piece != "None":
                    skills.append(piece)
        pref = "" if pd.isna(row["department_preference"]) else row["department_preference"]
        volunteers.append({
            "id": row["volunteer_id"],
            "name": row["name"],
            "phone": str(row["phone"]),
            "interviewer": row["interviewed_by"],
            "skills": skills,
            "start": row["availability_start"],
            "end": row["availability_end"],
            "max_hours": float(row["max_hours"]),
            "exp": experience_years(row["experience_level"]),
            "pref": pref,
        })
    return volunteers


# =============================================================================
# SECTION 8  RECURSION + SECTION 12 SEARCHING
# =============================================================================
def binary_search(sorted_ids, target, low, high):
    """Recursive binary search over a sorted list of volunteer ids."""
    if low > high:
        return -1
    mid = (low + high) // 2
    if sorted_ids[mid] == target:
        return mid
    if sorted_ids[mid] < target:
        return binary_search(sorted_ids, target, mid + 1, high)
    return binary_search(sorted_ids, target, low, mid - 1)


def find_volunteer(volunteers, vol_id):
    """Look a volunteer up by id (list is sorted by id first)."""
    ordered = sorted(volunteers, key=lambda v: v["id"])       # sorting
    ids = [v["id"] for v in ordered]
    pos = binary_search(ids, vol_id, 0, len(ids) - 1)
    return ordered[pos] if pos >= 0 else None


# =============================================================================
# SECTION 4-5  DECISIONS & LOOPS - eligibility (Layer 2, rule 3.4.1)
# =============================================================================
def failed_criteria(vol, dept):
    """Return the list of eligibility rules this volunteer fails.

    skill   : volunteer must hold the department's required skill
    hours   : max working hours >= shift length
    window  : availability window must fully contain the shift
    """
    failed = []
    if dept.skill is not None and dept.skill not in vol["skills"]:
        failed.append("skill")
    if vol["max_hours"] < dept.shift_hours():
        failed.append("hours")
    if to_hours(vol["start"]) > to_hours(dept.start) or to_hours(vol["end"]) < to_hours(dept.end):
        failed.append("window")
    return failed


def build_eligibility(volunteers, departments):
    """dict: dept_id -> list of eligible volunteer ids."""
    eligible = {}
    for dept in departments:
        eligible[dept.dept_id] = []
        for vol in volunteers:
            if len(failed_criteria(vol, dept)) == 0:
                eligible[dept.dept_id].append(vol["id"])
    return eligible


def tie_score(vol, dept):
    """Secondary preference: asked-for department first, then experience."""
    score = vol["exp"]
    preferences = [piece.strip() for piece in str(vol["pref"]).split(",") if piece.strip()]
    if any(preference in dept.prefs for preference in preferences):
        score += PREF_SCORE
    return score


# =============================================================================
# LAYER 2 (a)  HEURISTIC ALLOCATION
# =============================================================================
def heuristic_allocation(volunteers, departments, eligible, attendees):
    """Critical -> High -> Normal; preferred volunteers first; one dept each."""
    by_id = {v["id"]: v for v in volunteers}
    assigned = {}                    # volunteer id -> dept id
    plan = {d.dept_id: [] for d in departments}

    ordered = sorted(departments, key=lambda d: PRIORITY_RANK[d.priority])  # stable sort
    for dept in ordered:
        target = min(dept.required_staff(attendees), dept.max_capacity)
        pool = [by_id[i] for i in eligible[dept.dept_id] if i not in assigned]
        pool.sort(key=lambda v: (-tie_score(v, dept), v["id"]))
        for vol in pool:
            if len(plan[dept.dept_id]) >= target:
                break
            plan[dept.dept_id].append(vol["id"])
            assigned[vol["id"]] = dept.dept_id
    return plan


# =============================================================================
# LAYER 2 (b)  INTEGER LINEAR PROGRAM (PuLP + CBC)
# =============================================================================
def optimized_allocation(volunteers, departments, eligible, attendees):
    """
    Minimise  SUM_j w_j * S_j   (- tiny preference/experience tie-break)
    s.t.      SUM_j X_ij <= 1                  every volunteer, at most one dept
              SUM_i X_ij <= min(Req_j, Cap_j)  department limit
              S_j >= Req_j - SUM_i X_ij        shortage definition
    """
    by_id = {v["id"]: v for v in volunteers}
    model = pulp.LpProblem("Event_Staffing", pulp.LpMinimize)

    x = {}                                           # binary decision variables
    for dept in departments:
        for vid in eligible[dept.dept_id]:
            x[(vid, dept.dept_id)] = pulp.LpVariable(f"x_{vid}_{dept.dept_id}", cat="Binary")
    s = {d.dept_id: pulp.LpVariable(f"short_{d.dept_id}", lowBound=0) for d in departments}

    model += (pulp.lpSum(d.weight() * s[d.dept_id] for d in departments)
              - EPSILON * pulp.lpSum(tie_score(by_id[v], d) * x[(v, d.dept_id)]
                                     for d in departments for v in eligible[d.dept_id]))

    for vol in volunteers:                           # one department per volunteer
        mine = [x[(vol["id"], d.dept_id)] for d in departments
                if (vol["id"], d.dept_id) in x]
        if mine:
            model += pulp.lpSum(mine) <= 1
    for dept in departments:
        req = dept.required_staff(attendees)
        members = [x[(v, dept.dept_id)] for v in eligible[dept.dept_id]]
        model += pulp.lpSum(members) <= min(req, dept.max_capacity)
        model += s[dept.dept_id] >= req - pulp.lpSum(members)

    model.solve(pulp.PULP_CBC_CMD(msg=False))

    plan = {d.dept_id: [] for d in departments}
    for (vid, did), var in x.items():
        if var.value() is not None and var.value() > 0.5:
            plan[did].append(vid)
    for did in plan:
        plan[did].sort()
    return plan


# =============================================================================
# EVALUATION  (comparison metrics, section 3.5)
# =============================================================================
def evaluate(plan, departments, attendees):
    """Return metrics for one allocation plan."""
    weighted = 0.0
    critical = 0
    fully = 0
    allocated = 0
    rows = []
    for dept in departments:
        req = dept.required_staff(attendees)
        got = len(plan[dept.dept_id])
        short = max(req - got, 0)
        weighted += dept.weight() * short
        if dept.priority == "Critical":
            critical += short
        if short == 0:
            fully += 1
        allocated += got
        rows.append((dept.name, dept.priority, req, got, short))
    return {"weighted_shortage": weighted, "critical_shortage": critical,
            "fully_staffed": fully, "allocated": allocated, "rows": rows}


def timed(function, *args):
    """Run a function and return (result, seconds)."""
    t0 = time.perf_counter()
    result = function(*args)
    return result, time.perf_counter() - t0


# =============================================================================
# BOTTLENECKS & RECOMMENDATIONS (section 3.6)
# =============================================================================
def detect_bottlenecks(plan, volunteers, departments, eligible, attendees):
    rows = []
    for dept in departments:
        req = dept.required_staff(attendees)
        got = len(plan[dept.dept_id])
        short = max(req - got, 0)
        pool = len(eligible[dept.dept_id])
        if short == 0:
            cause = "None - fully staffed"
        elif req > dept.max_capacity:
            cause = "Capacity-constrained"
        elif pool >= req:
            cause = "Eligibility-constrained (eligible pool shared with higher-priority departments)"
        else:
            cause = "Eligibility-constrained"
        rows.append({"Department": dept.name, "Priority": dept.priority, "Required": req,
                     "Max capacity": dept.max_capacity, "Eligible pool": pool,
                     "Allocated": got, "Shortage": short, "Cause": cause})
    return rows


def generate_recommendations(plan, volunteers, departments, attendees):
    """Feasible fixes: unassigned volunteers who miss exactly ONE rule."""
    used = set()
    for ids in plan.values():
        used.update(ids)                                       # set of assigned ids
    free = [v for v in volunteers if v["id"] not in used]
    advice = {"skill": "acquire the '{x}' skill", "hours": "extend max hours to {x} h",
              "window": "widen availability to {x}"}

    recs = []
    for dept in departments:
        short = dept.required_staff(attendees) - len(plan[dept.dept_id])
        if short <= 0:
            continue
        candidates = []
        for vol in free:
            miss = failed_criteria(vol, dept)
            if len(miss) == 1:
                candidates.append((vol, miss[0]))
        candidates.sort(key=lambda pair: (-pair[0]["exp"], pair[0]["id"]))
        for vol, rule in candidates[:short]:
            detail = {"skill": dept.skill, "hours": dept.shift_hours(),
                      "window": dept.start + "-" + dept.end}[rule]
            recs.append({"Department": dept.name, "Volunteer": vol["id"] + " " + vol["name"],
                         "Action": "Ask them to " + advice[rule].format(x=detail)
                                   + " -> becomes eligible"})
        if len(candidates) < short:
            recs.append({"Department": dept.name, "Volunteer": "-",
                         "Action": "Recruit " + str(short - len(candidates))
                                   + " more volunteer(s) with availability "
                                   + dept.start + "-" + dept.end})
        if dept.required_staff(attendees) > dept.max_capacity:
            recs.append({"Department": dept.name, "Volunteer": "-",
                         "Action": "Raise physical capacity above " + str(dept.max_capacity)})
    return recs


# =============================================================================
# SECTION 10  PANDAS / NUMPY - tables and Excel
# =============================================================================
def assignment_table(plan, volunteers, departments):
    by_id = {v["id"]: v for v in volunteers}
    rows = []
    for dept in departments:
        for vid in plan[dept.dept_id]:
            v = by_id[vid]
            rows.append({"Department": dept.name, "Volunteer ID": vid, "Name": v["name"],
                         "Phone": v["phone"], "Skills": ", ".join(v["skills"]) or "None",
                         "Shift": dept.start + "-" + dept.end,
                         "Experience (yrs)": v["exp"],
                         "Preferred this dept": "Yes" if v["pref"] in dept.prefs else "No"})
    return pd.DataFrame(rows)


def export_excel(path, event_name, attendees, volunteers, departments, eligible,
                 heur, opt, m_h, m_o, t_h, t_o):
    plan = opt
    cover = pd.DataFrame(m_o["rows"], columns=["Department", "Priority", "Required",
                                               "Allocated", "Vacant"])
    cover["Coverage %"] = np.round(100 * cover["Allocated"] / cover["Required"], 1)

    compare = pd.DataFrame({
        "Metric": ["Priority-weighted shortage", "Critical-department shortage",
                   "Departments fully staffed", "Volunteers allocated", "Computation time (s)"],
        "Heuristic": [m_h["weighted_shortage"], m_h["critical_shortage"], m_h["fully_staffed"],
                      m_h["allocated"], round(t_h, 4)],
        "Optimised (ILP)": [m_o["weighted_shortage"], m_o["critical_shortage"], m_o["fully_staffed"],
                            m_o["allocated"], round(t_o, 4)]})

    summary = pd.DataFrame({
        "Item": ["Event", "Expected attendees", "Volunteers in pool", "Total required positions",
                 "Allocated (optimised)", "Vacant", "Coverage %"],
        "Value": [event_name, attendees, len(volunteers), int(cover["Required"].sum()),
                  int(cover["Allocated"].sum()), int(cover["Vacant"].sum()),
                  round(100 * cover["Allocated"].sum() / cover["Required"].sum(), 1)]})

    used = set()
    for ids in plan.values():
        used.update(ids)
    free = pd.DataFrame([{"Volunteer ID": v["id"], "Name": v["name"], "Skills": ", ".join(v["skills"]) or "None",
                          "Availability": v["start"] + "-" + v["end"], "Max hours": v["max_hours"]}
                         for v in volunteers if v["id"] not in used])
    roster = pd.DataFrame([{**v, "skills": ", ".join(v["skills"])} for v in volunteers])

    sheets = {"Summary": summary, "Dept_Coverage": cover,
              "Assignments": assignment_table(plan, volunteers, departments),
              "Heuristic_vs_Optimised": compare,
              "Bottlenecks": pd.DataFrame(detect_bottlenecks(plan, volunteers, departments, eligible, attendees)),
              "Recommendations": pd.DataFrame(generate_recommendations(plan, volunteers, departments, attendees)),
              "Unassigned_Volunteers": free, "Volunteer_Roster": roster}

    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        for name, frame in sheets.items():
            frame.to_excel(writer, sheet_name=name, index=False)
            sheet = writer.sheets[name]
            for col in sheet.columns:                      # tidy column widths
                width = max(len(str(c.value)) if c.value is not None else 0 for c in col)
                sheet.column_dimensions[col[0].column_letter].width = min(width + 3, 60)
            for cell in sheet[1]:                          # header style
                cell.font = Font(bold=True, color="FFFFFF")
                cell.fill = PatternFill("solid", fgColor="C2571A")


# =============================================================================
# SECTION 9  VISUALIZATION
# =============================================================================
def make_charts(m_h, m_o, outdir):
    names = [r[0] for r in m_o["rows"]]
    req = np.array([r[2] for r in m_o["rows"]])
    got = np.array([r[3] for r in m_o["rows"]])
    pos = np.arange(len(names))

    fig, ax = plt.subplots(figsize=(9, 5))
    ax.barh(pos - 0.2, req, 0.4, label="Required", color="#D9D2C8")
    ax.barh(pos + 0.2, got, 0.4, label="Allocated", color="#C2571A")
    ax.set_yticks(pos)
    ax.set_yticklabels(names)
    ax.invert_yaxis()
    ax.set_xlabel("Volunteers")
    ax.set_title("Kala Fest - required vs allocated staff (optimised plan)")
    ax.legend()
    fig.tight_layout()
    fig.savefig(os.path.join(outdir, "chart_coverage.png"), dpi=150)
    plt.close(fig)

    labels = ["Weighted shortage", "Critical shortage"]
    h_vals = [m_h["weighted_shortage"], m_h["critical_shortage"]]
    o_vals = [m_o["weighted_shortage"], m_o["critical_shortage"]]
    fig, ax = plt.subplots(figsize=(6, 4))
    idx = np.arange(2)
    ax.bar(idx - 0.2, h_vals, 0.4, label="Heuristic", color="#B8AFA3")
    ax.bar(idx + 0.2, o_vals, 0.4, label="Optimised (ILP)", color="#2F7D4B")
    ax.set_xticks(idx)
    ax.set_xticklabels(labels)
    ax.set_title("Heuristic vs optimised allocation")
    ax.legend()
    fig.tight_layout()
    fig.savefig(os.path.join(outdir, "chart_comparison.png"), dpi=150)
    plt.close(fig)


# =============================================================================
# WEBSITE BRIDGE - writes privacy-safe js/data.js for the dashboard
# =============================================================================
def export_dashboard_data(volunteers, departments, path):
    dept_list = []
    for d in departments:
        item = {"id": d.dept_id, "name": d.name, "priority": d.priority, "start": d.start,
                "end": d.end, "type": "fixed", "required": d.fixed_required,
                "maxCap": d.max_capacity, "skill": d.skill, "prefs": d.prefs}
        if isinstance(d, ThroughputDepartment):
            item.update({"type": "throughput", "serviceMin": d.service_min, "peakMin": d.peak_min})
        dept_list.append(item)

    seed = {
        # Personal volunteer data stays in the local CSV / workbook and is
        # imported into the authenticated app by an organizer when needed.
        "volunteers": [],
        "skills": [{"name": n, "desc": t} for n, t in SKILL_CATALOG],
        "departments": dept_list,
        "committee": [],
        "events": [
            {"id": "E1", "name": "Kala Fest", "venue": "TAPMI Campus Main Auditorium & Open Air Amphitheatre",
             "date": "2026-11-14", "attendees": 400, "status": "Upcoming", "method": "optimal", "only": None},
            {"id": "E2", "name": "Core Committee Test Event", "venue": "TAPMI Auditorium",
             "date": "2026-11-15", "attendees": 100, "status": "Upcoming", "method": "optimal",
             "only": {"logistics": 2}},
        ],
    }
    with open(path, "w", encoding="utf-8") as f:
        f.write("// Generated by event_staffing_optimizer.py - do not edit by hand\n")
        f.write("window.SEED = " + json.dumps(seed, indent=1) + ";\n")


# =============================================================================
# SECTION 6  INPUT & OUTPUT - main program
# =============================================================================
def main():
    event_name, attendees = "Kala Fest", 400
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    volunteers = load_volunteers(CSV_FILE)
    if len(volunteers) == 0:
        return
    departments = build_departments()
    eligible = build_eligibility(volunteers, departments)

    print("Event:", event_name, "| Volunteers:", len(volunteers))
    print("\nLayer 1 - capacity planning")
    total_required = 0
    for d in departments:
        need = d.required_staff(attendees)
        total_required += need
        print(f"  {d.name:<32}{d.priority:<10}required={need}  eligible pool={len(eligible[d.dept_id])}")
    print("  TOTAL REQUIRED POSITIONS:", total_required)

    heur, t_h = timed(heuristic_allocation, volunteers, departments, eligible, attendees)
    opt, t_o = timed(optimized_allocation, volunteers, departments, eligible, attendees)
    m_h = evaluate(heur, departments, attendees)
    m_o = evaluate(opt, departments, attendees)

    print("\nLayer 2 - comparison")
    print(f"  {'Metric':<30}{'Heuristic':>12}{'Optimised':>12}")
    for label, key in [("Weighted shortage", "weighted_shortage"), ("Critical shortage", "critical_shortage"),
                       ("Departments fully staffed", "fully_staffed"), ("Volunteers allocated", "allocated")]:
        print(f"  {label:<30}{m_h[key]:>12}{m_o[key]:>12}")
    print(f"  {'Time (s)':<30}{t_h:>12.4f}{t_o:>12.4f}")

    print("\nOptimised plan by department")
    for name, pr, req, got, short in m_o["rows"]:
        print(f"  {name:<32}{got}/{req}  vacant={short}")
    print("  Coverage: {:.0f}%".format(100 * m_o["allocated"] / total_required))

    export_excel(os.path.join(OUTPUT_DIR, "Staffing_Allocation_Output.xlsx"), event_name, attendees,
                 volunteers, departments, eligible, heur, opt, m_h, m_o, t_h, t_o)
    make_charts(m_h, m_o, OUTPUT_DIR)
    export_dashboard_data(volunteers, departments, os.path.join("js", "data.js"))

    sample = find_volunteer(volunteers, "V042")
    print("\nBinary-search demo (V042):", sample["name"] if sample else "not found")
    print("Saved Excel, charts and js/data.js")


if __name__ == "__main__":
    main()
