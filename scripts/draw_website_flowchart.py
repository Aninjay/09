from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "TAPMI_Website_Logical_Flowchart.png"
W, H = 2400, 1800
BG = "#F5F3EF"
INK = "#202832"
MUTED = "#617080"
ORANGE = "#C2571A"
PALE = "#FFFDFC"
BLUE = "#E9F1F8"
GREEN = "#EAF4EC"
GOLD = "#F8F0DD"
PURPLE = "#F0ECF7"
LINE = "#AAB4BF"

im = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(im)
font_root = Path("/System/Library/Fonts/Supplemental")
regular = str(font_root / "Arial.ttf")
bold = str(font_root / "Arial Bold.ttf")

def f(size, heavy=False):
    return ImageFont.truetype(bold if heavy else regular, size)

def rounded(xy, fill, outline=None, radius=24, width=2):
    d.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)

def label(x, y, text, size=28, color=INK, heavy=False, anchor=None):
    d.text((x, y), text, font=f(size, heavy), fill=color, anchor=anchor)

def wrapped(x, y, text, width, size=23, color=INK, heavy=False, leading=1.26):
    ft = f(size, heavy)
    words, lines, line = text.split(), [], ""
    for word in words:
        trial = (line + " " + word).strip()
        if d.textbbox((0, 0), trial, font=ft)[2] <= width:
            line = trial
        else:
            if line: lines.append(line)
            line = word
    if line: lines.append(line)
    for i, s in enumerate(lines):
        d.text((x, y + int(i * size * leading)), s, font=ft, fill=color)
    return y + int(len(lines) * size * leading)

def arrow(points, color=LINE, width=6, head=17):
    d.line(points, fill=color, width=width, joint="curve")
    x1, y1 = points[-2]
    x2, y2 = points[-1]
    import math
    ang = math.atan2(y2-y1, x2-x1)
    a1, a2 = ang + 2.55, ang - 2.55
    d.polygon([(x2,y2), (x2+head*math.cos(a1), y2+head*math.sin(a1)), (x2+head*math.cos(a2), y2+head*math.sin(a2))], fill=color)

def node(x, y, w, h, title, body=None, fill=PALE, accent=ORANGE, title_size=28, body_size=21):
    rounded((x,y,x+w,y+h), fill, "#D8DDE2", 22, 2)
    d.rounded_rectangle((x,y,x+10,y+h), radius=5, fill=accent)
    label(x+28,y+22,title,title_size,INK,True)
    if body:
        wrapped(x+28,y+64,body,w-54,body_size,MUTED)

# Header
label(120, 62, "TAPMI  /  CULTURAL COMMITTEE", 23, ORANGE, True)
label(120, 105, "Website activity flow", 58, INK, True)
label(120, 182, "How people enter, manage event staffing, allocate volunteers, and save changes", 28, MUTED)
rounded((1880,75,2280,155), "#17313A", None, 38)
label(2080,101,"STATIC WEBSITE  •  NETLIFY",20,"#FFFFFF",True,anchor="mm")

# Entry flow
node(300,255,480,130,"1   Open the website","Static HTML, CSS and JavaScript load in the browser.",BLUE,"#3975A8",30,22)
node(960,255,480,130,"2   Demo sign-in","One email and password form; quick-fill buttons select a demo role.",GOLD,ORANGE,30,22)
node(1620,255,480,130,"3   Role-based navigation","The selected role controls which pages appear in the left menu.",PURPLE,"#7658A5",30,22)
arrow([(780,320),(960,320)])
arrow([(1440,320),(1620,320)])

# Role cards
label(120,440,"4   The role opens its workspace",32,INK,True)
cards=[
 (120,500,660,315,"CONVENOR  /  FULL ACCESS",GREEN,"#348153",[
   "Dashboard: events, coverage, staffing charts",
   "Events & Staffing: create events, set needs, compare plans",
   "Volunteers Roster: add, search, import or export CSV",
   "Core Committee: add members and assign department heads",
   "Skills Catalog and Audit History"]),
 (870,500,660,315,"CO-CONVENOR",BLUE,"#3975A8",[
   "Dashboard and event staffing",
   "Volunteer roster with CSV import / export",
   "Skills Catalog and Audit History",
   "Committee management is not in this role’s menu"]),
 (1620,500,660,315,"VOLUNTEER",PURPLE,"#7658A5",[
   "Opens My Portal",
   "Current page is a placeholder for personal schedules and contact details",
   "Signs out to return to the demo sign-in page"])
]
for x,y,w,h,title,fill,accent,items in cards:
    rounded((x,y,x+w,y+h),fill,"#D8DDE2",24,2)
    d.rounded_rectangle((x,y,x+w,y+70),radius=22,fill=accent)
    d.rectangle((x,y+48,x+w,y+72),fill=accent)
    label(x+28,y+20,title,27,"#FFFFFF",True)
    yy=y+98
    for item in items:
        d.ellipse((x+28,yy+8,x+40,yy+20),fill=accent)
        yy=wrapped(x+55,yy,item,w-82,21,INK)+9

# Shared operations
label(120,865,"5   Shared work inside the organizer dashboard",32,INK,True)
node(120,925,500,180,"Roster and CSV","Import updates matching volunteer IDs, adds new records, skips rows without names, and adds newly seen skills.",PALE,"#3975A8",27,20)
node(690,925,500,180,"Events and departments","Set event date, venue, attendance, priorities, shifts, required headcount, skills, and department capacity.",PALE,ORANGE,27,20)
node(1260,925,500,180,"Committee and department heads","Add core members, then manually assign one eligible person to one department head position.",PALE,"#7658A5",27,20)
node(1830,925,450,180,"Skills and activity log","Maintain the skills catalog, attach skills to volunteers, and review recorded changes.",PALE,"#348153",27,20)

# Join into application state and allocation
node(430,1180,1540,105,"Browser application state  •  roster + skills + events + committee + head assignments", "", "#FFF4E9", ORANGE, 30)
for cx in (370,940,1510,2055):
    arrow([(cx,1105),(cx,1140),(1200,1140),(1200,1180)],"#B47B55",4,13)

node(260,1360,650,205,"6   Check eligibility and allocate","Check each volunteer’s skill, maximum hours, and full-shift availability. Compare Optimised (ILP) with the Heuristic; each volunteer can take one department, subject to capacity and priority.",GOLD,ORANGE,28,21)
node(1000,1360,550,205,"7   Show results","Coverage, vacant positions, eligible pools, bottlenecks, recommendations, and assigned volunteers appear in the dashboard.",GREEN,"#348153",28,21)
node(1640,1360,550,205,"8   Save and refresh","Changes are saved in this browser’s local storage, then the view refreshes. CSV export downloads a file.",PURPLE,"#7658A5",28,21)
arrow([(1200,1285),(1200,1320),(585,1320),(585,1360)],ORANGE,5,15)
arrow([(910,1462),(1000,1462)],ORANGE,5,15)
arrow([(1550,1462),(1640,1462)],ORANGE,5,15)
arrow([(1915,1360),(1915,1318),(2200,1318),(2200,1180)],"#7658A5",4,14)

# Footer callout
rounded((120,1630,2280,1730),"#17313A",None,22)
label(155,1652,"DEPLOYMENT & DATA NOTE",20,"#F6B27D",True)
label(480,1652,"Netlify serves the static site; Python is a separate local reporting tool.",22,"#FFFFFF")
label(480,1685,"Demo sign-in is not real authentication. Local-storage changes stay in this browser and do not sync across devices.",20,"#D7E2E8")

im.save(OUT, optimize=True)
print(OUT)
