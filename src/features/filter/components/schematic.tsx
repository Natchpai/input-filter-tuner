// The circuit as SVG: source, series parts on the rail, shunt legs to ground,
// converter. Same layout as the old tool. Clicking a part focuses its input.
import type { ReactNode } from 'react'
import { type Block, type Design, kindOf, rnOf } from '../engine'
import { fmtSI } from '../lib/si'

const W_ = 'fill-none stroke-foreground/70 [stroke-width:1.4]'
const PART = 'fill-none stroke-chart-1 [stroke-width:1.6]'
const PART_F = 'fill-chart-1 stroke-chart-1'
const LBL = 'fill-foreground text-[10px]'
const VAL = 'fill-muted-foreground text-[10px]'
const GHOST = 'opacity-30'

type Map = (u: number, v: number) => [number, number]
type Orient = 'h' | 'v'
type Ext = { up: number; dn: number }
type G = ReactNode[]
type Shape = {
  w: number
  ext: (o: Orient) => Ext
  draw: (g: G, map: Map, o: Orient, u0: number, v0: number) => void
}

const pts = (list: [number, number][]) => list.map((p) => p.join(',')).join(' ')
const poly = (g: G, list: [number, number][], cls: string) =>
  g.push(<polyline key={g.length} className={cls} points={pts(list)} />)

const EL = 44
type Kind = 'R' | 'L' | 'C' | 'B'

function prim(
  kind: Kind,
  name: string,
  val: string,
  field: string | null,
  ghost = false
): Shape {
  const textW = Math.ceil(Math.max(name.length, val.length) * 5.7)
  const W = Math.max(EL, textW + 8) // wide labels get longer leads
  const off = (W - EL) / 2
  const vert = { up: textW + 18, dn: 10 },
    hor = { up: 30, dn: 10 }
  return {
    w: W,
    ext: (o) => (o === 'h' ? hor : vert),
    draw(g, map, o, u0, v0) {
      if (off > 0) {
        poly(g, [map(u0, v0), map(u0 + off, v0)], W_)
        poly(g, [map(u0 + off + EL, v0), map(u0 + W, v0)], W_)
      }
      const P = (u: number, v: number) => map(u0 + off + u, v0 + v)
      const pl = (list: [number, number][], cls: string) =>
        poly(
          g,
          list.map(([u, v]) => P(u, v)),
          cls
        )
      const cg = ghost ? ' ' + GHOST : ''
      if (kind === 'R') {
        const z: [number, number][] = [
          [0, 0],
          [8, 0],
        ]
        for (let i = 0; i < 6; i++)
          z.push([8 + ((i + 0.5) * 28) / 6, i % 2 ? -5 : 5])
        z.push([36, 0], [44, 0])
        pl(z, PART + cg)
      } else if (kind === 'L') {
        pl(
          [
            [0, 0],
            [8, 0],
          ],
          PART + cg
        )
        pl(
          [
            [36, 0],
            [44, 0],
          ],
          PART + cg
        )
        const c: [number, number][] = []
        for (let h = 0; h < 4; h++)
          for (let k = 0; k <= 8; k++) {
            const a = (Math.PI * k) / 8
            c.push([8 + h * 7 + 3.5 - 3.5 * Math.cos(a), 4.5 * Math.sin(a)])
          }
        pl(c, PART + cg)
      } else if (kind === 'C') {
        pl(
          [
            [0, 0],
            [19, 0],
          ],
          PART + cg
        )
        pl(
          [
            [25, 0],
            [44, 0],
          ],
          PART + cg
        )
        pl(
          [
            [19, -9],
            [19, 9],
          ],
          PART + cg
        )
        pl(
          [
            [25, -9],
            [25, 9],
          ],
          PART + cg
        )
      } else {
        pl(
          [
            [0, 0],
            [8, 0],
          ],
          PART + cg
        )
        pl(
          [
            [36, 0],
            [44, 0],
          ],
          PART + cg
        )
        g.push(
          <polygon
            key={g.length}
            className={PART_F + cg}
            points={pts([P(8, -5), P(36, -5), P(36, 5), P(8, 5)])}
          />
        )
      }
      const [cx0, cy0] = P(22, 0)
      if (o === 'h') {
        g.push(
          <text
            key={g.length}
            className={LBL + cg}
            x={cx0}
            y={cy0 - 20}
            textAnchor='middle'
          >
            {name}
          </text>
        )
        g.push(
          <text
            key={g.length}
            className={VAL + cg}
            x={cx0}
            y={cy0 - 9}
            textAnchor='middle'
          >
            {val}
          </text>
        )
      } else {
        g.push(
          <text key={g.length} className={LBL + cg} x={cx0 + 13} y={cy0 - 2}>
            {name}
          </text>
        )
        g.push(
          <text key={g.length} className={VAL + cg} x={cx0 + 13} y={cy0 + 10}>
            {val}
          </text>
        )
      }
      if (field) {
        const a = P(0, -10),
          c = P(44, 12)
        g.push(
          <rect
            key={g.length}
            className='hit cursor-pointer fill-transparent hover:fill-primary/15'
            data-f={field}
            x={Math.min(a[0], c[0])}
            y={Math.min(a[1], c[1])}
            width={Math.abs(c[0] - a[0])}
            height={Math.abs(c[1] - a[1])}
          >
            <title>{`${name} = ${val}`}</title>
          </rect>
        )
      }
    },
  }
}

function ser(items: (Shape | null)[]): Shape {
  const it = items.filter((x): x is Shape => !!x)
  return {
    w: it.reduce((s, x) => s + x.w, 0),
    ext: (o) => ({
      up: Math.max(...it.map((x) => x.ext(o).up)),
      dn: Math.max(...it.map((x) => x.ext(o).dn)),
    }),
    draw(g, map, o, u0, v0) {
      let u = u0
      for (const x of it) {
        x.draw(g, map, o, u, v0)
        u += x.w
      }
    },
  }
}

function parl(items: (Shape | null)[]): Shape {
  const it = items.filter((x): x is Shape => !!x)
  if (it.length === 1) return it[0]
  const w = Math.max(...it.map((x) => x.w)) + 16
  const offs = (o: Orient) => {
    const v = [0]
    for (let i = 1; i < it.length; i++)
      v.push(v[i - 1] + it[i - 1].ext(o).up + it[i].ext(o).dn + 4)
    return v
  }
  return {
    w,
    ext: (o) => {
      const v = offs(o)
      return {
        up: v[v.length - 1] + it[it.length - 1].ext(o).up,
        dn: it[0].ext(o).dn,
      }
    },
    draw(g, map, o, u0, v0) {
      const v = offs(o)
      const line = (a: number, b: number, c: number, d: number) =>
        poly(g, [map(a, b), map(c, d)], W_)
      line(u0, v0, u0 + 8, v0)
      line(u0 + w - 8, v0, u0 + w, v0)
      line(u0 + 8, v0, u0 + 8, v0 + v[v.length - 1])
      line(u0 + w - 8, v0, u0 + w - 8, v0 + v[v.length - 1])
      it.forEach((x, i) => {
        const pad = (w - 16 - x.w) / 2
        line(u0 + 8, v0 + v[i], u0 + 8 + pad, v0 + v[i])
        x.draw(g, map, o, u0 + 8 + pad, v0 + v[i])
        line(u0 + 8 + pad + x.w, v0 + v[i], u0 + w - 8, v0 + v[i])
      })
    },
  }
}

function blockShape(b: Block): Shape {
  const g = !b.on,
    f = (k: string) => `${b.id}.${k}`,
    n = b.name
  switch (b.type) {
    case 'ind': {
      let core = ser([
        prim('L', n, fmtSI(b.L, 'H'), f('L'), g),
        b.dcr > 0 ? prim('R', 'DCR', fmtSI(b.dcr, 'Ω'), f('dcr'), g) : null,
      ])
      if (b.cp > 0)
        core = parl([core, prim('C', 'Cp', fmtSI(b.cp, 'F'), f('cp'), g)])
      const rd = () => prim('R', 'Rd', fmtSI(b.dR, 'Ω'), f('dR'), g)
      const ld = () => prim('L', 'Ld', fmtSI(b.dL, 'H'), f('dL'), g)
      if (b.dmode === 'R') return parl([core, rd()])
      if (b.dmode === 'RLpar') return parl([core, ser([rd(), ld()])])
      if (b.dmode === 'RLser') return ser([core, parl([ld(), rd()])])
      return core
    }
    case 'bead2':
      return ser([
        prim('R', n + ' Rdc', fmtSI(b.rdc, 'Ω'), f('rdc'), g),
        parl([
          prim('L', 'Lb', fmtSI(b.lb, 'H'), f('lb'), g),
          prim('R', 'Rb', fmtSI(b.rb, 'Ω'), f('rb'), g),
        ]),
      ])
    case 'bead4':
      return ser([
        prim('R', n + ' Rs', fmtSI(b.rs, 'Ω'), f('rs'), g),
        parl([
          prim('L', 'Lb', fmtSI(b.lb, 'H'), f('lb'), g),
          prim('R', 'Rp', fmtSI(b.rp, 'Ω'), f('rp'), g),
          b.cb > 0 ? prim('C', 'Cb', fmtSI(b.cb, 'F'), f('cb'), g) : null,
        ]),
      ])
    case 'res':
      return ser([
        prim('R', n, fmtSI(b.r, 'Ω'), f('r'), g),
        b.l > 0 ? prim('L', 'ESL', fmtSI(b.l, 'H'), f('l'), g) : null,
      ])
    case 'cap': {
      const cnt = b.n > 1 ? `${b.n}× ` : ''
      const der = b.derate ? ` (−${b.derate}%)` : ''
      return ser([
        prim('C', n, cnt + fmtSI(b.c, 'F') + der, f('c'), g),
        b.esr > 0 ? prim('R', 'ESR', fmtSI(b.esr, 'Ω'), f('esr'), g) : null,
        b.esl > 0 ? prim('L', 'ESL', fmtSI(b.esl, 'H'), f('esl'), g) : null,
      ])
    }
    case 'rc':
      return ser([
        b.rd > 0 ? prim('R', n, fmtSI(b.rd, 'Ω'), f('rd'), g) : null,
        prim('C', b.rd > 0 ? 'Cd' : n, fmtSI(b.cd, 'F'), f('cd'), g),
        b.esr > 0 ? prim('R', 'ESR', fmtSI(b.esr, 'Ω'), f('esr'), g) : null,
        b.esl > 0 ? prim('L', 'ESL', fmtSI(b.esl, 'H'), f('esl'), g) : null,
      ])
  }
}

/** Scroll to the input behind a schematic part and select it. */
function focusField(f: string) {
  const [id, k] = f.split('.')
  const el = document.getElementById(
    id === 'src' ? 'src-' + k : `in-${id}-${k}`
  )
  if (el instanceof HTMLInputElement) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.focus({ preventScroll: true })
    el.select()
  }
}

export function Schematic({ S }: { S: Design }) {
  const out: G = []
  const srcItems: Shape[] = []
  if (S.source.R > 0)
    srcItems.push(prim('R', 'Rsrc', fmtSI(S.source.R, 'Ω'), 'src.R'))
  if (S.source.L > 0)
    srcItems.push(prim('L', 'Lsrc', fmtSI(S.source.L, 'H'), 'src.L'))
  const shapes = S.blocks.map((b) => ({ sh: blockShape(b), kind: kindOf(b) }))
  const serAll = [
    ...srcItems,
    ...shapes.filter((x) => x.kind === 'series').map((x) => x.sh),
  ]
  const upMax = Math.max(30, ...serAll.map((x) => x.ext('h').up))
  const dnMax = Math.max(10, ...serAll.map((x) => x.ext('h').dn))
  const shLen = Math.max(
    EL,
    ...shapes.filter((x) => x.kind === 'shunt').map((x) => x.sh.w)
  )
  const RY = upMax + 14
  const GY = RY + Math.max(shLen + 24, dnMax + 40, 80)
  const mapH: Map = (u, v) => [u, RY - v]
  let x = 20
  // Source
  const sy = (RY + GY) / 2
  const sx = x + 14
  out.push(
    <g key='src'>
      <polyline
        className={W_}
        points={pts([
          [sx, RY],
          [sx, sy - 13],
        ])}
      />
      <circle className={W_} cx={sx} cy={sy} r={13} />
      <text className={LBL} x={sx} y={sy - 1} textAnchor='middle'>
        +
      </text>
      <text className={LBL} x={sx} y={sy + 9} textAnchor='middle'>
        −
      </text>
      <polyline
        className={W_}
        points={pts([
          [sx, sy + 13],
          [sx, GY],
        ])}
      />
      <text className={VAL} x={x + 32} y={sy + 4}>
        Vin
      </text>
      <polyline
        className={W_}
        points={pts([
          [x + 4, GY + 6],
          [x + 24, GY + 6],
        ])}
      />
      <polyline
        className={W_}
        points={pts([
          [x + 8, GY + 10],
          [x + 20, GY + 10],
        ])}
      />
      <polyline
        className={W_}
        points={pts([
          [sx, GY],
          [sx, GY + 6],
        ])}
      />
    </g>
  )
  x += 14
  const railStart = x
  // Rail wires run between series parts only (parts draw their own leads).
  const rail: G = []
  const gap = (a: number, b: number) => {
    if (b > a)
      poly(
        rail,
        [
          [a, RY],
          [b, RY],
        ],
        W_
      )
  }
  for (const it of srcItems) {
    it.draw(out, mapH, 'h', x, 0)
    x += it.w
  }
  if (srcItems.length) {
    gap(x, x + 6)
    x += 6
  }
  let lastShunt = false
  for (const { sh, kind } of shapes) {
    if (kind === 'series') {
      sh.draw(out, mapH, 'h', x, 0)
      x += sh.w
      lastShunt = false
    } else {
      const e = sh.ext('v')
      const nx = x + Math.max(e.dn, 14) + (lastShunt ? 0 : 4)
      gap(x, nx)
      x = nx
      const X = x
      const mapV: Map = (u, v) => [X + v, RY + 12 + u]
      poly(
        out,
        [
          [x, RY],
          [x, RY + 12],
        ],
        W_
      )
      sh.draw(out, mapV, 'v', 0, 0)
      poly(
        out,
        [
          [x, RY + 12 + sh.w],
          [x, GY],
        ],
        W_
      )
      out.push(
        <circle
          key={out.length}
          className='fill-foreground/70'
          cx={x}
          cy={RY}
          r={2.6}
        />,
        <circle
          key={out.length + 1}
          className='fill-foreground/70'
          cx={x}
          cy={GY}
          r={2.6}
        />
      )
      const nx2 = x + Math.max(e.up, 30)
      gap(x, nx2)
      x = nx2
      lastShunt = true
    }
  }
  const conX = x + 24
  gap(x, conX)
  poly(
    rail,
    [
      [railStart, GY],
      [conX, GY],
    ],
    W_
  )
  const rn = rnOf(S.conv, S.conv.vinMin)
  const bw = 112
  const W = conX + bw + 12,
    Hh = GY + 18
  return (
    <div
      id='sch'
      className='overflow-x-auto'
      title='Click a part to edit it'
      onClick={(e) => {
        const f = (e.target as Element).getAttribute('data-f')
        if (f) focusField(f)
      }}
    >
      {/* Shrinks with the card down to 0.7× on a phone (then it scrolls).
          Never above 1×, so the plot stays high on a wide screen. No
          width/height attributes, so the SVG export uses the viewBox size. */}
      <svg
        viewBox={`0 0 ${W} ${Hh}`}
        role='img'
        aria-label='Filter schematic'
        className='mx-auto block h-auto w-full'
        style={{ minWidth: W * 0.7, maxWidth: W }}
      >
        <g className='rails'>{rail}</g>
        {out}
        <rect
          className='fill-muted stroke-foreground/70 [stroke-width:1.2]'
          x={conX}
          y={RY - 6}
          width={bw}
          height={GY - RY + 12}
          rx={6}
        />
        <text
          className={LBL}
          x={conX + bw / 2}
          y={(RY + GY) / 2 - 8}
          textAnchor='middle'
        >
          Converter
        </text>
        <text
          className={VAL}
          x={conX + bw / 2}
          y={(RY + GY) / 2 + 6}
          textAnchor='middle'
        >
          Rn = {fmtSI(rn, 'Ω')}
        </text>
        <text
          className={VAL}
          x={conX + bw / 2}
          y={(RY + GY) / 2 + 19}
          textAnchor='middle'
        >
          at Vin min
        </text>
      </svg>
    </div>
  )
}
