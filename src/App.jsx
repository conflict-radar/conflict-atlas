import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import logo from './assets/logo.svg?raw'
import CLS_ISO from './cls_iso.json'
import { getCountryInfo } from './countryInfo.js'

// ---- Config ---------------------------------------------------------------
const ENV_COLOURS = { Deliberate: '#db5206', Byproduct: '#3ccf87', Hybrid: '#e0a800', Mixed: '#6f7c7d' }
const CONFLICT_COLOURS = { 1: '#f6b3b3', 2: '#df5a5a', 3: '#8b1e1e' }
const CONFLICT_LABELS = { 1: '1 conflict', 2: '2 conflicts', 3: '3+ conflicts' }
const TYPES = ['Deliberate', 'Byproduct', 'Hybrid']
const NOW = new Date().getFullYear()
const MIN_YEAR = 2000
const COVERAGE_NOTE = 'General Environmental Damage expected, Major reporting of environmental damage, not yet established.'
const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v))
// Blank "Year to" means ongoing. Cumulative = started by that year; active = running in that year.
const inRange = (from, to, year, mode) => (from ?? MIN_YEAR) <= year && (mode === 'cumulative' || (to ?? Infinity) >= year)
const BASE = { x: 0, y: 0, w: 2000, h: 857 } // matches world.svg viewBox
const MAX_ZOOM = 40
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp']
const BASE_URL = import.meta.env.BASE_URL
const NS = 'http://www.w3.org/2000/svg'
const nf = new Intl.NumberFormat('en-GB')
const store = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v } catch { return d } },
  set: (k, v) => { try { localStorage.setItem(k, v) } catch { /* ignore */ } },
}

// ---- Loaders --------------------------------------------------------------
async function loadSvg() {
  const t = await (await fetch(BASE_URL + 'world.svg')).text()
  const i = t.indexOf('<svg')
  const j = t.indexOf('>', i)
  const root = t.slice(i, j + 1).replace(/\s(width|height)="[^"]*"/g, '').replace('viewbox', 'viewBox')
  return root + t.slice(j + 1)
}
async function loadData() {
  const buf = await (await fetch(BASE_URL + 'data.xlsx', { cache: 'no-store' })).arrayBuffer()
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }).map((r) => ({ ...r, from: num(r['Year from']), to: num(r['Year to']) }))
  const grid = (name) => (wb.Sheets[name] ? XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' }).slice(1) : [])
  const conflicts = grid('Conflicts')
    .filter((r) => r[0])
    .map(([name, years, isos, notes, from, to]) => ({ name, years, notes, from: num(from), to: num(to), isos: String(isos).split(',').map((s) => s.trim()).filter(Boolean) }))
  const tiers = {}
  for (const [iso, tier] of grid('Conflict Tiers')) if (iso) tiers[String(iso).trim()] = Number(tier)
  return { rows, conflicts, tiers }
}

// Image column holds a reference ("001") or a full filename ("001.jpg").
function CardImage({ code, alt }) {
  const [n, setN] = useState(0)
  const ref = String(code || '').trim()
  if (!ref) return <span>IMAGE</span>
  const candidates = /\.\w{3,4}$/.test(ref) ? [ref] : IMAGE_EXTS.map((x) => `${ref}.${x}`)
  if (n >= candidates.length) return <span>IMAGE</span>
  return <img key={n} src={`${BASE_URL}images/${candidates[n]}`} alt={alt} onError={() => setN(n + 1)} />
}

// ---- Country information (Wikidata) ----------------------------------------
function Row({ label, children }) {
  if (!children || (Array.isArray(children) && !children.length)) return null
  return <div className="row"><dt>{label}</dt><dd>{children}</dd></div>
}
function CountryPanel({ selected }) {
  const [state, setState] = useState({ status: 'idle' })
  const [attempt, setAttempt] = useState(0)
  const iso = selected.iso
  useEffect(() => {
    if (!/^[A-Z]{2}$/.test(iso)) { setState({ status: 'none' }); return }
    let live = true
    setState({ status: 'loading' })
    getCountryInfo(iso)
      .then((d) => live && setState(d.empty ? { status: 'none' } : { status: 'ok', d }))
      .catch(() => live && setState({ status: 'error' }))
    return () => { live = false }
  }, [iso, attempt])

  const { status, d } = state
  return (
    <div className="country">
      <div className="country-head">
        {status === 'ok' && d.flag && <img className="flag" src={d.flag} alt="" />}
        <h2>{selected.name}</h2>
      </div>
      {status === 'loading' && <div className="skeleton"><i /><i /><i /><i /></div>}
      {status === 'none' && <p className="muted">No further information available for this territory.</p>}
      {status === 'error' && (
        <p className="muted">Couldn’t reach Wikidata. <button className="link" onClick={() => setAttempt((n) => n + 1)}>Retry</button></p>
      )}
      {status === 'ok' && (
        <dl>
          {d.heads.map((h) => (
            <Row key={h.role} label={h.role}>
              {h.names.join(', ')}{h.office && <small>{h.office}</small>}
            </Row>
          ))}
          <Row label="Capital">{d.capitals.join(', ')}</Row>
          <Row label="Population">{d.population && <>{nf.format(d.population)}{d.popYear && <small>{d.popYear}</small>}</>}</Row>
          <Row label="Area">{d.area && `${nf.format(Math.round(d.area))} km²`}</Row>
          <Row label="Government">{d.government.join(', ')}</Row>
          <Row label="Languages">{d.languages.slice(0, 6).join(', ') + (d.languages.length > 6 ? ` +${d.languages.length - 6}` : '')}</Row>
          <Row label="Currency">{d.currencies.join(', ')}</Row>
          {d.stale && <p className="muted">Showing saved data (offline).</p>}
          <a className="wd" href={d.item} target="_blank" rel="noreferrer">Wikidata ↗</a>
        </dl>
      )}
    </div>
  )
}

export default function App() {
  const [svg, setSvg] = useState('')
  const [data, setData] = useState(null)
  const [selected, setSelected] = useState(null) // { iso, name }
  const [envOn, setEnvOn] = useState(() => store.get('atlas:env', '1') === '1')
  const [conflictsOn, setConflictsOn] = useState(() => store.get('atlas:conflicts', '0') === '1')
  const [theme, setTheme] = useState(() => store.get('atlas:theme', window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'))
  const [typeFilter, setTypeFilter] = useState(() => new Set(TYPES))
  const [year, setYear] = useState(NOW)
  const [yearMode, setYearMode] = useState('cumulative')
  const [playing, setPlaying] = useState(false)
  const [focusConflict, setFocusConflict] = useState(null)
  const mapRef = useRef(null)
  const tipRef = useRef(null)
  const countryRef = useRef(null)
  const names = useRef({})
  const view = useRef({ ...BASE })
  const api = useRef({})
  const moved = useRef(false)

  useEffect(() => { loadSvg().then(setSvg); loadData().then(setData) }, [])
  useEffect(() => { document.documentElement.dataset.theme = theme; store.set('atlas:theme', theme) }, [theme])
  useEffect(() => { store.set('atlas:env', envOn ? '1' : '0') }, [envOn])
  useEffect(() => { store.set('atlas:conflicts', conflictsOn ? '1' : '0') }, [conflictsOn])

  const rows = data?.rows
  const tiers = data?.tiers
  const group = (list) => {
    const m = {}
    for (const r of list) for (const iso of String(r.ISO).split(',').map((x) => x.trim()).filter(Boolean)) (m[iso] ||= []).push(r)
    return m
  }
  const byIso = useMemo(() => group(rows ?? []), [rows]) // every entry, ignoring filters
  const visibleRows = useMemo(
    () => (rows ?? []).filter((r) => typeFilter.has(r['Deliberate / Byproduct / Hybrid']) && inRange(r.from, r.to, year, yearMode)),
    [rows, typeFilter, year, yearMode]
  )
  const visibleByIso = useMemo(() => group(visibleRows), [visibleRows])
  const visibleConflicts = useMemo(
    () => (data?.conflicts ?? []).filter((c) => inRange(c.from, c.to, year, yearMode)),
    [data, year, yearMode]
  )
  // A country is as red as its map tier allows, capped by how many conflicts are visible at this point in time
  const tierNow = useMemo(() => {
    const cnt = {}
    for (const c of visibleConflicts) for (const iso of c.isos) cnt[iso] = (cnt[iso] || 0) + 1
    const t = {}
    for (const [iso, tier] of Object.entries(tiers ?? {})) if (cnt[iso]) t[iso] = Math.min(tier, cnt[iso])
    return t
  }, [visibleConflicts, tiers])
  const conflictsByIso = useMemo(() => {
    const m = {}
    for (const c of visibleConflicts) for (const iso of c.isos) (m[iso] ||= []).push(c)
    return m
  }, [visibleConflicts])

  // Countries involved in any conflict the selected country took part in
  const selConflicts = selected ? conflictsByIso[selected.iso] ?? [] : []
  const focused = focusConflict ? data?.conflicts.find((c) => c.name === focusConflict) : null
  const involved = useMemo(() => {
    if (!conflictsOn) return null
    if (focused) return new Set(focused.isos)
    return selConflicts.length ? new Set(selConflicts.flatMap((c) => c.isos)) : null
  }, [conflictsOn, focused, selConflicts])
  const chooseConflict = (name) => { setFocusConflict((f) => (f === name ? null : name)); setConflictsOn(true) }
  const toggleType = (t) => setTypeFilter((prev) => {
    if (prev.size === TYPES.length) return new Set([t])
    const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t)
    return n.size === 0 ? new Set(TYPES) : n
  })

  useEffect(() => { // on phones the details sit below the sticky map, so bring them into view
    if (selected && window.matchMedia('(max-width: 700px)').matches) countryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [selected?.iso]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { // play the timeline
    if (!playing) return
    if (year >= NOW) { setPlaying(false); return }
    const id = setTimeout(() => setYear((y) => y + 1), 700)
    return () => clearTimeout(id)
  }, [playing, year])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { setFocusConflict(null); setSelected(null) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 1. Tag every country shape with its ISO code and name
  useEffect(() => {
    const root = mapRef.current
    if (!root || !svg) return
    const nm = {}
    root.querySelectorAll('path').forEach((n) => {
      const key = n.id || CLS_ISO[n.getAttribute('class')]
      if (!key) return
      n.dataset.iso = key
      const name = n.getAttribute('name')
      if (name) nm[key] = name
    })
    root.querySelectorAll('path[data-iso]').forEach((n) => { nm[n.dataset.iso] ||= n.getAttribute('class') || n.dataset.iso })
    names.current = nm
  }, [svg])

  // 2. Colour: environmental data on top, conflict tier underneath (fill if no env data, rim if env data)
  useEffect(() => {
    const root = mapRef.current
    if (!root || !svg || !data) return
    root.querySelectorAll('path[data-iso]').forEach((n) => {
      const iso = n.dataset.iso
      const entries = envOn ? visibleByIso[iso] : null
      const tier = conflictsOn ? tierNow[iso] : null
      let fill = ''
      delete n.dataset.env; delete n.dataset.tier
      if (entries) {
        const types = new Set(entries.map((e) => e['Deliberate / Byproduct / Hybrid']))
        fill = types.size === 1 ? ENV_COLOURS[[...types][0]] ?? ENV_COLOURS.Mixed : ENV_COLOURS.Mixed
        n.dataset.env = '1'
      } else if (tier) {
        // hatched = in conflict, but no environmental reporting recorded yet
        fill = envOn && !byIso[iso] ? `url(#hatch-${tier})` : CONFLICT_COLOURS[tier]
        n.dataset.tier = tier
      }
      n.style.fill = fill
    })
    for (const iso of Object.keys(byIso)) if (!root.querySelector(`[data-iso="${iso}"]`)) console.warn(`No map shape for ISO "${iso}"`)
    const s = root.querySelector('svg')
    if (!s.querySelector('#atlas-defs')) {
      const d = document.createElementNS(NS, 'defs')
      d.id = 'atlas-defs'
      d.innerHTML = [1, 2, 3].map((t) => `<pattern id="hatch-${t}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="${CONFLICT_COLOURS[t]}"/><rect width="0.7" height="5" fill="${t === 3 ? 'rgba(255,255,255,.3)' : 'rgba(0,0,0,.2)'}"/></pattern>`).join('')
      s.insertBefore(d, s.firstChild)
    }
    let g = s.querySelector('g.rim')
    if (!g) { g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'rim'); s.insertBefore(g, s.firstChild) }
    g.replaceChildren()
    if (conflictsOn)
      root.querySelectorAll('path[data-env]').forEach((n) => {
        const t = tierNow[n.dataset.iso]
        if (!t) return
        const p = document.createElementNS(NS, 'path')
        p.setAttribute('d', n.getAttribute('d'))
        p.setAttribute('data-rim', n.dataset.iso)
        p.style.stroke = CONFLICT_COLOURS[t]
        g.appendChild(p)
      })
  }, [svg, data, byIso, visibleByIso, tierNow, conflictsOn, envOn])

  // 3. Selection highlight (re-appending brings the outline above neighbours)
  useEffect(() => {
    const root = mapRef.current
    if (!root) return
    root.querySelectorAll('[data-iso]').forEach((n) => {
      const on = n.dataset.iso === selected?.iso
      n.toggleAttribute('data-selected', on)
      if (on) n.parentNode.appendChild(n)
    })
  }, [selected, svg, data])

  // 4. Conflict focus: involved countries stay, everything else fades
  useEffect(() => {
    const root = mapRef.current
    if (!root) return
    root.querySelectorAll('[data-involved]').forEach((n) => n.removeAttribute('data-involved'))
    if (involved) involved.forEach((iso) => root.querySelectorAll(`[data-iso="${iso}"],[data-rim="${iso}"]`).forEach((n) => n.setAttribute('data-involved', '')))
  }, [involved, svg, data, conflictsOn])

  // Zoom (wheel / buttons) and pan (drag) by manipulating the viewBox
  useEffect(() => {
    const el = mapRef.current
    const s = el?.querySelector('svg')
    if (!s) return
    const v = view.current
    const apply = () => {
      v.x = Math.min(Math.max(v.x, BASE.x), BASE.x + BASE.w - v.w)
      v.y = Math.min(Math.max(v.y, BASE.y), BASE.y + BASE.h - v.h)
      s.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`)
    }
    const zoomAt = (f, cx, cy) => {
      const w = Math.min(BASE.w, Math.max(BASE.w / MAX_ZOOM, v.w * f))
      const k = w / v.w
      const p = s.createSVGPoint(); p.x = cx; p.y = cy
      const q = p.matrixTransform(s.getScreenCTM().inverse())
      v.x = q.x - (q.x - v.x) * k
      v.y = q.y - (q.y - v.y) * k
      v.w = w; v.h = (w * BASE.h) / BASE.w
      apply()
    }
    api.current = {
      zoomBy: (f) => { const r = el.getBoundingClientRect(); zoomAt(f, r.left + r.width / 2, r.top + r.height / 2) },
      reset: () => { Object.assign(v, BASE); apply() },
    }
    apply()
    const onWheel = (e) => { e.preventDefault(); zoomAt(Math.exp(e.deltaY * 0.0015), e.clientX, e.clientY) }
    // Pointer events cover mouse, touch and pen: one pointer pans, two pinch-zoom.
    const pts = new Map()
    let pinch = null
    const info = () => {
      const [a, b] = [...pts.values()]
      return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }
    }
    const onDown = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY })
      if (pts.size === 1) moved.current = false
      if (pts.size === 2) { moved.current = true; pinch = info() }
    }
    const onMove = (e) => {
      const p = pts.get(e.pointerId)
      if (!p) return
      if (pts.size === 1) {
        if (!moved.current && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < (e.pointerType === 'mouse' ? 4 : 8)) return
        moved.current = true
        const sc = s.getScreenCTM().a
        v.x -= (e.clientX - p.x) / sc; v.y -= (e.clientY - p.y) / sc
        p.x = e.clientX; p.y = e.clientY
        apply()
      } else if (pts.size === 2) {
        p.x = e.clientX; p.y = e.clientY
        const cur = info()
        zoomAt(pinch.d / cur.d, pinch.cx, pinch.cy)
        const sc = s.getScreenCTM().a
        v.x -= (cur.cx - pinch.cx) / sc; v.y -= (cur.cy - pinch.cy) / sc
        apply()
        pinch = cur
      }
    }
    const onUp = (e) => {
      pts.delete(e.pointerId)
      if (pts.size === 1) { const r = [...pts.values()][0]; r.sx = r.x; r.sy = r.y } // carry on panning with the remaining finger
      if (pts.size < 2) pinch = null
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [svg])

  const onClick = (e) => {
    if (moved.current) { moved.current = false; return } // end of a pan, not a click
    const n = e.target.closest('[data-iso]')
    if (!n || n.dataset.iso === selected?.iso) return setSelected(null)
    setSelected({ iso: n.dataset.iso, name: names.current[n.dataset.iso] })
  }
  const onHover = (e) => {
    const t = tipRef.current
    const n = e.target.closest?.('[data-iso]')
    if (!n || e.buttons || e.pointerType !== 'mouse') { t.style.opacity = 0; return }
    t.textContent = names.current[n.dataset.iso]
    t.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 16}px)`
    t.style.opacity = 1
  }

  const totalEntries = selected ? byIso[selected.iso]?.length ?? 0 : 0
  const entries = !envOn ? [] : selected ? visibleByIso[selected.iso] ?? [] : focused ? visibleRows.filter((e) => e.Conflict === focused.name) : []
  const noData = envOn && selected && totalEntries === 0 && (conflictsByIso[selected.iso]?.length > 0 || (data?.conflicts ?? []).some((c) => c.isos.includes(selected.iso)))
  const credits = [...new Set(entries.map((e) => e.Credit).filter(Boolean))]
  const focus = !!involved
  const hasYears = !!rows?.some((r) => 'Year from' in r) && !!data?.conflicts.some((c) => c.from !== null)

  return (
    <div className="app">
      <aside className="left">
        <section className="panel info">
          <div className="logo" role="img" aria-label="AIM – Architectural Investigation Matrix" dangerouslySetInnerHTML={{ __html: logo }} />
          <h1>Environmental Damage as a Consequence of Conflict</h1>

          <div className="key">
            <h3>Key</h3>
            <button className="switch env" role="switch" aria-checked={envOn} onClick={() => setEnvOn((v) => !v)}>
              <span className="track"><span className="thumb" /></span>Environmental damage
            </button>
            {envOn && (
              <ul className="legend sub">
                {TYPES.map((t) => (
                  <li key={t}>
                    <button className="ftype" data-off={!typeFilter.has(t)} onClick={() => toggleType(t)} title="Click to filter by type">
                      <i style={{ background: ENV_COLOURS[t] }} />{t}
                    </button>
                  </li>
                ))}
                <li><i style={{ background: ENV_COLOURS.Mixed }} />Multiple types</li>
                <li><i className="none" />No recorded entries</li>
                {conflictsOn && <li className="cov"><i className="hatch" />{COVERAGE_NOTE}</li>}
              </ul>
            )}
            <button className="switch conf" role="switch" aria-checked={conflictsOn} onClick={() => setConflictsOn((v) => !v)}>
              <span className="track"><span className="thumb" /></span>Conflicts since 2000
            </button>
            {conflictsOn && (
              <ul className="legend sub">
                {[3, 2, 1].map((t) => <li key={t}><i style={{ background: CONFLICT_COLOURS[t] }} />{CONFLICT_LABELS[t]}</li>)}
              </ul>
            )}
            {focused && (
              <div className="focus-banner">
                <span><b>{focused.name}</b><small>{focused.years} · {focused.isos.length} countries</small></span>
                <button onClick={() => setFocusConflict(null)} aria-label="Clear conflict focus">✕</button>
              </div>
            )}
          </div>

          {selected ? (
            <>
              <div ref={countryRef} className="country-anchor"><CountryPanel selected={selected} /></div>
              {conflictsOn && selConflicts.length > 0 && (
                <div className="conflicts">
                  <h3>Conflicts since 2000</h3>
                  <ul>{selConflicts.map((c) => <li key={c.name}><button className={'cbtn' + (focusConflict === c.name ? ' on' : '')} onClick={() => chooseConflict(c.name)} title="Highlight only this conflict">{c.name}</button><small>{c.years}</small></li>)}</ul>
                </div>
              )}
              {envOn && (
                <div className="entries">
                  Environmental Damage Entries: <b>{entries.length}</b>{entries.length !== totalEntries && <small> of {totalEntries}</small>}
                  {noData && <p className="coverage">{COVERAGE_NOTE}</p>}
                </div>
              )}
            </>
          ) : (
            <p className="hint">Select a country. Scroll to zoom, drag to pan. Esc clears.</p>
          )}
        </section>
        <section className="panel box">
          <h2>Attribution</h2>
          <p>Map: simplemaps.com (MIT licence). Country data: Wikidata (CC0).</p>
          {credits.map((c) => <p key={c}>Image: {c}</p>)}
        </section>
        <section className="panel box">
          <h2>Sources</h2>
          {entries.every((e) => !e.Source) && <p>–</p>}
          {entries.map((e, i) => e.Source && (
            <p key={i}>{e.URL ? <a href={e.URL} target="_blank" rel="noreferrer">{e.Source}</a> : e.Source}</p>
          ))}
        </section>
      </aside>

      <div className="mapwrap">
        <main className={'map' + (focus ? ' focus' : '')} ref={mapRef} onClick={onClick} onPointerMove={onHover} onPointerLeave={() => (tipRef.current.style.opacity = 0)} dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="tip" ref={tipRef} />
        {selected && <div className="selchip"><span>{selected.name}</span><button onClick={() => setSelected(null)} aria-label="Clear selection">✕</button></div>}
        <div className="timeline">
          <button className="play" onClick={() => { if (year >= NOW) setYear(MIN_YEAR); setPlaying((p) => !p) }} aria-label={playing ? 'Pause' : 'Play timeline'}>{playing ? '❚❚' : '▶'}</button>
          <input type="range" min={MIN_YEAR} max={NOW} value={year} onChange={(e) => { setPlaying(false); setYear(Number(e.target.value)) }} aria-label="Year" />
          <output>{year >= NOW && yearMode === 'cumulative' ? 'All years' : yearMode === 'cumulative' ? `to ${year}` : year}</output>
          <span className="tcount">
            {hasYears ? `${visibleRows.length}/${rows.length} entries · ${visibleConflicts.length} conflicts` : 'data.xlsx has no Year columns: replace it with the latest version'}
          </span>
          <div className="seg">
            {[['cumulative', 'Cumulative'], ['active', 'Active']].map(([k, l]) => (
              <button key={k} data-on={yearMode === k} onClick={() => setYearMode(k)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="tools">
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle dark mode" title="Toggle dark mode">{theme === 'dark' ? '☀' : '☾'}</button>
        </div>
        <div className="zoom">
          <button onClick={() => api.current.zoomBy?.(0.6)} aria-label="Zoom in">+</button>
          <button onClick={() => api.current.zoomBy?.(1 / 0.6)} aria-label="Zoom out">−</button>
          <button onClick={() => api.current.reset?.()} aria-label="Reset view">⟲</button>
        </div>
      </div>

      <aside className="right">
        {envOn && selected && entries.length === 0 && totalEntries > 0 && <div className="empty">No entries for {selected.name} match the current type and year filters.</div>}
        {envOn && selected && totalEntries === 0 && <div className="empty">No environmental damage entries recorded for {selected.name}.</div>}
        {entries.map((e, i) => (
          <article className={'card' + (focused && e.Conflict === focused.name ? ' linked' : '')} key={i}>
            <div className="img"><CardImage key={e.Image} code={e.Image} alt={e['Environmental damage']} /></div>
            <div className="meta">
              <div className="loc"><b>Location</b>{e['Conflict / Location']}{e.Conflict && <button className="chip" onClick={() => chooseConflict(e.Conflict)} title="Highlight this conflict on the map">Part of: {e.Conflict}</button>}</div>
              <div className="dmg"><b>Environmental damage</b>{e['Environmental damage']}</div>
              <div className="type"><b>Deliberate / Byproduct / Hybrid</b>{e['Deliberate / Byproduct / Hybrid']}</div>
              <div className="date"><b>Date</b>{e.Date}</div>
              <div className="why"><b>Why is it significant</b>{e['Why it is significant']}</div>
            </div>
          </article>
        ))}
      </aside>
    </div>
  )
}
