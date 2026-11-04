import type { ReactNode } from 'react'
import { Main } from '@/components/layout/main'
import { SiteHeader } from '@/components/layout/site-header'
import { ToolCard } from './components/tool-card'

function Items({ children }: { children: ReactNode }) {
  return (
    <ul className='list-disc space-y-2 pl-5 text-sm leading-relaxed'>
      {children}
    </ul>
  )
}

export function Notes() {
  return (
    <>
      <SiteHeader title='Notes' />
      <Main className='space-y-4'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>Notes</h1>
          <p className='text-muted-foreground'>
            What the numbers mean, and where the formulas come from.
          </p>
        </div>
        <ToolCard title='Transfer functions'>
          <Items>
            <li>
              <b>H</b> = V<sub>out</sub>/V<sub>src</sub> with the source
              impedance and the chosen load (default: converter side open), as
              in the NP-DR reports.
            </li>
            <li>
              The network is reciprocal, so |H<sub>open</sub>| also equals the
              ratio of source ripple current to converter ripple current.
            </li>
            <li>
              <b>S21</b> is the 50 Ω two-port S21 of the filter blocks only (no
              source impedance), as a VNA measures it.
            </li>
          </Items>
        </ToolCard>
        <ToolCard title='Q and damping'>
          <Items>
            <li>
              <b>Q</b> is the series form Q = Re(Z<sub>out</sub>(f<sub>0</sub>
              ))/Z<sub>0</sub>, as in the reports. Peak/Z<sub>0</sub> is shown
              next to it.
            </li>
            <li>
              Z<sub>0</sub> = √(L/C) of the series element nearest the converter
              and the capacitors after it.
            </li>
            <li>
              <b>Rd for Q</b> uses Rd = Z<sub>0</sub>²/(Z<sub>0</sub>/Q − r
              <sub>L</sub>) (NP-DR-26001 eq. for the Rd-Cd leg).
            </li>
            <li>
              <b>Cd for an Rd-Cd leg</b>: Cd ≥ 10/(2π·f<sub>0</sub>·Rd), so X
              <sub>Cd</sub> = Rd/10 at f<sub>0</sub> (NP-DR-26001 §7). A smaller
              Cd also works; check the margin.
            </li>
            <li>
              <b>Optimum Rd</b> searches Rd for the lowest peak |Z
              <sub>out</sub>| with every parasitic included.
            </li>
            <li>
              The closed-form optimum (lossless L and C) for Rd-Cd, parallel
              Rd-Ld and series Rd‖Ld follows Middlebrook and Erickson. Each one
              is checked against the numeric optimizer for n = 0.25 to 3.
            </li>
          </Items>
        </ToolCard>
        <ToolCard title='Stability check'>
          <Items>
            <li>
              The converter input is R<sub>n</sub> = −V<sub>in</sub>²·η/P. It
              holds only below the converter loop crossover, so the peak search
              and the Nyquist scan stop at f<sub>check</sub>.
            </li>
            <li>
              Z<sub>out</sub> is seen from the converter with the source voltage
              shorted. R<sub>src</sub> and L<sub>src</sub> stay in the path.
            </li>
            <li>
              T<sub>m</sub> = Z<sub>out</sub>/R<sub>n</sub> at V
              <sub>in,min</sub>. Stable when the Nyquist curve does not encircle
              −1.
            </li>
          </Items>
        </ToolCard>
        <ToolCard title='Ripple and losses'>
          <Items>
            <li>
              The converter input current harmonic at N·f<sub>sw</sub> is 2·I
              <sub>o</sub>·|sin(NπD)|/(Nπ): peak, ideal trapezoid, N interleaved
              phases, D = V<sub>out</sub>/(V<sub>in,nom</sub>·η).
            </li>
            <li>Block losses at that frequency use this one harmonic only.</li>
          </Items>
        </ToolCard>
      </Main>
    </>
  )
}
