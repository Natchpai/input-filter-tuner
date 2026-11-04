"""Drive index.html in headless Chrome: load every preset, open every plot tab,
edit values, use the helper buttons, and report console errors.

Run: python test/browser_check.py [screenshot_dir]
"""
import pathlib
import sys
import tempfile

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")

ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (ROOT / "index.html").as_uri()
SHOTS = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(tempfile.gettempdir()) / "filter-shots"
SHOTS.mkdir(parents=True, exist_ok=True)

errors = []
fails = []


def ok(cond, msg):
    print(("PASS  " if cond else "FAIL  ") + msg)
    if not cond:
        fails.append(msg)


with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    page = browser.new_page(viewport={"width": 1500, "height": 1100})
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    dialogs = []
    page.on("dialog", lambda d: (dialogs.append(d.type), d.accept()))
    page.goto(URL)
    page.wait_for_function("window.Plotly !== undefined")
    page.wait_for_selector("#pl1 .main-svg")

    n_presets = page.eval_on_selector("#preset", "s => s.options.length - 1")
    tabs = page.eval_on_selector_all("#tabs button", "bs => bs.map(b => b.dataset.t)")
    ok(n_presets >= 10, f"{n_presets} presets listed")
    for i in range(n_presets):
        page.select_option("#preset", str(i))
        page.wait_for_timeout(150)
        name = page.eval_on_selector("#preset", f"s => s.options[{i + 1}].text")
        kpis = page.inner_text("#kpis")
        parts = page.eval_on_selector_all("#sch .hit", "h => h.length")
        ok("Peak |Zout|" in kpis and parts > 0, f"preset '{name}': results and {parts} clickable parts")
        for t in tabs:
            page.click(f"#tabs button[data-t={t}]")
            page.wait_for_timeout(60)
            n_tr = page.eval_on_selector("#pl1", "d => (d.data || []).length")
            if t == "sweep" and n_tr == 0:
                msg = page.eval_on_selector("#pl1", "d => (d.layout.annotations || []).map(a => a.text).join()")
                ok("Add an Rd-Cd leg" in msg, f"  tab {t}: no damping part, shows hint")
            else:
                ok(n_tr > 0, f"  tab {t}: {n_tr} traces")
        page.click("#tabs button[data-t=zout]")
        page.screenshot(path=str(SHOTS / f"preset_{i:02d}.png"), full_page=False)

    # Edit a value by typing (D1 Rd-Cd preset), check the margin changes.
    page.select_option("#preset", "1")
    page.wait_for_timeout(150)
    before = page.inner_text("#kpis")
    first_rc = page.eval_on_selector_all("[id^=in-][id$=-rd]", "els => els[0].id")
    page.fill(f"#{first_rc}", "4.7")
    page.press(f"#{first_rc}", "Enter")
    page.wait_for_timeout(150)
    after = page.inner_text("#kpis")
    ok(before != after, "typing Rd = 4.7 changes the results")
    # SI parsing with 4u7 style
    first_l = page.eval_on_selector_all("[id^=in-][id$=-L]", "els => els[0].id")
    page.fill(f"#{first_l}", "4u7")
    page.press(f"#{first_l}", "Enter")
    page.wait_for_timeout(100)
    ok(page.input_value(f"#{first_l}") == "4.7u", "'4u7' parses to 4.7u")
    page.fill(f"#{first_l}", "22u")
    page.press(f"#{first_l}", "Enter")
    # Optimum Rd and closed-form buttons
    page.click("button[data-h=opt]")
    page.wait_for_timeout(300)
    rd_opt = page.input_value(f"#{first_rc}")
    page.click("button[data-h=cf]")
    page.wait_for_timeout(150)
    rd_cf = page.input_value(f"#{first_rc}")
    ok(rd_opt != "4.7" and rd_cf, f"optimum Rd = {rd_opt}, closed-form Rd = {rd_cf}")
    page.click("button[data-h=q]")
    page.wait_for_timeout(150)
    ok(page.input_value(f"#{first_rc}") == "1.06", f"Rd for Q=0.707 gives {page.input_value(f'#{first_rc}')} (D1 report: 1.06)")
    # Slider drag
    slider = page.locator(f"#card-{first_l.split('-')[1]} input[type=range]").first
    slider.fill("300")
    page.wait_for_timeout(100)
    ok(page.input_value(f"#{first_l}") != "22u", f"slider moves L to {page.input_value(f'#{first_l}')}")
    # Add each block type
    nblk = page.eval_on_selector_all("#blocks .blk", "b => b.length")
    for t in ["ind", "bead2", "bead4", "res", "cap", "rc"]:
        page.click(f"[data-add={t}]")
        page.wait_for_timeout(80)
    ok(page.eval_on_selector_all("#blocks .blk", "b => b.length") == nblk + 6, "added 6 blocks")
    # Damping modes on an inductor card
    sel = page.locator("#blocks .blk select").first
    for mode in ["R", "RLpar", "RLser", "none"]:
        sel = page.locator("#blocks .blk select").first
        sel.select_option(mode)
        page.wait_for_timeout(100)
    ok(True, "switched inductor damping modes")
    # Clicking a schematic part focuses its input
    page.locator("#sch .hit").first.click()
    page.wait_for_timeout(300)
    focused = page.evaluate("document.activeElement && document.activeElement.id")
    ok(bool(focused) and (focused.startswith("in-") or focused.startswith("src-")), f"schematic click focuses {focused}")
    # Snapshot, theme, link
    # Snapshot must work without any dialog (some viewers block prompt()).
    n_dialogs = len(dialogs)
    page.click("#bSnap")
    page.wait_for_timeout(150)
    names = [t.get("name") or "" for t in page.evaluate("document.getElementById('pl1').data")]
    ok(any(n.startswith("S1:") for n in names) and len(dialogs) == n_dialogs, "snapshot trace shown, no dialog opened")
    ok(page.inner_text("#bSnap") == "Snapshot (1)", "Snapshot button shows the count")
    page.click("#tabs button[data-t=zin]")
    page.wait_for_timeout(100)
    ok(any((t.get("name") or "").startswith("S1:") for t in page.evaluate("document.getElementById('pl1').data")), "snapshot shown on the Zin tab")
    page.click("#tabs button[data-t=zout]")
    page.click("#bTheme")
    page.wait_for_timeout(200)
    page.screenshot(path=str(SHOTS / "dark_after_edits.png"), full_page=True)
    page.click("#bTheme")
    # Tolerance + S21 mode
    page.check("#ps-tol")
    page.select_option("#ps-xfer", "S21")
    page.click("#tabs button[data-t=xfer]")
    page.wait_for_timeout(150)
    ok(page.eval_on_selector("#pl1", "d => d.data.some(t => (t.name||'').startsWith('S21'))"), "S21 mode plotted")
    # Reload keeps state (localStorage)
    page.reload()
    page.wait_for_selector("#pl1 .main-svg")
    ok(page.eval_on_selector_all("#blocks .blk", "b => b.length") == nblk + 6, "state survives reload")

    # ---- Regression checks for the bug-fix round ----
    ok(abs(page.evaluate("parseSI('10f')") - 1e-14) < 1e-20, "parseSI('10f') is 10 fF")
    ok(page.evaluate("parseSI('2.2uF')") == 2.2e-6 and page.evaluate("parseSI('1MHz')") == 1e6, "parseSI keeps unit stripping")
    # Tolerance slider updates its text box
    page.locator("#ps-dL").locator("xpath=..").locator("input[type=range]").fill("750")
    page.wait_for_timeout(100)
    ok(page.input_value("#ps-dL") == "45", f"tolerance slider updates text box ({page.input_value('#ps-dL')})")
    page.fill("#ps-dC", "-150")
    page.press("#ps-dC", "Enter")
    page.wait_for_timeout(100)
    ok(page.input_value("#ps-dC") == "-90", f"tolerance text clamps to -90 ({page.input_value('#ps-dC')})")
    # Linear fields clamp
    page.select_option("#preset", "1")
    page.wait_for_timeout(150)
    der = page.eval_on_selector_all("[id^=in-][id$=-derate]", "els => els[0].id")
    page.fill(f"#{der}", "100")
    page.press(f"#{der}", "Enter")
    page.wait_for_timeout(100)
    ok(page.input_value(f"#{der}") == "90", f"DC-bias loss 100 clamps to {page.input_value(f'#{der}')}")
    page.fill("#cv-eta", "0")
    page.press("#cv-eta", "Enter")
    page.wait_for_timeout(100)
    ok(page.input_value("#cv-eta") == "0.3" and "NaN" not in page.inner_text("#kpis"), "efficiency 0 clamps to 0.3, no NaN")
    # Disabled block: helper buttons are disabled
    rc_card = page.locator(".blk", has=page.locator("[data-h=opt]")).first
    rc_card.locator(".bh input[type=checkbox]").uncheck()
    page.wait_for_timeout(150)
    ok(page.locator(".blk.off [data-h=opt]").first.is_disabled(), "Optimum Rd is disabled on a disabled block")
    # Method A preset keeps a real capacitor
    page.select_option("#preset", "2")
    page.wait_for_timeout(150)
    ok(page.evaluate("S.blocks.some(b => b.type === 'cap' && b.esr > 2)"), "Method A preset is C1 with 2.08 ohm ESR")
    # 2-stage: Rd1 uses its own (L1) section
    page.select_option("#preset", "10")
    page.wait_for_timeout(300)
    info = page.evaluate("document.getElementById('info-' + S.blocks[2].id).textContent")
    ok(info.startswith("L1 section"), f"2-stage Rd1 info uses L1 section: '{info[:40]}'")
    # LQRx 02: sweep range covers the e-cap ESR (0.195 ohm)
    page.select_option("#preset", "12")
    page.wait_for_timeout(150)
    page.click("#tabs button[data-t=sweep]")
    page.wait_for_timeout(200)
    xr = page.eval_on_selector("#pl1", "d => [Math.min(...d.data[0].x), Math.max(...d.data[0].x)]")
    ok(xr[0] <= 0.195 <= xr[1], f"LQRx 02 sweep range {xr[0]:.4g}..{xr[1]:.4g} includes 0.195")
    page.click("#tabs button[data-t=zout]")
    # Bead datasheet form rejects fx = 0
    page.select_option("#preset", "8")
    page.wait_for_timeout(150)
    cb_before = page.evaluate("S.blocks[0].cb")
    page.locator("details summary").first.click()
    page.fill("input[data-k=fx]", "0")
    page.locator("details button").first.click()
    page.wait_for_timeout(100)
    ok(page.evaluate("document.querySelector('input[data-k=fx]').classList.contains('err')") and page.evaluate("S.blocks[0].cb") == cb_before,
       "bead form rejects fx = 0")
    # Copy link, edit, reload: the edit is kept
    page.click("#bLink")
    page.wait_for_timeout(200)
    ok(page.evaluate("location.hash") == "", "Copy link leaves the page URL alone")
    page.fill("#cv-pout", "7")
    page.press("#cv-pout", "Enter")
    page.wait_for_timeout(200)
    page.reload()
    page.wait_for_selector("#pl1 .main-svg")
    ok(page.input_value("#cv-pout") == "7", "edit after Copy link survives reload")

    # Hostile link: script in fields must not run, and the hash is cleared after loading
    import base64, json
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
    x.on("pageerror", lambda e: errors.append("hostile link: " + str(e)))
    x.goto(URL + "#d=" + b64)
    x.wait_for_selector("#pl1 .main-svg")
    x.wait_for_timeout(500)
    ok(x.evaluate("window.__pwned") is None, "hostile link runs no script")
    ok(x.evaluate("S.blocks.length") == 3 and x.evaluate("S.plot.z0") == 50 and x.evaluate("S.conv.k") == 6,
       "hostile link: unknown types dropped, bad numbers replaced by defaults")
    ok(bad in x.inner_text("#plotnote"), "hostile block name is shown as text in the sweep note")
    ok(x.evaluate("location.hash") == "", "link hash is cleared after loading")
    x.close()

    # Phone width: no horizontal page scroll
    m = browser.new_page(viewport={"width": 390, "height": 900})
    m.on("pageerror", lambda e: errors.append(str(e)))
    m.goto(URL)
    m.wait_for_selector("#pl1 .main-svg")
    sw = m.evaluate("document.documentElement.scrollWidth")
    ok(sw <= 391, f"phone width: page scrollWidth {sw}")
    m.screenshot(path=str(SHOTS / "phone.png"), full_page=False)

    browser.close()

ok(not errors, "no console errors" + ("" if not errors else ": " + " | ".join(errors[:5])))
print(f"\nscreenshots in {SHOTS}")
print(f"{len(fails)} failed")
sys.exit(1 if fails else 0)
