"""Drive the built tool in headless Chrome: load every preset, open every plot
tab, edit values, use the helper buttons, and report console errors.

Needs both builds first:  npm run build && npm run build:single
Run:  python -I test/browser_check.py [screenshot_dir]

Part 1 runs against `vite preview` (the GitHub Pages build), which this script
starts itself. Part 2 opens dist-single/index.html over file://.
"""
import base64
import json
import pathlib
import subprocess
import sys
import tempfile
import time
import urllib.request
import zipfile

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")

ROOT = pathlib.Path(__file__).resolve().parent.parent
PORT = 4173
URL = f"http://localhost:{PORT}/input-filter-tuner/"
SINGLE = (ROOT / "dist-single" / "index.html").as_uri()
SHOTS = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(tempfile.gettempdir()) / "filter-shots"
SHOTS.mkdir(parents=True, exist_ok=True)

errors = []
fails = []


def ok(cond, msg):
    print(("PASS  " if cond else "FAIL  ") + msg)
    if not cond:
        fails.append(msg)


def watch(page, tag=""):
    page.on("console", lambda m: errors.append(tag + m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(tag + str(e)))


def ready(page):
    page.wait_for_selector("#pl1 .main-svg", timeout=30000)


def settle(page, ms=150):
    page.wait_for_timeout(ms)


def commit(page, sel, text):
    page.fill(sel, text)
    page.press(sel, "Enter")
    settle(page)


def set_theme(page, name):
    page.get_by_role("button", name="Toggle theme").click()
    page.get_by_role("menuitem", name=name).click()
    settle(page, 300)


def no_hscroll(page, width, label):
    sw = page.evaluate("document.documentElement.scrollWidth")
    ok(sw <= width + 1, f"{label}: page scrollWidth {sw} at {width} px")


for need in [ROOT / "dist" / "index.html", ROOT / "dist-single" / "index.html"]:
    if not need.exists():
        sys.exit(f"missing {need}: run npm run build && npm run build:single")

server = subprocess.Popen(
    ["node", str(ROOT / "node_modules" / "vite" / "bin" / "vite.js"), "preview", "--port", str(PORT), "--strictPort"],
    cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
)
try:
    for _ in range(100):
        try:
            urllib.request.urlopen(URL, timeout=1)
            break
        except OSError:
            time.sleep(0.2)
    else:
        sys.exit("vite preview did not start")

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)

        # ---- Part 1: Pages build via vite preview ----
        page = browser.new_page(viewport={"width": 1500, "height": 1100})
        watch(page)
        dialogs = []
        page.on("dialog", lambda d: (dialogs.append(d.type), d.accept()))
        page.goto(URL)
        ready(page)

        n_presets = page.eval_on_selector("#preset", "s => s.options.length - 1")
        tabs = page.eval_on_selector_all("#tabs button", "bs => bs.map(b => b.dataset.t)")
        ok(n_presets == 14, f"{n_presets} presets listed")
        ok("emi" not in tabs, f"no EMI tab while EMI is off {tabs}")
        for i in range(n_presets):
            page.select_option("#preset", str(i))
            settle(page, 250)
            name = page.eval_on_selector("#preset", f"s => s.options[{i + 1}].text")
            kpis = page.inner_text("#kpis")
            parts = page.eval_on_selector_all("#sch .hit", "h => h.length")
            ok("Peak |Zout|" in kpis and parts > 0, f"preset '{name}': results and {parts} clickable parts")
            n_rows = page.eval_on_selector_all("#corners tbody tr", "r => r.length")
            n_worst = page.eval_on_selector_all("#corners tr[data-worst=true]", "r => r.length")
            ok(n_rows >= 1 and n_worst == 1, f"  corners card: {n_rows} rows, one marked worst")
            ok(page.locator("#tolerance").count() == 1, "  tolerance card shown")
            ok(page.locator("#emi").count() == 1 and page.locator("#emi-bands").count() == 0
               and not page.is_checked("#emi-on"), "  EMI card shown, off and collapsed")
            for t in tabs:
                page.click(f"#tabs button[data-t={t}]")
                settle(page, 120 if t != "sweep" else 400)
                n_tr = page.eval_on_selector("#pl1", "d => (d.data || []).length")
                if t == "sweep" and n_tr == 0:
                    msg = page.eval_on_selector("#pl1", "d => (d.layout.annotations || []).map(a => a.text).join()")
                    ok("Add an Rd-Cd leg" in msg, f"  tab {t}: no damping part, shows hint")
                else:
                    ok(n_tr > 0, f"  tab {t}: {n_tr} traces")
            page.click("#tabs button[data-t=zout]")
            settle(page)
            page.screenshot(path=str(SHOTS / f"preset_{i:02d}.png"), full_page=False)

        # Edit a value by typing (D1 Rd-Cd preset), check the margin changes.
        page.select_option("#preset", "1")
        settle(page, 250)
        before = page.inner_text("#kpis")
        first_rc = page.eval_on_selector_all("[id^=in-][id$=-rd]", "els => els[0].id")
        commit(page, f"#{first_rc}", "4.7")
        ok(before != page.inner_text("#kpis"), "typing Rd = 4.7 changes the results")
        # SI parsing with 4u7 style
        first_l = page.eval_on_selector_all("[id^=in-][id$=-L]", "els => els[0].id")
        commit(page, f"#{first_l}", "4u7")
        ok(page.input_value(f"#{first_l}") == "4.7u", "'4u7' parses to 4.7u")
        commit(page, f"#{first_l}", "22u")
        # Bad text is marked and not applied
        commit(page, f"#{first_l}", "abc")
        ok(page.get_attribute(f"#{first_l}", "aria-invalid") == "true", "bad text is marked invalid")
        commit(page, f"#{first_l}", "22u")
        # Optimum Rd and closed-form buttons
        page.click("button[data-h=opt]")
        settle(page, 400)
        rd_opt = page.input_value(f"#{first_rc}")
        page.click("button[data-h=cf]")
        settle(page)
        rd_cf = page.input_value(f"#{first_rc}")
        ok(rd_opt != "4.7" and rd_cf, f"optimum Rd = {rd_opt}, closed-form Rd = {rd_cf}")
        page.click("button[data-h=q]")
        settle(page)
        ok(page.input_value(f"#{first_rc}") == "1.06", f"Rd for Q=0.707 gives {page.input_value(f'#{first_rc}')} (D1 report: 1.06)")
        # Slider drag
        block_id = first_l.split("-")[1]
        page.locator(f"#card-{block_id} input[type=range]").first.fill("300")
        settle(page)
        ok(page.input_value(f"#{first_l}") != "22u", f"slider moves L to {page.input_value(f'#{first_l}')}")
        # Arrow key steps ×1.05
        commit(page, f"#{first_l}", "22u")
        page.focus(f"#{first_l}")
        page.keyboard.press("ArrowUp")
        settle(page)
        ok(page.input_value(f"#{first_l}") == "23.1u", f"ArrowUp steps L to {page.input_value(f'#{first_l}')} (22u × 1.05)")
        # Add each block type
        nblk = page.eval_on_selector_all("#blocks .blk", "b => b.length")
        for t in ["ind", "bead2", "bead4", "res", "cap", "rc"]:
            page.click(f"[data-add={t}]")
            settle(page, 100)
        ok(page.eval_on_selector_all("#blocks .blk", "b => b.length") == nblk + 6, "added 6 blocks")
        # Move, duplicate and remove
        ids = lambda: page.eval_on_selector_all("#blocks .blk", "b => b.map(x => x.id)")
        order = ids()
        page.click(f"#{order[1]} [data-a=up]")
        settle(page)
        ok(ids()[0] == order[1], "move up swaps the first two blocks")
        page.click(f"#{order[1]} [data-a=dn]")
        page.click(f"#{order[0]} [data-a=dup]")
        settle(page)
        ok(len(ids()) == len(order) + 1, "duplicate adds a block")
        page.click(f"#{ids()[1]} [data-a=rm]")
        settle(page)
        ok(ids() == order, "remove takes the copy out again")
        # Damping modes on an inductor card
        for mode in ["R", "RLpar", "RLser", "none"]:
            page.locator("#blocks .blk select").first.select_option(mode)
            settle(page, 100)
        ok(True, "switched inductor damping modes")
        # Clicking a schematic part focuses its input
        page.locator("#sch .hit").first.click()
        settle(page, 300)
        focused = page.evaluate("document.activeElement && document.activeElement.id")
        ok(bool(focused) and (focused.startswith("in-") or focused.startswith("src-")), f"schematic click focuses {focused}")
        # Snapshot must work without any dialog (some viewers block prompt()).
        n_dialogs = len(dialogs)
        page.click("#bSnap")
        settle(page)
        names = [t.get("name") or "" for t in page.evaluate("document.getElementById('pl1').data")]
        ok(any(n.startswith("S1:") for n in names) and len(dialogs) == n_dialogs, "snapshot trace shown, no dialog opened")
        ok(page.inner_text("#bSnap").strip() == "Snapshot (1)", "Snapshot button shows the count")
        page.click("#tabs button[data-t=zin]")
        settle(page)
        ok(any((t.get("name") or "").startswith("S1:") for t in page.evaluate("document.getElementById('pl1').data")), "snapshot shown on the Zin tab")
        page.click("#tabs button[data-t=zout]")
        # Snapshots survive a trip to the Notes page
        page.goto(URL + "#/notes")
        page.wait_for_selector("text=What the numbers mean")
        page.goto(URL + "#/")
        ready(page)
        ok(page.inner_text("#bSnap").strip() == "Snapshot (1)", "snapshot kept after visiting Notes")
        # Theme: plots follow it
        set_theme(page, "Light")
        bg_light = page.evaluate("document.getElementById('pl1')._fullLayout.paper_bgcolor")
        page.screenshot(path=str(SHOTS / "light_after_edits.png"), full_page=True)
        set_theme(page, "Dark")
        bg_dark = page.evaluate("document.getElementById('pl1')._fullLayout.paper_bgcolor")
        ok(bg_light != bg_dark, f"plot background follows the theme ({bg_light} / {bg_dark})")
        page.screenshot(path=str(SHOTS / "dark_after_edits.png"), full_page=True)
        # Tolerance + S21 mode
        page.check("#ps-tol")
        page.select_option("#ps-xfer", "S21")
        page.click("#tabs button[data-t=xfer]")
        settle(page)
        ok(page.eval_on_selector("#pl1", "d => d.data.some(t => (t.name||'').startsWith('S21'))"), "S21 mode plotted")
        ok(page.eval_on_selector("#pl1", "d => d.data.some(t => (t.name||'') === 'L and C')"), "tolerance curves plotted")
        # Reload keeps state (localStorage)
        page.reload()
        ready(page)
        ok(page.eval_on_selector_all("#blocks .blk", "b => b.length") == nblk + 6, "state survives reload")

        # Tolerance slider updates its text box
        page.locator("#ps-dL").locator("xpath=..").locator("input[type=range]").fill("750")
        settle(page)
        ok(page.input_value("#ps-dL") == "45", f"tolerance slider updates text box ({page.input_value('#ps-dL')})")
        commit(page, "#ps-dC", "-150")
        ok(page.input_value("#ps-dC") == "-90", f"tolerance text clamps to -90 ({page.input_value('#ps-dC')})")
        # Linear fields clamp
        page.select_option("#preset", "1")
        settle(page, 250)
        der = page.eval_on_selector_all("[id^=in-][id$=-derate]", "els => els[0].id")
        commit(page, f"#{der}", "100")
        ok(page.input_value(f"#{der}") == "90", f"DC-bias loss 100 clamps to {page.input_value(f'#{der}')}")
        commit(page, "#cv-eta", "0")
        ok(page.input_value("#cv-eta") == "0.3" and "NaN" not in page.inner_text("#kpis"), "efficiency 0 clamps to 0.3, no NaN")
        # Disabled block: helper buttons are disabled
        rc_card = page.locator(".blk", has=page.locator("[data-h=opt]")).first
        rc_card.locator("input[type=checkbox]").first.uncheck()
        settle(page)
        ok(page.locator(".blk.off [data-h=opt]").first.is_disabled(), "Optimum Rd is disabled on a disabled block")
        # Method A preset keeps a real capacitor
        page.select_option("#preset", "2")
        settle(page, 250)
        esr = page.eval_on_selector_all("[id^=in-][id$=-esr]", "els => els[0].value")
        ok(esr == "2.08", f"Method A preset is C1 with {esr} ohm ESR")
        # 2-stage: Rd1 uses its own (L1) section
        page.select_option("#preset", "10")
        settle(page, 400)
        info = page.eval_on_selector_all("#blocks .blk", "b => b[2].querySelector('[id^=info-]').textContent")
        ok(info.startswith("L1 section"), f"2-stage Rd1 info uses L1 section: '{info[:40]}'")
        # LQRx 02: sweep range covers the e-cap ESR (0.195 ohm)
        page.select_option("#preset", "12")
        settle(page, 250)
        page.click("#tabs button[data-t=sweep]")
        settle(page, 500)
        xr = page.eval_on_selector("#pl1", "d => [Math.min(...d.data[0].x), Math.max(...d.data[0].x)]")
        ok(xr[0] <= 0.195 <= xr[1], f"LQRx 02 sweep range {xr[0]:.4g}..{xr[1]:.4g} includes 0.195")
        page.click("#tabs button[data-t=zout]")
        # Bead datasheet form rejects fx = 0
        page.select_option("#preset", "8")
        settle(page, 250)
        cb_sel = "[id^=in-][id$=-cb]"
        cb_before = page.eval_on_selector_all(cb_sel, "els => els[0].value")
        page.locator("details summary").first.click()
        page.fill("input[data-k=fx]", "0")
        page.locator("details button").first.click()
        settle(page)
        fx_bad = "border-destructive" in (page.get_attribute("input[data-k=fx]", "class") or "")
        ok(fx_bad and page.eval_on_selector_all(cb_sel, "els => els[0].value") == cb_before, "bead form rejects fx = 0")
        # Bead datasheet form applies valid points (NP-DR-26004 check values)
        page.fill("input[data-k=fx]", "1M")
        page.fill("input[data-k=x]", "7.59")
        page.fill("input[data-k=fsrf]", "112M")
        page.fill("input[data-k=zmax]", "1082")
        page.locator("details button").first.click()
        settle(page)
        lb = page.eval_on_selector_all("[id^=in-][id$=-lb]", "els => els[0].value")
        ok(lb == "1.208u", f"bead form sets Lb = {lb} (7.59 Ω at 1 MHz)")
        # Copy link, edit, reload: the edit is kept
        page.click("#bLink")
        settle(page, 200)
        ok("d=" not in page.evaluate("location.hash"), "Copy link leaves the page URL alone")
        commit(page, "#cv-pout", "7")
        settle(page, 100)
        page.reload()
        ready(page)
        ok(page.input_value("#cv-pout") == "7", "edit after Copy link survives reload")

        # Hostile link: script in fields must not run, and the hash is cleared after loading
        bad = '<img src=x onerror="window.__pwned=1">'
        design = {
            "name": bad,
            "conv": {"vinMin": 12, "vinNom": 12, "vinMax": 12, "pout": 10, "eta": 1, "vout": 5, "fsw": 1e6, "k": bad, "fcheck": 1e6},
            "source": {"R": 0, "L": 0},
            "plot": {"z0": bad, "tab": "sweep"},
            "blocks": [
                {"type": "ind", "name": "L1", "L": 10e-6, "dcr": 0.02},
                {"type": "cap", "name": "C1", "c": 10e-6},
                {"type": "rc", "name": bad, "rd": 1, "cd": 47e-6, "_q": '"><img src=x onerror="window.__pwned=1">'},
                {"type": "constructor", "name": "x"},
                {"type": "__proto__", "name": "y"},
            ],
        }
        b64 = base64.b64encode(json.dumps(design).encode()).decode()
        x = browser.new_page(viewport={"width": 1400, "height": 1000})
        watch(x, "hostile link: ")
        x.goto(URL + "#d=" + b64)
        ready(x)
        settle(x, 600)
        ok(x.evaluate("window.__pwned") is None, "hostile link runs no script")
        ok(x.eval_on_selector_all("#blocks .blk", "b => b.length") == 3 and x.input_value("#ps-z0") == "50" and x.input_value("#cv-k") == "6",
           "hostile link: unknown types dropped, bad numbers replaced by defaults")
        ok(bad in x.inner_text("#plotnote"), "hostile block name is shown as text in the sweep note")
        ok("d=" not in x.evaluate("location.hash"), f"link hash is cleared after loading ({x.evaluate('location.hash')})")
        x.close()

        # ---- M1a: operating-point corners and curves ----
        c = browser.new_page(viewport={"width": 1440, "height": 1000})
        watch(c, "m1a: ")
        c.goto(URL)
        ready(c)
        names = c.eval_on_selector_all("#preset option", "os => os.map(o => o.text)")[1:]

        def pick(prefix):
            c.select_option("#preset", str(next(i for i, n in enumerate(names) if n.startswith(prefix))))
            settle(c, 300)

        def rows():
            return c.eval_on_selector_all("#corners tbody tr", r"rs => rs.map(r => r.innerText.replace(/\s+/g, ' '))")

        def worst_row():
            return c.inner_text("#corners tr[data-worst=true]")

        pick("D4")
        r = rows()
        ok(len(r) == 2 and "26.8 dB" in worst_row() and "light" in worst_row() and "28.5 dB" in r[1],
           f"D4 corners: light 26.8 dB (worst), full 28.5 dB {r}")
        zt = c.eval_on_selector("#pl1", "d => d.data.map(t => t.name)")
        ok(any("Worst corner" in (n or "") for n in zt), "D4 Zout tab draws the worst-corner trace")
        pick("LQRx 02")
        r = rows()
        ok(len(r) == 3 and "13.0 dB" in r[0] and "21.2 dB" in r[1] and "15 V" in worst_row(),
           f"LQRx 02 corners: 13 dB at 15 V (worst), 21 dB at 24 V {r}")
        zt = c.eval_on_selector("#pl1", "d => d.data.map(t => t.name)")
        ok(not any("Worst corner" in (n or "") for n in zt), "no worst-corner trace without curves")
        # Paste a SimSurfing-style CSV into Cf (third block): the corner rows change
        cf = c.locator("#blocks .blk").nth(2)
        cf.locator("[id^=curve-btn-]").click()
        box = cf.locator("textarea[id^=curve-]")
        box.fill("DC Bias Voltage [V],Capacitance [F]\n0,4.7E-06\n15,3.4E-06\n24,2.6E-06\n28,2.3E-06")
        box.press("Tab")
        settle(c, 400)
        r2 = rows()
        ok(r2 != r and "4 pts" in cf.inner_text(), f"curve on Cf changes the corner rows {r2}")
        c.reload()
        ready(c)
        settle(c, 300)
        ok(rows() == r2, "curve survives reload")
        # A #d= link with curves and light load
        d4link = {
            "name": "D4 link",
            "conv": {"vinMin": 12, "vinNom": 12, "vinMax": 12, "pout": 10, "pLight": 2, "eta": 1, "vout": 5, "fsw": 1.1e6, "fcheck": 1.1e6},
            "source": {"R": 0, "L": 0},
            "blocks": [
                {"type": "bead4", "name": "FB1", "rs": 0.05, "lb": 1e-6, "rp": 150, "cb": 2e-12, "li": [[0, 1e-6], [0.83, 0.8e-6]]},
                {"type": "res", "name": "R1", "r": 0.068},
                {"type": "cap", "name": "C1", "c": 10e-6, "esr": 0, "n": 2, "derate": 30, "cv": [[0, 10e-6], [12, 7e-6]]},
            ],
        }
        # A new page, because a hash change alone does not reload the app.
        c.close()
        c = browser.new_page(viewport={"width": 1440, "height": 1000})
        watch(c, "m1a link: ")
        c.goto(URL + "#d=" + base64.b64encode(json.dumps(d4link).encode()).decode())
        ready(c)
        settle(c, 500)
        ok(len(rows()) == 2 and "167" in rows()[0] and c.input_value("#cv-pLight") == "2",
           f"#d= link keeps pLight and curves {rows()}")
        ok(c.locator("#blocks .blk").nth(0).inner_text().count("2 pts") == 1
           and c.locator("#blocks .blk").nth(2).inner_text().count("2 pts") == 1, "#d= link keeps li on FB1 and cv on C1")
        # A linked design is saved locally on the first edit (persist.ts).
        commit(c, "#cv-pLight", "3")
        settle(c, 200)
        c.reload()
        ready(c)
        settle(c, 300)
        ok(len(rows()) == 2 and "250 mA" in rows()[0] and c.input_value("#cv-pLight") == "3",
           f"linked curves survive an edit and a reload {rows()}")
        # Clearing the box removes the curve
        fb = c.locator("#blocks .blk").nth(0)
        fb.locator("[id^=curve-btn-]").click()
        fb.locator("textarea[id^=curve-]").fill("")
        fb.locator("textarea[id^=curve-]").press("Tab")
        settle(c, 400)
        ok(len(rows()) == 1 and "pts" not in fb.inner_text(), f"clearing the L box removes the curve and the light rows {rows()}")
        c.screenshot(path=str(SHOTS / "m1a_corners.png"), full_page=True)
        c.close()

        # ---- M1b: part tolerances ----
        t = browser.new_page(viewport={"width": 1440, "height": 1000})
        watch(t, "m1b: ")
        t.goto(URL)
        ready(t)
        tnames = t.eval_on_selector_all("#preset option", "os => os.map(o => o.text)")[1:]
        d1rc = str(next(i for i, n in enumerate(tnames) if n.startswith("D1 · LC + Rd-Cd")))

        def tol_run(pg, n="200"):
            pg.fill("#tol-n", n)
            pg.click("#tol-run")
            pg.wait_for_function("() => !document.querySelector('#tol-cancel') && document.querySelector('#tol-table')", timeout=60000)
            settle(pg, 300)
            return pg.eval_on_selector_all("#tol-table tbody tr", r"rs => rs.map(r => r.innerText.replace(/\s+/g, ' '))")

        def blk_id(pg, i):
            return pg.locator("#blocks .blk").nth(i).locator("[id^=tol-btn-]").get_attribute("id")[len("tol-btn-"):]

        t.select_option("#preset", d1rc)
        settle(t, 300)
        card = t.inner_text("#tolerance")
        ok("2 tolerances: all 4 extremes per corner" in card, "D1 Rd-Cd: L1 ±30 % and C1 ±40 % counted")
        ok("1 tol" in t.locator("#blocks .blk").nth(0).inner_text()
           and "1 tol" in t.locator("#blocks .blk").nth(1).inner_text(), "block cards show the tol badge")
        r = tol_run(t)
        ok(len(r) == 1 and "0.48 to 0.99" in r[0], f"D1 extremes: one corner, Q 0.48 to 0.99 {r}")
        ok(t.eval_on_selector("#tol-hist", "d => (d.data || []).length") == 1, "board-margin histogram drawn")
        ok("Worst board" in t.inner_text("#tol-worst") and "L1 L" in t.inner_text("#tol-worst"), "worst board lists its parts")
        ok(tol_run(t) == r, "same draws give the same numbers")
        # C1 tolerance to 0: the result goes stale, then L only (NP-DR-26001: Q 0.84 at L -30 %)
        c1 = blk_id(t, 1)
        t.click(f"#tol-btn-{c1}")
        commit(t, f"#tol-{c1}-c", "0")
        settle(t, 300)
        ok(t.locator("#tol-stale").count() == 1, "editing a tolerance marks the result stale")
        ok("1 tolerance: all 2 extremes" in t.inner_text("#tolerance")
           and "tol" not in t.locator("#blocks .blk").nth(1).locator(f"#tol-btn-{c1}").inner_text(),
           "C1 tolerance cleared")
        r = tol_run(t)
        ok("0.62 to 0.84" in r[0] and t.locator("#tol-stale").count() == 0, f"L1 ±30 % only: Q up to 0.84 (report) {r}")
        t.click("#ps-und")
        settle(t, 300)
        ok(t.locator("#tol-stale").count() == 0, "a view setting does not mark the tolerance run stale")
        t.set_viewport_size({"width": 390, "height": 900})
        settle(t, 300)
        no_hscroll(t, 390, "tolerance card at 390 px")
        for theme in ["Light", "Dark"]:
            set_theme(t, theme)
            for vw in [390, 1440]:
                t.set_viewport_size({"width": vw, "height": 1000})
                settle(t, 300)
                t.locator("#tolerance").screenshot(path=str(SHOTS / f"m1b_tolerance_{vw}_{theme.lower()}.png"))
                t.locator("#blocks .blk").nth(0).screenshot(path=str(SHOTS / f"m1b_editor_{vw}_{theme.lower()}.png"))
        t.close()
        # A #d= link with tolerances (95 % is clamped to 80 %), then an edit and a reload
        tlink = {
            "name": "Tol link",
            "conv": {"vinMin": 48, "vinNom": 48, "vinMax": 48, "pout": 100, "eta": 1, "vout": 12, "fsw": 5e5, "fcheck": 5e5},
            "source": {"R": 0, "L": 0},
            "blocks": [
                {"type": "ind", "name": "L1", "L": 22e-6, "dcr": 0.02, "tol": {"L": 20, "esr": 5}},
                {"type": "cap", "name": "C1", "c": 10e-6, "esr": 0, "tol": {"c": 95}},
                {"type": "rc", "name": "Rd1", "rd": 1.06, "cd": 150e-6, "tol": {"rd": 1, "cd": "x"}},
            ],
        }
        t = browser.new_page(viewport={"width": 1440, "height": 1000})
        watch(t, "m1b link: ")
        t.goto(URL + "#d=" + base64.b64encode(json.dumps(tlink).encode()).decode())
        ready(t)
        settle(t, 500)
        ok("3 tolerances: all 8 extremes" in t.inner_text("#tolerance"), "#d= link keeps tol, drops bad keys")
        c1 = blk_id(t, 1)
        t.click(f"#tol-btn-{c1}")
        ok(t.input_value(f"#tol-{c1}-c").strip().startswith("80"), f"95 % clamped to 80 % ({t.input_value(f'#tol-{c1}-c')})")
        commit(t, f"#tol-{c1}-c", "10")
        settle(t, 200)
        t.reload()
        ready(t)
        settle(t, 300)
        c1 = blk_id(t, 1)
        t.click(f"#tol-btn-{c1}")
        ok("3 tolerances" in t.inner_text("#tolerance") and t.input_value(f"#tol-{c1}-c").strip().startswith("10"),
           "tolerances survive an edit and a reload")
        t.close()

        # ---- M6: undo/redo, saved designs, exports ----
        w = browser.new_page(viewport={"width": 1440, "height": 1000})
        watch(w, "m6: ")
        w.goto(URL)
        ready(w)
        kp = lambda: w.inner_text("#kpis")
        ok(w.is_disabled("#bUndo") and w.is_disabled("#bRedo"), "undo and redo start disabled")
        w.select_option("#preset", "8")
        settle(w, 300)
        d4 = kp()
        ok("26.8 dB" in d4 and w.is_enabled("#bUndo"), "preset change can be undone")
        # A slider drag is one undo step
        rng = w.locator("#blocks .blk input[type=range]").first
        for v in ["300", "320", "340", "360"]:
            rng.fill(v)
        settle(w, 300)
        ok(kp() != d4, "slider drag changes the results")
        w.click("#bUndo")
        settle(w, 300)
        ok(kp() == d4, "one undo reverts the whole slider drag")
        # Ctrl+Z outside text fields; browser undo inside them
        w.select_option("#preset", "1")
        settle(w, 300)
        w.evaluate("document.activeElement && document.activeElement.blur()")
        w.keyboard.press("Control+z")
        settle(w, 300)
        ok(kp() == d4, "Ctrl+Z undoes the preset change")
        w.focus("#cv-pout")
        w.keyboard.press("Control+z")
        settle(w, 300)
        ok(kp() == d4, "Ctrl+Z in a text field is left to the browser")
        w.evaluate("document.activeElement.blur()")
        w.keyboard.press("Control+y")
        settle(w, 300)
        ok(kp() != d4, "Ctrl+Y redoes")
        w.keyboard.press("Control+z")
        settle(w, 300)
        # Saved designs, notes, overlay, compare
        w.fill("#saveName", "My D4")
        w.click("#bSaveAs")
        settle(w)
        ok("My D4" in w.inner_text("#savedList"), "Save as adds the design to the list")
        w.fill("#notes", "Bead from batch 7: <b>check</b>")
        w.press("#notes", "Tab")
        settle(w)
        w.get_by_label("Overlay My D4").check()
        settle(w, 300)
        names = lambda: [t.get("name") or "" for t in w.evaluate("document.getElementById('pl1').data")]
        ok("My D4" in names(), "overlay toggle draws the saved design")
        w.reload()
        ready(w)
        settle(w, 300)
        ok("My D4" in names() and w.inner_text("#bSnap").strip() == "Snapshot (1)", "saved design and its overlay survive a reload")
        ok(w.input_value("#notes") == "Bead from batch 7: <b>check</b>", "design notes survive a reload")
        w.select_option("#preset", "1")
        settle(w, 300)
        w.select_option("#cmpSel", label="My D4")
        settle(w)
        cmp_text = w.inner_text("#cmpTab")
        ok("26.8 dB" in cmp_text and "Current" in cmp_text, "compare table shows the saved margin")
        w.locator("#savedList li", has_text="My D4").get_by_role("button", name="Load").click()
        settle(w, 300)
        ok("26.8 dB" in kp(), "Load brings the saved design back")
        bad = '<img src=x onerror="window.__pwned=1">'
        w.fill("#saveName", bad)
        w.click("#bSaveAs")
        settle(w)
        w.get_by_label("Overlay " + bad).check()
        settle(w, 300)
        ok(w.evaluate("window.__pwned") is None and bad in w.inner_text("#savedList"), "hostile design name is shown as text")
        for theme in ["dark", "light"]:
            if theme == "light":
                set_theme(w, "Light")
            for vw in [1440, 390]:
                w.set_viewport_size({"width": vw, "height": 1000})
                settle(w, 300)
                no_hscroll(w, vw, f"m6 {theme} {vw} px")
                w.locator("#designs").screenshot(path=str(SHOTS / f"designs_{vw}_{theme}.png"))
        set_theme(w, "Dark")
        w.set_viewport_size({"width": 1440, "height": 1000})
        w.locator("#savedList li", has_text=bad).get_by_role("button", name="Delete").click()
        settle(w)
        ok(bad not in w.inner_text("#savedList"), "Delete removes the design")
        # SPICE netlist
        with w.expect_download() as dl:
            w.click("#bSpice")
        cir = pathlib.Path(dl.value.path()).read_text(encoding="utf-8")
        ok(dl.value.suggested_filename.endswith(".cir") and "V_h_src" in cir and ".meas AC zpk" in cir and cir.rstrip().endswith(".end"),
           f"SPICE export downloads {dl.value.suggested_filename}")
        # Plot images in light colours while the page is dark
        with w.expect_download() as dl:
            w.click("#bPlotSvg")
        svg = pathlib.Path(dl.value.path()).read_text(encoding="utf-8")
        ok(svg.lstrip().startswith("<svg") and "var(--" not in svg and "rgb(255, 255, 255)" in svg,
           f"plot SVG export is light and has no CSS variables ({len(svg)} chars)")
        with w.expect_download() as dl:
            w.click("#bPlotPng")
        png = pathlib.Path(dl.value.path()).read_bytes()
        ok(png[:4] == b"\x89PNG" and len(png) > 10000, f"plot PNG export ({len(png)} bytes)")
        # Report zip (D4 is loaded)
        w.click("#bReport")
        w.fill("#rp-author", "Test Author")
        w.fill("#rp-docNo", "NP-DR-TEST")
        with w.expect_download() as dl:
            w.click("#bReportGo")
        ok(dl.value.suggested_filename == "NP-DR-TEST.zip", f"report zip name {dl.value.suggested_filename}")
        with zipfile.ZipFile(dl.value.path()) as z:
            files = sorted(n for n in z.namelist() if not n.endswith("/"))
            want = sorted("NP-DR-TEST/" + n for n in ["report.md", "fig_schematic.svg", "fig_zout.svg", "fig_xfer.svg", "fig_zin.svg"])
            ok(files == want, f"report zip has report.md and four SVGs (EMI off) {files}")
            md = z.read("NP-DR-TEST/report.md").decode("utf-8")
            svgs = {n: z.read(n).decode("utf-8") for n in files if n.endswith(".svg")}
        for n, x in svgs.items():
            (SHOTS / n.split("/")[-1]).write_text(x, encoding="utf-8")
        (SHOTS / "report.md").write_text(md, encoding="utf-8")
        fm = md.split("---")[1]
        keys = [l.split(":", 1)[0] for l in fm.strip().splitlines()]
        allowed = {"title", "subtitle", "short_title", "author", "doc_no", "date", "revision", "kicker", "specs", "note", "subscripts"}
        ok("26.8 dB" in md and "author: Test Author" in md and set(keys) <= allowed, f"report.md: D4 margin 26.8 dB, front matter keys {keys}")
        ok(all(x.lstrip().startswith("<svg") and "var(--" not in x for x in svgs.values()), "report figures are standalone SVGs with no CSS variables")
        settle(w, 500)
        w.click("#bReport")
        w.wait_for_selector("#rp-author", timeout=5000)
        ok(w.input_value("#rp-author") == "Test Author", "report author is remembered")
        w.keyboard.press("Escape")
        # With the time domain on: three more figures and two LTspice netlists
        settle(w, 300)
        w.check("#tran-on")
        settle(w, 300)
        w.click("#bReport")
        w.wait_for_selector("#rp-author", timeout=5000)
        with w.expect_download() as dl:
            w.click("#bReportGo")
        with zipfile.ZipFile(dl.value.path()) as z:
            files = sorted(n.split("/")[-1] for n in z.namelist() if not n.endswith("/"))
            md = z.read("NP-DR-TEST/report.md").decode("utf-8")
            hot = z.read("NP-DR-TEST/fig_hotplug.svg").decode("utf-8") if "fig_hotplug.svg" in files else ""
            for n in ["fig_hotplug.svg", "fig_loadstep.svg", "fig_ripple.svg"]:
                if n in files:
                    (SHOTS / n).write_text(z.read("NP-DR-TEST/" + n).decode("utf-8"), encoding="utf-8")
        want = {"fig_hotplug.svg", "fig_loadstep.svg", "fig_ripple.svg", "spice_hotplug.cir", "spice_loadstep.cir"}
        ok(want <= set(files) and "## 4. Time domain" in md and hot.lstrip().startswith("<svg") and "var(--" not in hot,
           f"report zip with time domain: section 4, three figures, two netlists {files}")
        w.close()

        # ---- M2: conducted EMI ----
        e = browser.new_page(viewport={"width": 1440, "height": 1000})
        watch(e, "m2: ")
        e.goto(URL)
        ready(e)
        enames = e.eval_on_selector_all("#preset option", "os => os.map(o => o.text)")[1:]
        e.select_option("#preset", str(next(i for i, n in enumerate(enames) if n.startswith("2-stage LC"))))
        settle(e, 300)
        e.check("#emi-on")
        settle(e, 300)
        n8 = e.eval_on_selector_all("#emi-bands tbody tr", "r => r.length")
        ok(n8 == 8 and e.locator("#tabs button[data-t=emi]").count() == 1,
           f"EMI on: {n8} bands and the EMI tab appears")
        v5 = e.inner_text("#emi-verdict")
        e.select_option("#emi-cls", "1")
        settle(e, 300)
        v1 = e.inner_text("#emi-verdict")
        ok(v5 != v1 and v1.startswith("PASS"), f"EMI class 5 -> 1 changes the verdict ('{v5[:30]}' -> '{v1[:30]}')")
        e.select_option("#emi-std", "cispr32")
        settle(e, 300)
        n32 = e.eval_on_selector_all("#emi-bands tbody tr", "r => r.length")
        ok(e.input_value("#emi-cls") == "B" and n32 == 3, f"CISPR 32 picks class B and shows {n32} bands")
        e.click("#tabs button[data-t=emi]")
        settle(e, 300)
        n_main = e.eval_on_selector("#pl1", "d => (d.data || []).length")
        n_side = e.eval_on_selector("#pl2", "d => (d.data || []).length")
        ok(n_main >= 4 and n_side == 2, f"EMI tab: {n_main} traces, side plot {n_side} traces")
        e.reload()
        ready(e)
        settle(e, 300)
        ok(e.input_value("#emi-std") == "cispr32" and e.is_checked("#emi-on"), "EMI settings survive a reload")
        e.click("#tabs button[data-t=emi]")
        settle(e, 200)
        e.uncheck("#emi-on")
        settle(e, 300)
        sel = e.eval_on_selector("#tabs button[aria-selected=true]", "b => b.dataset.t")
        ok(sel == "zout" and e.locator("#tabs button[data-t=emi]").count() == 0
           and e.locator("#emi-bands").count() == 0, f"EMI off on the EMI tab goes to {sel}, tab hidden")
        e.close()
        # A #d= link with EMI settings (bad class falls back to the strictest)
        elink = {
            "name": "EMI link",
            "conv": {"vinMin": 12, "vinNom": 12, "vinMax": 12, "pout": 10, "eta": 1, "vout": 5, "fsw": 4e5, "fcheck": 4e5},
            "source": {"R": 0, "L": 0},
            "blocks": [{"type": "ind", "name": "L1", "L": 10e-6, "dcr": 0.01}, {"type": "cap", "name": "C1", "c": 10e-6}],
            "emi": {"on": True, "std": "cispr25", "cls": "9", "lines": 2, "tr": 5e-9, "margin": 3},
        }
        e = browser.new_page(viewport={"width": 1440, "height": 1000})
        watch(e, "m2 link: ")
        e.goto(URL + "#d=" + base64.b64encode(json.dumps(elink).encode()).decode())
        ready(e)
        settle(e, 300)
        ok(e.is_checked("#emi-on") and e.input_value("#emi-cls") == "5" and e.input_value("#emi-lines") == "2"
           and e.input_value("#emi-margin") == "3", "#d= link keeps emi, bad class gives class 5")
        # A reload with no edit keeps the linked design (the hash is gone by then)
        e.reload()
        ready(e)
        settle(e, 300)
        ok(e.is_checked("#emi-on") and e.input_value("#emi-lines") == "2"
           and "EMI link" not in e.url, "a link survives a reload with no edit")
        e.close()
        # LQRx 03 at 9.39 V cannot regulate (D > 1): the card says so
        e = browser.new_page(viewport={"width": 1440, "height": 1000})
        watch(e, "m2 dropout: ")
        e.goto(URL)
        ready(e)
        e.select_option("#preset", str(next(i for i, n in enumerate(enames) if n.startswith("LQRx 03"))))
        settle(e, 300)
        e.check("#emi-on")
        settle(e, 300)
        drop = e.inner_text("#emi-dropout") if e.locator("#emi-dropout").count() else ""
        ok("9.39 V, full" in drop, f"EMI dropout note on LQRx 03: '{drop[:60]}'")
        e.locator("#emi").screenshot(path=str(SHOTS / "bugfix_emi_dropout.png"))
        e.close()
        for theme in ["Dark", "Light"]:
            for vw in [1440, 390]:
                e = browser.new_page(viewport={"width": vw, "height": 1000})
                watch(e, "m2 shots: ")
                e.goto(URL)
                ready(e)
                if theme == "Light":
                    set_theme(e, "Light")
                e.locator("#emi").screenshot(path=str(SHOTS / f"m2_emi_off_{vw}_{theme.lower()}.png"))
                e.check("#emi-on")
                settle(e, 300)
                e.click("#tabs button[data-t=emi]")
                settle(e, 400)
                no_hscroll(e, vw, f"m2 {theme.lower()} {vw} px")
                e.locator("#emi").screenshot(path=str(SHOTS / f"m2_emi_card_{vw}_{theme.lower()}.png"))
                e.locator("#pl1").screenshot(path=str(SHOTS / f"m2_emi_tab_{vw}_{theme.lower()}.png"))
                e.close()

        # ---- M4: time domain ----
        def tran_ready(pg):
            pg.wait_for_function(
                "() => (document.querySelector('#tran-summary')?.textContent || '').startsWith('Hot-plug')"
                " && !document.querySelector('#tran-summary').textContent.includes('Updating')",
                timeout=20000)

        t4 = browser.new_page(viewport={"width": 1440, "height": 1000})
        watch(t4, "m4: ")
        t4.goto(URL)
        ready(t4)
        ok(t4.locator("#tran-rows").count() == 0 and not t4.is_checked("#tran-on")
           and t4.locator("#tabs button[data-t=time]").count() == 0, "Time card off by default, no Time tab")
        tnames = t4.eval_on_selector_all("#preset option", "os => os.map(o => o.text)")[1:]
        missing = []
        for i, n in enumerate(tnames):
            t4.select_option("#preset", str(i))
            settle(t4, 200)
            t4.check("#tran-on")
            tran_ready(t4)
            txt = t4.inner_text("#tran-summary")
            if not ("V peak" in txt and "inrush" in txt and "not set" not in txt):
                missing.append(n[:20])
        ok(not missing, f"Time card: V peak and inrush on all {len(tnames)} presets {missing}")
        t4.select_option("#preset", str(next(i for i, n in enumerate(tnames) if n.startswith("D1 · LC + Rd-Cd"))))
        settle(t4, 200)
        t4.check("#tran-on")
        tran_ready(t4)
        ok("54.6 V" in t4.inner_text("#tran-summary"), f"D1 Rd-Cd hot-plug peak 54.6 V: '{t4.inner_text('#tran-summary')[:50]}'")
        t4.click("#tabs button[data-t=time]")
        settle(t4, 300)
        drawn, units = {}, {}
        for v in ["hot", "step", "ripple"]:
            t4.click(f"#tviews button[data-v={v}]")
            settle(t4, 300)
            drawn[v] = t4.eval_on_selector("#pl1", "d => (d.data || []).length")
            units[v] = t4.eval_on_selector("#pl1", "d => d._fullLayout.xaxis.title.text")
        ok(all(n >= 2 for n in drawn.values()), f"Time tab draws every view {drawn}")
        ok(units == {"hot": "Time (ms)", "step": "Time (ms)", "ripple": "Time (µs)"},
           f"time axis in ms / µs, not plain seconds {units}")
        t4.uncheck("#tran-on")
        settle(t4, 300)
        sel = t4.eval_on_selector("#tabs button[aria-selected=true]", "b => b.dataset.t")
        ok(sel == "zout" and t4.locator("#tabs button[data-t=time]").count() == 0
           and t4.locator("#tran-rows").count() == 0, f"Time off on the Time tab goes to {sel}, tab hidden")
        t4.close()
        # A #d= link with time-domain settings survives the load and a reload
        tlink = dict(elink, name="Time link", emi={"on": False},
                     tran={"on": True, "lCable": 2e-6, "rCable": 0.05},
                     plot={"tab": "time", "tview": "step"})
        t4 = browser.new_page(viewport={"width": 1440, "height": 1000})
        watch(t4, "m4 link: ")
        t4.goto(URL + "#d=" + base64.b64encode(json.dumps(tlink).encode()).decode())
        ready(t4)
        tran_ready(t4)
        keep = lambda: (t4.is_checked("#tran-on") and t4.input_value("#tran-rc") in ("50m", "0.05")
                        and t4.eval_on_selector("#tabs button[aria-selected=true]", "b => b.dataset.t") == "time"
                        and t4.get_attribute("#tviews button[data-v=step]", "aria-pressed") == "true")
        ok(keep(), f"#d= link keeps tran, the Time tab and the step view (Rc '{t4.input_value('#tran-rc')}')")
        t4.reload()
        ready(t4)
        tran_ready(t4)
        ok(keep(), "time-domain settings survive a reload")
        t4.close()
        for theme in ["Dark", "Light"]:
            for vw in [1440, 390]:
                t4 = browser.new_page(viewport={"width": vw, "height": 1000})
                watch(t4, "m4 shots: ")
                t4.goto(URL)
                ready(t4)
                if theme == "Light":
                    set_theme(t4, "Light")
                t4.locator("#time").screenshot(path=str(SHOTS / f"m4_time_off_{vw}_{theme.lower()}.png"))
                t4.check("#tran-on")
                tran_ready(t4)
                t4.click("#tabs button[data-t=time]")
                settle(t4, 400)
                no_hscroll(t4, vw, f"m4 {theme.lower()} {vw} px")
                t4.locator("#time").screenshot(path=str(SHOTS / f"m4_time_card_{vw}_{theme.lower()}.png"))
                for v in ["hot", "step", "ripple"]:
                    t4.click(f"#tviews button[data-v={v}]")
                    settle(t4, 300)
                    t4.locator("#pl1").screenshot(path=str(SHOTS / f"m4_time_{v}_{vw}_{theme.lower()}.png"))
                t4.close()

        # Layout: 1440 and 390 px, dark and light, no horizontal scroll
        for theme in ["Dark", "Light"]:
            for w, h in [(1440, 1000), (390, 900)]:
                v = browser.new_page(viewport={"width": w, "height": h})
                watch(v)
                v.goto(URL)
                ready(v)
                if theme == "Light":
                    set_theme(v, "Light")
                settle(v, 300)
                no_hscroll(v, w, f"{theme.lower()} {w} px")
                top = lambda sel: v.eval_on_selector(sel, "e => e.getBoundingClientRect().top")
                if w == 1440:
                    ok(top("#pl1") < top("#kpis") and top("#pl1") < h,
                       f"{theme.lower()} 1440 px: plot above Results, in the first screen ({top('#pl1'):.0f} px)")
                else:
                    ok(top("#sch") < top("#pl1") < top("#cv-vinMin"),
                       f"{theme.lower()} 390 px: circuit, then plot, then the inputs")
                v.screenshot(path=str(SHOTS / f"layout_{w}_{theme.lower()}.png"), full_page=False)
                v.close()

        # ---- Part 2: single-file build over file:// ----
        s = browser.new_page(viewport={"width": 1440, "height": 1000})
        watch(s, "single file: ")
        s.goto(SINGLE)
        ready(s)
        s.select_option("#preset", "8")
        settle(s, 300)
        ok("26.8 dB" in s.inner_text("#kpis"), "single file: D4 preset shows the 26.8 dB margin")
        s.click("#tabs button[data-t=tm]")
        settle(s, 200)
        ok(s.eval_on_selector("#pl2", "d => (d.data || []).length") > 0, "single file: Nyquist plot drawn")
        ext = s.evaluate("performance.getEntriesByType('resource').map(r => r.name).filter(n => !n.startsWith('data:') && !n.includes('fonts.g'))")
        ok(not ext, f"single file: no other files loaded {ext[:3]}")
        s.screenshot(path=str(SHOTS / "single_file.png"), full_page=False)
        # The tolerance run uses an inline worker; check it works over file://.
        s.select_option("#preset", d1rc)
        settle(s, 300)
        r = tol_run(s, "100")
        ok(len(r) == 1 and "0.48 to 0.99" in r[0], f"single file: tolerance run in the worker {r}")
        # The time-domain worker is inline too.
        s.check("#tran-on")
        tran_ready(s)
        ok("V peak" in s.inner_text("#tran-summary"), "single file: time-domain run in the worker")
        s.close()

        browser.close()
finally:
    server.terminate()

ok(not errors, "no console errors" + ("" if not errors else ": " + " | ".join(errors[:5])))
print(f"\nscreenshots in {SHOTS}")
print(f"{len(fails)} failed")
sys.exit(1 if fails else 0)
