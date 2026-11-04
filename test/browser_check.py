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
        for i in range(n_presets):
            page.select_option("#preset", str(i))
            settle(page, 250)
            name = page.eval_on_selector("#preset", f"s => s.options[{i + 1}].text")
            kpis = page.inner_text("#kpis")
            parts = page.eval_on_selector_all("#sch .hit", "h => h.length")
            ok("Peak |Zout|" in kpis and parts > 0, f"preset '{name}': results and {parts} clickable parts")
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
            ok(files == want, f"report zip has report.md and four SVGs {files}")
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
        w.close()

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
        s.close()

        browser.close()
finally:
    server.terminate()

ok(not errors, "no console errors" + ("" if not errors else ": " + " | ".join(errors[:5])))
print(f"\nscreenshots in {SHOTS}")
print(f"{len(fails)} failed")
sys.exit(1 if fails else 0)
