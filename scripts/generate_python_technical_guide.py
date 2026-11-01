from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "TAPMI_Volunteer_Allocation_System_Python_Technical_Guide.docx"
doc = Document()
sec = doc.sections[0]
sec.page_width, sec.page_height = Inches(8.27), Inches(11.69)
sec.top_margin, sec.bottom_margin = Inches(.72), Inches(.72)
sec.left_margin, sec.right_margin = Inches(.78), Inches(.78)

BLACK = "000000"
INK = "272522"
MUTED = "68635D"
ACCENT = "C2571A"
LIGHT = "F5F2ED"
DARK = "393631"

styles = doc.styles
normal = styles["Normal"]
normal.font.name = "Aptos"
normal.font.size = Pt(9.6)
normal.font.color.rgb = RGBColor.from_string(INK)
normal.paragraph_format.space_after = Pt(5)
normal.paragraph_format.line_spacing = 1.08
for sty_name, size in (("Title", 27), ("Subtitle", 12), ("Heading 1", 18), ("Heading 2", 13), ("Heading 3", 10.5)):
    sty = styles[sty_name]
    sty.font.name = "Aptos Display" if sty_name in ("Title", "Heading 1", "Heading 2") else "Aptos"
    sty.font.size = Pt(size)
    sty.font.color.rgb = RGBColor.from_string(BLACK)
    if sty_name.startswith("Heading"):
        sty.font.bold = True
        sty.paragraph_format.keep_with_next = True
        sty.paragraph_format.space_before = Pt(11 if sty_name == "Heading 1" else 7)
        sty.paragraph_format.space_after = Pt(4)
styles["Title"].paragraph_format.space_after = Pt(5)
styles["Subtitle"].font.color.rgb = RGBColor.from_string(MUTED)
styles["Subtitle"].paragraph_format.space_after = Pt(14)

def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), fill)
    tc_pr.append(shd)

def set_cell_margins(cell, top=80, start=100, bottom=80, end=100):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for edge, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn("w:" + edge))
        if node is None:
            node = OxmlElement("w:" + edge)
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")

def repeat_table_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)

def keep_row_together(row):
    tr_pr = row._tr.get_or_add_trPr()
    cant = OxmlElement("w:cantSplit")
    tr_pr.append(cant)

def set_repeat_table_style(table, widths=None):
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.style = "Table Grid"
    if widths:
        for row in table.rows:
            for i, width in enumerate(widths):
                row.cells[i].width = Inches(width)
    for i, cell in enumerate(table.rows[0].cells):
        set_cell_shading(cell, DARK)
        set_cell_margins(cell)
        for p in cell.paragraphs:
            p.paragraph_format.space_after = Pt(0)
            for run in p.runs:
                run.font.name = "Aptos"
                run.font.bold = True
                run.font.size = Pt(8.5)
                run.font.color.rgb = RGBColor(255, 255, 255)
    repeat_table_header(table.rows[0])
    keep_row_together(table.rows[0])
    for row in table.rows[1:]:
        keep_row_together(row)
        for cell in row.cells:
            set_cell_margins(cell)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            for p in cell.paragraphs:
                p.paragraph_format.space_after = Pt(0)
                for run in p.runs:
                    run.font.size = Pt(8.6)

def table(headers, rows, widths=None):
    t = doc.add_table(rows=1, cols=len(headers))
    for c, value in zip(t.rows[0].cells, headers):
        c.text = str(value)
    for row in rows:
        cells = t.add_row().cells
        for c, value in zip(cells, row):
            c.text = str(value)
    set_repeat_table_style(t, widths)
    doc.add_paragraph().paragraph_format.space_after = Pt(1)
    return t

def para(text="", bold_lead=None, style=None):
    p = doc.add_paragraph(style=style)
    if bold_lead and text.startswith(bold_lead):
        p.add_run(bold_lead).bold = True
        p.add_run(text[len(bold_lead):])
    else:
        p.add_run(text)
    return p

def bullet(text, level=0):
    p = doc.add_paragraph(style="List Bullet" if level == 0 else "List Bullet 2")
    p.paragraph_format.space_after = Pt(2)
    p.add_run(text)
    return p

def numbered(text):
    p = doc.add_paragraph(style="List Number")
    p.paragraph_format.space_after = Pt(3)
    p.add_run(text)
    return p

def code_line(text):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Inches(.12)
    p.paragraph_format.right_indent = Inches(.12)
    p.paragraph_format.space_before = Pt(1)
    p.paragraph_format.space_after = Pt(5)
    pPr = p._p.get_or_add_pPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), LIGHT)
    pPr.append(shd)
    r = p.add_run(text)
    r.font.name = "Aptos Mono"
    r.font.size = Pt(8.5)
    r.font.color.rgb = RGBColor.from_string(DARK)
    return p

def function_entry(name, signature, purpose, method, result, use):
    doc.add_heading(name, level=3)
    code_line(signature)
    para("Purpose. " + purpose, bold_lead="Purpose.")
    para("How it works. " + method, bold_lead="How it works.")
    para("Result. " + result, bold_lead="Result.")
    para("Where it is used. " + use, bold_lead="Where it is used.")

# Minimal page footer with page numbering.
footer = sec.footer.paragraphs[0]
footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
fr = footer.add_run("TAPMI Volunteer Allocation System  |  Python Technical Guide  |  ")
fr.font.name = "Aptos"
fr.font.size = Pt(8)
fr.font.color.rgb = RGBColor.from_string(MUTED)
field = OxmlElement("w:fldSimple")
field.set(qn("w:instr"), "PAGE")
footer._p.append(field)

# Cover and opening
p = doc.add_paragraph()
p.paragraph_format.space_before = Pt(40)
r = p.add_run("TAPMI CULTURAL COMMITTEE")
r.font.name = "Aptos"
r.font.bold = True
r.font.size = Pt(10)
r.font.color.rgb = RGBColor.from_string(ACCENT)
doc.add_paragraph("TAPMI Volunteer Allocation System Python Technical Guide", style="Title")
doc.add_paragraph("Functions, libraries, allocation logic, files, and deployment flow", style="Subtitle")
para("Prepared from the current project source code  |  November 2026")
doc.add_heading("Purpose and scope", level=1)
para("This guide explains the Python optimizer in event_staffing_optimizer.py and how it fits the TAPMI Volunteer Allocation System. It covers every Python class and function, each imported library, the volunteer data contract, the two allocation methods, the Excel and chart outputs, and the connection to the static website.")
para("The Python program performs the detailed optimization and reporting run locally. The published website is a separate static HTML, CSS, and JavaScript application. It can be hosted on Netlify without a server or database; its browser-side demo login is not security authentication, and its saved edits remain in that browser.")
doc.add_heading("System at a glance", level=2)
table(["Layer", "What it does", "Main files"], [
    ("Python analysis", "Reads the roster, checks eligibility, computes two allocation plans, compares results, and creates reports.", "event_staffing_optimizer.py, volunteers_complete.csv"),
    ("Website", "Shows the dashboard, edits roster and events, runs browser-side allocation, and stores edits in local storage.", "index.html, js/app.js, js/data.js, css/style.css"),
    ("Static deployment", "Copies only browser files to the publish folder used by Netlify.", "scripts/build_site.py, netlify.toml, dist/"),
], [1.15, 3.4, 2.55])
para("Important distinction. The optimizer's Excel workbook is the full Python report. The website does not load that workbook or execute Python after deployment. The browser has its own JavaScript allocation implementation.")

doc.add_heading("Contents", level=1)
for x in [
    "1  Project flow and files",
    "2  Libraries and language features",
    "3  Input data and department model",
    "4  Eligibility and allocation rules",
    "5  Python function reference",
    "6  Excel sheets and chart outputs",
    "7  Website and Netlify connection",
    "8  Running the Python program",
    "9  Assumptions and technical notes",
    "10  Glossary",
]: bullet(x)

doc.add_heading("1  Project flow and files", level=1)
para("The program follows a sequential data pipeline. Each stage prepares the information needed by the next one, so the eligibility rules are applied before either allocation method is run.")
table(["Stage", "Operation", "Functions or files"], [
    ("1. Load", "Read the CSV and convert each row to a volunteer dictionary.", "load_volunteers; volunteers_complete.csv"),
    ("2. Configure", "Create the ten staffing departments and their requirements.", "build_departments; Department"),
    ("3. Filter", "Identify which volunteers satisfy each department's skill, shift length, and availability rules.", "failed_criteria; build_eligibility"),
    ("4. Allocate", "Build a priority-first heuristic plan and a weighted integer-programming plan.", "heuristic_allocation; optimized_allocation"),
    ("5. Assess", "Calculate shortages, coverage, bottlenecks, recommendations, and run times.", "evaluate; detect_bottlenecks; generate_recommendations; timed"),
    ("6. Export", "Write an eight-sheet workbook, two PNG charts, and privacy-safe website starter data.", "export_excel; make_charts; export_dashboard_data"),
], [0.9, 3.75, 2.45])
doc.add_heading("Project files", level=2)
table(["Path", "Role in the project"], [
    ("event_staffing_optimizer.py", "Python source for capacity planning, eligibility, allocation, analysis, and exports."),
    ("volunteers_complete.csv", "Local optimizer input. Keep it out of public Git commits because it contains personal details."),
    ("output/Staffing_Allocation_Output.xlsx", "Generated local workbook with summary, coverage, assignments, comparison, bottlenecks, recommendations, unassigned people, and roster."),
    ("output/chart_coverage.png and output/chart_comparison.png", "Generated visual comparisons of staffing requirements and model results."),
    ("js/data.js", "Privacy-safe seed data for the browser dashboard. The Python export intentionally leaves volunteer and committee records empty."),
    ("scripts/build_site.py and netlify.toml", "Builds the allowlisted static site into dist/ and tells Netlify to publish that folder."),
], [2.65, 4.45])

doc.add_heading("2  Libraries and language features", level=1)
para("The optimizer combines Python's standard library with data, optimization, spreadsheet, and chart packages. Imports appear near the top of event_staffing_optimizer.py.")
table(["Library", "Type", "Where and why it is used"], [
    ("math", "Standard library", "math.ceil rounds attendee-based staffing requirements up to a whole person in ThroughputDepartment.required_staff."),
    ("os", "Standard library", "os.makedirs creates the output folder; os.path.join builds platform-safe file paths."),
    ("time", "Standard library", "time.perf_counter measures elapsed time for each allocation method."),
    ("json", "Standard library", "json.dumps serializes website starter data into valid JavaScript object syntax."),
    ("NumPy (numpy)", "External package", "Provides numeric arrays and rounding for chart coordinates and Excel coverage percentages."),
    ("Pandas (pandas)", "External package", "Loads CSV input into a DataFrame, prepares tabular report data, and writes worksheet tables."),
    ("Matplotlib (matplotlib.pyplot)", "External package", "Draws the coverage and heuristic-versus-optimized charts. The Agg backend renders PNG files without opening a desktop window."),
    ("PuLP (pulp)", "External package", "Builds the binary integer linear program and calls the bundled CBC solver to find an optimized assignment."),
    ("openpyxl.styles", "External package", "Applies bold white text and TAPMI-orange fill to Excel worksheet header cells."),
], [1.7, 1.25, 4.15])
doc.add_heading("Python features used", level=2)
para("The code also uses ordinary Python structures and control flow. Dictionaries store volunteer records and department plans; lists hold candidates and output rows; sets track assigned IDs; comprehensions build lookup maps and report records; loops process volunteers, departments, and spreadsheet cells; conditionals enforce eligibility and priority rules; and recursion implements binary search.")

doc.add_heading("3  Input data and department model", level=1)
doc.add_heading("Volunteer CSV fields", level=2)
table(["CSV column", "How the Python loader uses it", "Expected form"], [
    ("volunteer_id", "Unique key used in plans and report joins.", "V001"),
    ("name", "Name shown in assignments and recommendations.", "Text"),
    ("phone", "Copied into assignment and roster exports.", "Text or number stored as text"),
    ("skills", "Split on commas into a list; blank or None becomes an empty list.", "Comma-separated skill names"),
    ("availability_start / availability_end", "Compared with department shift boundaries.", "24-hour HH:MM"),
    ("max_hours", "Compared with the department shift duration.", "Numeric hours"),
    ("experience_level", "Parsed to an integer for ranking.", "Examples: 1 yr, 3+ yrs"),
    ("department_preference", "Split on commas when scoring preference matches.", "Comma-separated department labels"),
    ("interviewed_by", "Retained in the roster export and website source record when applicable.", "Text"),
], [1.55, 3.4, 2.15])
para("The loader expects the exact column names shown above. It catches a missing file and a Pandas parser error, but it does not validate every required column or cell type. Missing headers or malformed times can still raise errors later in the run.")
doc.add_heading("Department roles", level=2)
para("build_departments creates ten fixed staffing groups aligned with department_preference values: Event Planning & Execution, Finance & Budgeting, Logistics, Marketing & Promotions, Public Relations & Outreach, Sponsorships, Stage/ Backstage Management, Artist/ Participant Coordination, Vendor Management, and Hospitality. Each group also has a stable ID, priority, shift, fixed requirement, maximum capacity, optional skill rule, and preference labels.")
para("The current department list uses fixed headcounts. ThroughputDepartment remains implemented for future roles whose headcount grows with event attendance, but build_departments does not currently instantiate one.")
doc.add_heading("Department objects", level=2)
para("Department stores one staffing group. Its constructor retains the department ID and display name, priority, start and end time, fixed headcount, maximum capacity, optional required skill, and preference labels. shift_hours converts the shift endpoints and subtracts them. required_staff returns the fixed headcount. weight maps the priority label to its numeric objective weight.")
para("ThroughputDepartment extends Department. It stores service_min and peak_min, and overrides required_staff to compute ceil(attendees × service_min ÷ peak_min). This provides a reusable capacity-planning rule for attendee-facing departments such as registration, even though no current default role uses it.")

doc.add_heading("4  Eligibility and allocation rules", level=1)
doc.add_heading("Eligibility checks", level=2)
para("A volunteer is eligible for a department only when they pass every rule that department defines. A department may require a particular skill. The volunteer's maximum hours must cover the complete shift length. The volunteer's availability window must begin no later than the department shift and end no earlier than it.")
code_line("eligible(volunteer, department) = no failed criteria")
doc.add_heading("Capacity planning", level=2)
para("For the current fixed departments, required_staff returns the configured fixed headcount. For a ThroughputDepartment, the requirement is the ceiling of attendee workload multiplied by service minutes per attendee, divided by the peak service window in minutes. The allocator caps assigned staff at min(required staff, maximum capacity), while evaluate still reports the full requirement so any capacity shortfall remains visible.")
doc.add_heading("Preference and experience score", level=2)
para("tie_score starts with the volunteer's experience value and adds PREF_SCORE (10) when any comma-separated preference matches that department. This score ranks volunteers within the heuristic pool and acts as a small secondary reward in the integer program. The department priority weights are Critical 10, High 5, and Normal 1. Current default departments use High and Normal priorities.")
doc.add_heading("Heuristic allocation", level=2)
para("The heuristic processes departments by Critical, then High, then Normal. Within each department, it sorts eligible, not-yet-assigned volunteers by descending preference-and-experience score, then by ID for a stable tie. It assigns people until it reaches the smaller of the requirement and capacity. This method is quick and explainable, but an early choice can consume a volunteer needed by a later department.")
doc.add_heading("Optimized allocation", level=2)
para("The PuLP model creates a binary decision variable x(i,j) for each eligible volunteer i and department j, plus a nonnegative shortage variable s(j). Each volunteer can be assigned to at most one department. Each department receives no more than min(requirement, capacity). Shortage is constrained to be at least requirement minus assigned people.")
code_line("Minimize  Σ priority_weight(j) × shortage(j)  −  ε × Σ tie_score(i,j) × x(i,j)")
para("The small epsilon term (0.001) encourages preference and experience matches without materially changing the shortage objective for the current 30 total required positions. PuLP sends the model to CBC with solver messages disabled. The returned plan includes decision variables whose solution value exceeds 0.5.")
doc.add_heading("Metrics", level=2)
para("For each department, shortage is max(required − assigned, 0). Weighted shortage adds each shortage multiplied by the priority weight. Critical shortage sums only Critical groups. Fully staffed counts groups with zero shortage. Total allocated sums all assigned volunteers. The workbook reports coverage as allocated divided by required, expressed as a percentage.")

doc.add_heading("5  Python function reference", level=1)
para("This section documents every function defined in event_staffing_optimizer.py. The order follows the data flow from configuration and input through optimization and export.")
doc.add_heading("Configuration and model functions", level=2)
function_entry("Department.__init__", "Department(dept_id, name, priority, start, end, required, max_capacity, skill=None, prefs=())", "Stores the rules and labels for a fixed staffing group.", "Copies values into instance attributes and converts preference labels to a list. A missing skill means no skill-based exclusion is applied.", "A Department object used by all later functions.", "Called by build_departments. The class is defined near the top of the Python file.")
function_entry("Department.shift_hours", "Department.shift_hours()", "Calculates the length of a department shift.", "Calls to_hours for the end and start strings and subtracts start from end.", "Shift duration as a decimal number of hours.", "Called by failed_criteria and recommendation generation.")
function_entry("Department.required_staff", "Department.required_staff(attendees=0)", "Returns the configured fixed staffing need.", "Ignores attendees for a fixed department and returns fixed_required.", "Integer headcount requirement.", "Called by allocation, evaluation, bottleneck, and report functions.")
function_entry("Department.weight", "Department.weight()", "Converts a priority label into its shortage penalty.", "Looks up the label in PRIORITY_WEIGHT.", "Numeric weight: 10, 5, or 1 for Critical, High, or Normal.", "Used in the optimization objective and weighted shortage metric.")
function_entry("ThroughputDepartment.__init__", "ThroughputDepartment(dept_id, name, priority, start, end, max_capacity, service_min, peak_min, skill=None, prefs=())", "Defines a department whose staff requirement depends on attendee volume.", "Initializes the Department parent with zero fixed staff, then stores service_min and peak_min.", "A throughput department instance.", "Used when a future department needs a workload-based headcount.")
function_entry("ThroughputDepartment.required_staff", "ThroughputDepartment.required_staff(attendees=0)", "Calculates a whole-person requirement from expected workload.", "Computes math.ceil(attendees × service_min ÷ peak_min), rounding every fractional staff requirement upward.", "Integer headcount that scales with attendees.", "Overrides Department.required_staff for throughput roles.")
function_entry("build_departments", "build_departments()", "Creates the project's ten default staffing roles.", "Builds a list of Department objects with IDs, names, priorities, shifts, headcounts, capacity limits, skills, and CSV preference labels.", "The department list used for the event.", "Called in main before eligibility and allocation are computed.")
function_entry("to_hours", "to_hours(clock_text)", "Converts a 24-hour time string to decimal hours.", "Splits HH:MM, converts both pieces to integers, then returns hours plus minutes divided by 60. For example, 13:30 becomes 13.5.", "A numeric hour value.", "Used by Department.shift_hours and failed_criteria.")
function_entry("experience_years", "experience_years(text)", "Parses the leading integer from an experience label.", "Reads the first space-separated token, removes a plus sign, and converts it to int. Thus 3+ yrs becomes 3.", "An integer experience score.", "Used while load_volunteers converts CSV records.")

doc.add_heading("Input and eligibility functions", level=2)
function_entry("load_volunteers", "load_volunteers(path)", "Loads and normalizes volunteer records from CSV.", "Uses pd.read_csv, parses comma-separated skills, handles empty skill/preference values, converts phone to text, parses hours and experience, and builds one dictionary per row. It reports missing files and parser errors, returning an empty list for those cases.", "A list of dictionaries with id, name, phone, interviewer, skills, start, end, max_hours, exp, and pref.", "Called first by main. The current CSV_FILE constant is volunteers_complete.csv in the project root.")
function_entry("binary_search", "binary_search(sorted_ids, target, low, high)", "Recursively searches an already sorted list of volunteer IDs.", "Checks the midpoint. If it matches, returns the index; if the target is larger, recurses into the right half; otherwise recurses into the left half. It stops when low exceeds high.", "An integer index, or -1 when no match exists.", "Called by find_volunteer as a demonstration of recursive search.")
function_entry("find_volunteer", "find_volunteer(volunteers, vol_id)", "Finds one volunteer record by ID.", "Sorts records by ID, makes a parallel ID list, runs binary_search across the full index range, and returns the matching dictionary when found.", "A volunteer dictionary or None.", "main uses it to print a sample lookup for V042 after exports finish.")
function_entry("failed_criteria", "failed_criteria(vol, dept)", "Explains why a volunteer is not eligible for a department.", "Checks required skill, maximum hours against shift length, and full containment of the shift in the volunteer availability window. It appends a short rule code for each failure.", "A list containing zero or more of skill, hours, and window.", "Called by build_eligibility and generate_recommendations.")
function_entry("build_eligibility", "build_eligibility(volunteers, departments)", "Builds the candidate pool for each department.", "Loops over every department and volunteer, retaining IDs only when failed_criteria returns an empty list.", "A dictionary keyed by department ID, with eligible volunteer IDs as values.", "Called by main and consumed by both allocation methods and report generation.")
function_entry("tie_score", "tie_score(vol, dept)", "Ranks preference matches and experience as secondary assignment criteria.", "Starts with experience, splits the preference string on commas, trims each label, and adds PREF_SCORE when any label appears in dept.prefs.", "A numeric score; a matching department preference adds ten points.", "Used to sort heuristic candidates and as the optimizer's small secondary objective.")

doc.add_heading("Allocation and evaluation functions", level=2)
function_entry("heuristic_allocation", "heuristic_allocation(volunteers, departments, eligible, attendees)", "Creates a priority-first baseline allocation.", "Creates ID lookups and empty department lists; orders departments by priority; removes already assigned people from each candidate pool; sorts by tie_score and ID; and fills each department up to its requirement or capacity.", "A mapping from department ID to assigned volunteer ID list.", "Called by main as the baseline used in the comparison report.")
function_entry("optimized_allocation", "optimized_allocation(volunteers, departments, eligible, attendees)", "Finds a weighted shortage-minimizing assignment using integer programming.", "Creates binary x variables only for eligible pairs, nonnegative shortage variables, a weighted objective with a small tie-score reward, one-department-per-volunteer constraints, department capacity constraints, and shortage constraints. It solves with CBC and collects variables above 0.5.", "A mapping from department ID to sorted volunteer IDs.", "Called by main. This optimized plan drives the main workbook and coverage chart.")
function_entry("evaluate", "evaluate(plan, departments, attendees)", "Calculates comparable results for one allocation plan.", "For every department, computes required, allocated, and vacant staff; adds weighted and Critical shortages; counts fully staffed groups; and records a row for tabular output.", "A dictionary containing weighted_shortage, critical_shortage, fully_staffed, allocated, and rows.", "Called twice in main, once for the heuristic and once for the optimized plan.")
function_entry("timed", "timed(function, *args)", "Measures the elapsed runtime of a callable.", "Reads time.perf_counter before and after calling the function with the supplied arguments.", "A pair: (function result, elapsed seconds).", "Used by main to time both allocation methods for the comparison worksheet.")
function_entry("detect_bottlenecks", "detect_bottlenecks(plan, volunteers, departments, eligible, attendees)", "Labels the cause of each department shortage.", "Compares requirement, actual allocation, maximum capacity, and eligible pool size. A short department with enough eligible people is labeled as a shared-pool constraint.", "A list of row dictionaries with required, capacity, pool, allocation, shortage, and cause.", "Called by export_excel to populate the Bottlenecks sheet.")
function_entry("generate_recommendations", "generate_recommendations(plan, volunteers, departments, attendees)", "Suggests feasible steps to reduce shortages.", "Finds unassigned volunteers, checks which miss exactly one eligibility rule, ranks them by experience then ID, and suggests fixing that single rule. If candidates are insufficient it recommends recruiting; if required staff exceeds capacity it recommends raising capacity.", "A list of Department, Volunteer, and Action records.", "Called by export_excel for the Recommendations sheet.")

doc.add_heading("Reporting and integration functions", level=2)
function_entry("assignment_table", "assignment_table(plan, volunteers, departments)", "Converts assigned people into a row-oriented table.", "Builds a volunteer ID lookup and emits one row per assignment with department, contact, skills, shift, experience, and a preferred-this-department flag. Pandas turns these rows into a DataFrame.", "A Pandas DataFrame for the Assignments worksheet.", "Called inside export_excel.")
function_entry("export_excel", "export_excel(path, event_name, attendees, volunteers, departments, eligible, heur, opt, m_h, m_o, t_h, t_o)", "Creates the complete Excel report.", "Builds summary, coverage, comparison, unassigned-volunteer, and roster DataFrames; adds assignment, bottleneck, and recommendation tables; writes each as a worksheet with pandas.ExcelWriter and openpyxl; sets readable column widths and styles header rows.", "An eight-sheet .xlsx file at path.", "Called by main with the optimized plan and both method metrics.")
function_entry("make_charts", "make_charts(m_h, m_o, outdir)", "Creates the two PNG charts used in the Python report.", "Uses NumPy arrays for bar positions and values. Matplotlib draws required-versus-allocated staffing by department, then heuristic-versus-optimized weighted and Critical shortages. Each figure is tightened, saved, and closed.", "chart_coverage.png and chart_comparison.png inside outdir.", "Called by main after the workbook is written.")
function_entry("export_dashboard_data", "export_dashboard_data(volunteers, departments, path)", "Writes a browser-readable seed file for the website.", "Serializes department configuration, skills, and demo events to JSON, then writes a JavaScript assignment to window.SEED. It deliberately writes empty volunteer and committee lists so personal records are not published in static website assets.", "A privacy-safe js/data.js seed file.", "Called by main after local reports are generated. The live dashboard also supports importing a CSV through its own browser UI.")
function_entry("main", "main()", "Runs the full optimizer workflow for the configured event.", "Sets the demo event name and 400 attendees, creates output/, loads the configured CSV, exits early when no volunteers load, builds departments and eligibility, prints capacity and plan summaries, times both allocators, evaluates them, exports the workbook and charts, writes website seed data, and demonstrates find_volunteer for V042.", "Console summaries and generated files in output/ plus js/data.js.", "Runs only when the file is executed as the main Python program, through the if __name__ == '__main__' guard.")

doc.add_heading("6  Excel sheets and chart outputs", level=1)
table(["Worksheet", "Contents and purpose"], [
    ("Summary", "Event name, expected attendees, pool size, total required, allocated, vacancies, and coverage."),
    ("Dept_Coverage", "One row per department with priority, required, allocated, vacant, and coverage percent."),
    ("Assignments", "One row per assigned volunteer with department, ID, name, phone, skills, shift, experience, and preference indicator."),
    ("Heuristic_vs_Optimised", "Side-by-side weighted shortage, Critical shortage, fully staffed departments, allocated total, and runtime."),
    ("Bottlenecks", "Eligible pool and shortage cause for each role."),
    ("Recommendations", "Specific single-rule fixes, recruitment counts, and capacity actions."),
    ("Unassigned_Volunteers", "Volunteer records not used by the optimized plan, with skills and availability."),
    ("Volunteer_Roster", "Full normalized roster used in the Python run."),
], [1.8, 5.3])
para("All worksheets receive a dark orange header fill, bold white header text, and column widths based on their contents, capped at 60 characters. The coverage chart uses paired horizontal bars for required and allocated staff. The comparison chart uses paired bars for weighted and Critical shortage.")
doc.add_heading("7  Website and Netlify connection", level=1)
para("The website loads js/data.js before js/app.js. The seed file supplies skills, departments, and demo events. The roster itself is imported by a user through Volunteers Roster → Import CSV, then held in browser local storage. The Python exporter keeps volunteer and committee lists empty in the generated seed file.")
para("The browser-side allocation engine in js/app.js mirrors eligibility, priority, preference, and allocation behavior for interactive dashboard views. The Python optimizer is a separate local analysis/reporting tool; Netlify does not run Python after deployment.")
para("scripts/build_site.py creates dist/ from an explicit allowlist of browser assets. That keeps the CSV, Python source, and Excel workbook out of the published site bundle. netlify.toml specifies the build command and dist publish directory. The login is a demo role switcher with client-side sample credentials, not account security. Local-storage changes do not sync between browsers or devices.")

doc.add_heading("8  Running the Python program", level=1)
doc.add_heading("Install the packages", level=2)
code_line('pip install pandas numpy matplotlib openpyxl "pulp==2.9.0"')
doc.add_heading("Run from the project root", level=2)
code_line("python event_staffing_optimizer.py")
para("The script expects volunteers_complete.csv in the current working directory. It creates output/ if needed. A valid run writes the workbook and charts locally and refreshes js/data.js with privacy-safe starter configuration. The CSV and generated workbook contain personal volunteer details, so keep them local or in a private location.")
doc.add_heading("Common run issues", level=2)
table(["Symptom", "Likely cause", "What to check"], [
    ("ERROR: could not find ...", "The script was launched from a different working directory or the CSV is absent.", "Run from the project root or update CSV_FILE to the correct path."),
    ("Parser error", "CSV quoting or delimiters are malformed.", "Open the CSV and confirm it is comma-delimited with valid quoting."),
    ("KeyError for a field", "A required header is missing or spelled differently.", "Compare the header row with the field table in Section 3."),
    ("ModuleNotFoundError", "A required package is missing from the active Python environment.", "Install the packages in the same interpreter used to run the script."),
    ("CBC solve errors", "PuLP or its CBC solver is not available or the model failed.", "Confirm PuLP 2.9.0 is installed and inspect solver availability."),
], [1.55, 2.35, 3.2])

doc.add_heading("9  Assumptions and technical notes", level=1)
bullet("The optimizer is configured for one hard-coded event, Kala Fest, with 400 expected attendees. Edit main before using another event or attendee count.")
bullet("All ten current department roles use fixed headcounts. ThroughputDepartment is available but is not part of the current build_departments list.")
bullet("The integer model ensures a volunteer can receive at most one assignment. Department head assignments in the static app are a separate browser-side feature.")
bullet("The website login is a visual demo only. Do not treat its client-side roles as access control for confidential records.")
bullet("The Python loader handles missing files and Pandas parser errors, but required columns and time formats are not fully validated before downstream calculations.")
bullet("The current assignment_table preference label checks whether the full preference string equals one department label. Since a volunteer may have several comma-separated preferences, the report's Yes/No indicator can be inaccurate even though tie_score correctly splits the values. This affects that display field, not the eligibility rules.")
bullet("The current coverage calculations assume at least one required position overall. A future configuration with zero total required positions should guard against division by zero in export_excel and main.")

doc.add_heading("10  Glossary", level=1)
table(["Term", "Meaning in this project"], [
    ("Eligibility", "Whether a volunteer satisfies a department's skill, hours, and availability requirements."),
    ("Capacity", "The maximum number of volunteers that can be assigned to a department."),
    ("Shortage", "Required positions minus assigned volunteers, with negative values treated as zero."),
    ("Heuristic", "A priority-ordered assignment method used as an explainable baseline."),
    ("ILP", "Integer linear program. Here, binary variables represent assignment choices and the objective minimizes weighted vacancies."),
    ("CBC", "The open-source branch-and-cut solver used by PuLP to solve the integer model."),
    ("Tie score", "A preference and experience score that ranks otherwise comparable assignment choices."),
    ("Seed data", "Starter data in js/data.js that initializes the browser app without publishing personal roster details."),
    ("Local storage", "Browser storage used by this static demo to keep edits on one device and browser profile."),
], [1.45, 5.65])

doc.core_properties.title = "TAPMI Volunteer Allocation System Python Technical Guide"
doc.core_properties.subject = "Python functions, libraries, optimization model, and project data flow"
doc.core_properties.author = "TAPMI Cultural Committee"
doc.core_properties.keywords = "TAPMI, volunteer allocation, Python, PuLP, Pandas, NumPy, Matplotlib, openpyxl"
doc.save(OUT)
print(OUT)
