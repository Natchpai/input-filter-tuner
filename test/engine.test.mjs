// Checks the filter engine in index.html against numbers from the design reports
// (NP-DR-26001, NP-DR-26003, NP-DR-26004, LQRx 02/03, AOH-DR-26006).
// Run: node test/engine.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');
const src = html.split('// ENGINE-START')[1].split('// ENGINE-END')[0];
const E = new Function(src + '\nreturn Engine;')();

let fails = 0, passes = 0;
function near(name, got, want, tolPct = 2) {
  const ok = Math.abs(got - want) <= Math.abs(want) * tolPct / 100;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: got ${fmt(got)}, want ${fmt(want)} (±${tolPct}%)`);
  ok ? passes++ : fails++;
}
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ': ' + detail : ''}`);
  ok ? passes++ : fails++;
}
const fmt = v => (Math.abs(v) >= 1e4 || (Math.abs(v) < 1e-2 && v !== 0)) ? v.toExponential(4) : v.toFixed(4);

let id = 0;
function blk(type, vals) {
  const b = { id: 't' + (id++), type, name: type, on: true };
  for (const [k, , , def] of E.TYPES[type].p) b[k] = def;
  if (type === 'ind') Object.assign(b, { dmode: 'none', dR: 1, dL: 1e-6 });
  return Object.assign(b, vals);
}
function st(conv, blocks, source = {}) {
  return {
    conv: Object.assign({ vinMin: 12, vinNom: 12, vinMax: 12, pout: 10, eta: 1, vout: 5, fsw: 1e6, phases: 1, k: 6, fcheck: 1e6 }, conv),
    source: Object.assign({ R: 0, L: 0 }, source), blocks,
    plot: { fmin: 10, fmax: 100e6, n: 800, xfer: 'H', load: 'open', rload: 10, z0: 50 },
  };
}

// ---- D1 (NP-DR-26001): 48 V, 100 W, 22 uH, 20 mOhm, 10 uF ----
const d1conv = { vinMin: 48, vinNom: 48, vinMax: 48, pout: 100, eta: 1, vout: 12, fsw: 500e3, fcheck: 500e3 };
{
  const s = st(d1conv, [blk('ind', { L: 22e-6, dcr: 20e-3 }), blk('cap', { c: 10e-6, esr: 0 })]);
  const m = E.metrics(s);
  near('D1 undamped Z0', m.prim.Z0, 1.483, 0.5);
  near('D1 undamped f0', m.prim.f0, 10.73e3, 0.5);
  near('D1 Rn', m.rn.min, -23.04, 0.5);
  near('D1 undamped peak |Zout| (report 110 ohm)', m.peak.v, 110, 2);
  near('D1 undamped margin (report -13.6 dB)', m.margin, -13.6, 2);
  check('D1 undamped Nyquist reports unstable', m.unstableAt !== null);
}
{
  const p = { Z0: Math.sqrt(22e-6 / 10e-6) };
  near('D1 Rd for Q=0.707 (report 1.06)', E.rdForQ(p.Z0, 0.707, 0.02), 1.06, 1);
  near('D1 Rd for Q=1 (report 1.50)', E.rdForQ(p.Z0, 1, 0.02), 1.50, 1);
  near('D1 Rd for Q=2 (report 3.05)', E.rdForQ(p.Z0, 2, 0.02), 3.05, 1);
  const s = st(d1conv, [blk('ind', { L: 22e-6, dcr: 20e-3 }), blk('cap', { c: 10e-6, esr: 0 }), blk('rc', { rd: 1.06, cd: 150e-6, esr: 0 })]);
  const m = E.metrics(s);
  near('D1 Rd-Cd Q=0.707 peak |Zout| (report 1.06)', m.peak.v, 1.06, 3);
  near('D1 Rd-Cd Q=0.707 margin (report 26.8 dB)', m.margin, 26.8, 1.5);
  check('D1 Rd-Cd stable', m.unstableAt === null);
}

// ---- D3 (NP-DR-26003): bead Rdc 0.16, Lb 1u, Rb 50, C 10u, 12 V, 10 W ----
{
  const s = st({ vinMin: 12, vinNom: 12, vinMax: 12, pout: 10, fsw: 1.1e6, fcheck: 1.1e6 },
    [blk('bead2', { rdc: 0.16, lb: 1e-6, rb: 50 }), blk('cap', { c: 10e-6, esr: 0 })]);
  const m = E.metrics(s);
  near('D3 Z0 (report 0.316)', m.prim.Z0, 0.316, 0.5);
  near('D3 f0 (report 50.3 kHz)', m.prim.f0, 50.3e3, 0.5);
  near('D3 peak |Zout| (report 0.695)', m.peak.v, 0.695, 3);
  near('D3 margin at 10 W (report 26.3 dB)', m.margin, 26.3, 1.5);
  const s2 = st({ vinMin: 12, vinNom: 12, vinMax: 12, pout: 10, fsw: 1.1e6, fcheck: 1.1e6 },
    [blk('bead2', { rdc: 0.015, lb: 1e-6, rb: 50 }), blk('cap', { c: 10e-6, esr: 0 })]);
  const m2 = E.metrics(s2);
  near('D3 typical bead peak (report 5.89)', m2.peak.v, 5.89, 3);
  near('D3 typical bead margin (report 7.8 dB)', m2.margin, 7.8, 3);
}

// ---- D4 (NP-DR-26004): bead4 + 68 mOhm + 2x10uF at -30 % (14 uF), 12 V 10 W ----
{
  const s = st({ vinMin: 12, vinNom: 12, vinMax: 12, pout: 10, fsw: 1.1e6, fcheck: 1.1e6 },
    [blk('bead4', { rs: 50e-3, lb: 1e-6, rp: 150, cb: 2e-12 }), blk('res', { r: 68e-3, l: 0 }),
     blk('cap', { c: 10e-6, esr: 0, n: 2, derate: 30 })]);
  const m = E.metrics(s);
  near('D4 peak |Zout| (report 0.66)', m.peak.v, 0.66, 3);
  near('D4 margin (report 26.8 dB)', m.margin, 26.8, 1.5);
  near('D4 gain at fsw, Lb 1 uH (report 7.6: -56.5 dB)', -E.db(m.ripple.hfsw), 56.5, 1);
  near('D4 Q series form (report 2.26)', m.qSeries, 2.26, 2);
  // Same design at 0.83 A, Lb = 0.8 uH (report 6.3 table)
  const s83 = E.withParam(s, s.blocks[0].id, 'lb', 0.8e-6);
  const m83 = E.metrics(s83);
  near('D4 0.83 A peak |Zout| (report 0.54)', m83.peak.v, 0.54, 3);
  near('D4 0.83 A margin (report 28.5 dB)', m83.margin, 28.5, 1.5);
  near('D4 0.83 A Q (report 2.02)', m83.qSeries, 2.02, 2);
  near('D4 0.83 A attenuation at fsw (report 54.6 dB)', -E.db(m83.ripple.hfsw), 54.6, 1);
  const bd = E.beadFromDatasheet({ rdc: 0.3, fx: 1e6, x: 2 * Math.PI * 1e6 * 1.208e-6, fsrf: 1 / (2 * Math.PI * Math.sqrt(1.208e-6 * 1.678e-12)), zmax: 0.3 + 1082 });
  near('D4 datasheet extraction Lb', bd.lb, 1.208e-6, 0.1);
  near('D4 datasheet extraction Cb', bd.cb, 1.678e-12, 0.1);
  near('D4 datasheet extraction Rp', bd.rp, 1082, 0.1);
}

// ---- LQRx 02: R101 5m, 1 uH/5.6 mOhm, Cf 8x4.7u -33 %, ESR 0.195 + 94 uF, 24 V 240 W eta 0.95 ----
{
  const s = st({ vinMin: 24, vinNom: 24, vinMax: 24, pout: 240, eta: 0.95, vout: 12, fsw: 200e3, phases: 2, fcheck: 200e3 },
    [blk('res', { r: 5e-3, l: 0 }), blk('ind', { L: 1e-6, dcr: 5.6e-3 }), blk('cap', { c: 4.7e-6, esr: 0, n: 8, derate: 33 }),
     blk('rc', { rd: 0, cd: 94e-6, esr: 0.195 })]);
  const m = E.metrics(s);
  near('LQRx02 Z0 (report 0.199)', m.prim.Z0, 0.199, 1);
  near('LQRx02 f0 (report 31.7 kHz)', m.prim.f0, 31.7e3, 1);
  near('LQRx02 |Rn| (report 2.28)', Math.abs(m.rn.min), 2.28, 1);
  near('LQRx02 peak |Zout| (report 0.199)', m.peak.v, 0.199, 5);
  near('LQRx02 peak frequency (report 27.1 kHz)', m.peak.f, 27.1e3, 5);
  near('LQRx02 attenuation at 200 kHz (report 32 dB)', -E.db(m.ripple.hfsw), 32, 5);
  near('LQRx02 attenuation at 400 kHz (report 44 dB)', -E.db(m.ripple.hfr), 44, 5);
}

// ---- LQRx 03: R301 20m, 2.2 uH/0.2, CF 4.7u -33 %, 0.1 uF, 1 ohm + 22 uF; 9.39 V, 9 W, eta 0.85 ----
{
  const s = st({ vinMin: 9.39, vinNom: 9.39, vinMax: 9.39, pout: 9, eta: 0.85, vout: 9, fsw: 1.1e6, fcheck: 1.1e6 },
    [blk('res', { r: 20e-3, l: 0 }), blk('ind', { L: 2.2e-6, dcr: 0.2 }), blk('cap', { c: 4.7e-6, esr: 0, derate: 33 }),
     blk('cap', { c: 0.1e-6, esr: 0 }), blk('rc', { rd: 0, cd: 22e-6, esr: 1 })]);
  const m = E.metrics(s);
  near('LQRx03 peak |Zout| (report 0.77)', m.peak.v, 0.77, 3);
  near('LQRx03 peak frequency (report 62.4 kHz)', m.peak.f, 62.4e3, 3);
  near('LQRx03 |Rn| (report 8.3)', Math.abs(m.rn.min), 8.3, 1);
  near('LQRx03 attenuation at 1.1 MHz (report 50.7 dB)', -E.db(m.ripple.hfsw), 50.7, 2);
}

// ---- D6 (AOH-DR-26006): R_SRC 56m, 3x10u ESR 5m, 0.33u/0.13, 3x10u ----
{
  const s = st({ vinMin: 4.5, vinNom: 4.5, vinMax: 4.5, pout: 6.6, eta: 0.9, vout: 3.3, fsw: 2.5e6, fcheck: 2.5e6 },
    [blk('cap', { c: 10e-6, esr: 5e-3, n: 3 }), blk('ind', { L: 0.33e-6, dcr: 0.13 }), blk('cap', { c: 10e-6, esr: 5e-3, n: 3 })], { R: 0.056 });
  const m = E.metrics(s);
  near('D6 peak |Zout| (report about 0.19)', m.peak.v, 0.19, 8);
  near('D6 |Rin| at 2 A (report 2.8)', Math.abs(m.rn.min), 2.76, 2);
}

// ---- Closed-form optimum vs numeric optimum, lossless L = C = 1 ----
for (const mode of ['rc', 'RLpar', 'RLser']) {
  for (const n of [0.25, 1, 3]) {
    const L = 1e-6, C = 1e-6, Z0 = 1;
    const blocks = mode === 'rc'
      ? [blk('ind', { L, dcr: 0 }), blk('cap', { c: C, esr: 0 }), blk('rc', { rd: 1, cd: n * C, esr: 0 })]
      : [blk('ind', { L, dcr: 0, dmode: mode, dL: n * L, dR: 1 }), blk('cap', { c: C, esr: 0 })];
    const s = st({ fsw: 1e8, fcheck: 1e8 }, blocks);
    s.plot.fmin = 1e3; s.plot.fmax = 1e8;
    const target = mode === 'rc' ? blocks[2] : blocks[0];
    const key = E.dampKey(target);
    const opt = E.optimizeParam(s, target.id, key, 1e-3, 1e3);
    const cf = E.closedForm(mode, n, Z0);
    near(`closed form ${mode} n=${n} peak`, opt.peak, cf.peak, 0.5);
    near(`closed form ${mode} n=${n} Rd`, opt.val, cf.rd, 3);
  }
}

// ---- Regression: narrow peaks, Nyquist crossing, stage lookup, check range ----
{
  // Stage 1 damped (D1), stage 2 high-Q (1 uH / 1 mOhm / 2 uF, f0 = 112.5 kHz).
  const mk2 = () => st(d1conv, [blk('ind', { L: 22e-6, dcr: 20e-3 }), blk('cap', { c: 10e-6, esr: 0 }),
    blk('rc', { rd: 1.06, cd: 150e-6, esr: 0 }), blk('ind', { L: 1e-6, dcr: 1e-3 }), blk('cap', { c: 2e-6, esr: 0 })]);
  const s = mk2();
  const truth = E.peakZout(s, 10, 500e3, undefined, 20000).v;
  near('coarse peak search (n=160) finds the high-Q stage-2 peak', E.peakZout(s, 10, 500e3, undefined, 160).v, truth, 1);
  // The design that reproduced a 17x miss (stage 1 over-damped with Rd = 10 ohm).
  const sMiss = st(d1conv, [blk('ind', { L: 22e-6, dcr: 20e-3 }), blk('cap', { c: 10e-6, esr: 0 }),
    blk('rc', { rd: 10, cd: 30e-6, esr: 0 }), blk('ind', { L: 1e-6, dcr: 1e-3 }), blk('cap', { c: 2e-6, esr: 0 })]);
  const tMiss = E.peakZout(sMiss, 10, 500e3, undefined, 20000).v;
  near('coarse peak search (n=160), reproduced 17x case', E.peakZout(sMiss, 10, 500e3, undefined, 160).v, tMiss, 1);
  near('metrics peak, reproduced 17x case', E.metrics(sMiss).peak.v, tMiss, 1);
  const m = E.metrics(s);
  near('metrics peak equals the true peak', m.peak.v, truth, 1);
  check('Nyquist flags the stage-2 peak above |Rn|', truth > Math.abs(m.rn.min) && m.unstableAt !== null,
    `peak ${truth.toFixed(1)} vs |Rn| ${Math.abs(m.rn.min).toFixed(1)}, unstableAt ${m.unstableAt}`);

  // Optimum Rd on a 2-stage filter is no worse than a brute-force scan.
  const s2 = st(d1conv, [blk('ind', { L: 22e-6, dcr: 20e-3 }), blk('cap', { c: 10e-6, esr: 0 }),
    blk('rc', { rd: 1, cd: 30e-6, esr: 0 }), blk('ind', { L: 1e-6, dcr: 1e-3 }), blk('cap', { c: 2e-6, esr: 0 }),
    blk('rc', { rd: 0.5, cd: 10e-6, esr: 0 })]);
  const tgt = s2.blocks[5];
  const opt = E.optimizeParam(s2, tgt.id, 'rd', 1e-3, 1e3);
  let brute = Infinity;
  for (let i = 0; i <= 400; i++) {
    const v = 10 ** (-3 + 6 * i / 400);
    brute = Math.min(brute, E.peakZout(E.withParam(s2, tgt.id, 'rd', v), 10, 500e3, undefined, 4000).v);
  }
  check('optimizer is no worse than a 400-point Rd scan', opt.peak <= brute * 1.01, `opt ${opt.peak.toFixed(4)} vs scan ${brute.toFixed(4)}`);

  // Each damping leg is matched to its own stage.
  const two = st({}, [blk('ind', { L: 10e-6, dcr: 12e-3 }), blk('cap', { c: 4.7e-6, esr: 4e-3, n: 2, derate: 35 }),
    blk('rc', { rd: 1.2, cd: 33e-6 }), blk('ind', { L: 2.2e-6, dcr: 6e-3 }),
    blk('cap', { c: 4.7e-6, esr: 4e-3, n: 4, derate: 35 }), blk('rc', { rd: 0.5, cd: 47e-6 })]);
  const sec1 = E.sectionOf && E.sectionOf(two, two.blocks[2].id);
  const sec2 = E.sectionOf && E.sectionOf(two, two.blocks[5].id);
  near('sectionOf: Rd1 belongs to stage 1 (C = 6.11 uF)', sec1 ? sec1.C : 0, 2 * 4.7e-6 * 0.65, 0.1);
  near('sectionOf: Rd2 belongs to stage 2 (C = 12.22 uF)', sec2 ? sec2.C : 0, 4 * 4.7e-6 * 0.65, 0.1);
  near('sectionOf: L1 section uses L1', sec1 ? sec1.L : 0, 10e-6, 0.1);
  const secL1 = E.sectionOf && E.sectionOf(two, two.blocks[0].id);
  near('sectionOf: an inductor uses its own stage', secL1 ? secL1.C : 0, 2 * 4.7e-6 * 0.65, 0.1);

  // Nyquist scan stays inside the check range: an HF self-resonance must not fail the design.
  const hf = st(d1conv, [blk('ind', { L: 22e-6, dcr: 20e-3 }), blk('cap', { c: 10e-6, esr: 0 }),
    blk('rc', { rd: 1.06, cd: 150e-6, esr: 0 }), blk('ind', { L: 1e-6, dcr: 1e-3, cp: 10e-12 })]);
  const mh = E.metrics(hf);
  check('HF self-resonance above f check is not reported unstable', mh.unstableAt === null, `unstableAt ${mh.unstableAt}`);

  // Inverted check range is corrected.
  const inv = mk2(); inv.plot.fmin = 1e6;
  const [lo, hi] = E.checkRange(inv);
  check('check range is never inverted', hi > lo, `${lo} .. ${hi}`);
}

// ---- S21 sanity ----
{
  const s = st({}, [blk('res', { r: 0, l: 0 })]);
  check('S21 of a through is 0 dB', Math.abs(E.db(E.abs(E.point(s, 1e6).S21))) < 1e-6);
  const c = 1e-9, f = 1e6;
  const s2 = st({}, [blk('cap', { c, esr: 0, esl: 0 })]);
  const want = 1 / Math.hypot(1, Math.PI * f * 50 * c); // |S21| = |2/(2 + jwCZ0)|
  near('S21 of a shunt C', E.abs(E.point(s2, f).S21), want, 0.01);
  const s3 = st({}, [blk('res', { r: 50, l: 0 })]);
  near('S21 of a series 50 ohm (-3.52 dB)', E.db(E.abs(E.point(s3, f).S21)), 20 * Math.log10(2 / 3), 0.01);
}

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
