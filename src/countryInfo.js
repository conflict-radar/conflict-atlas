// Live country facts from Wikidata (CC0). One SPARQL round-trip per country, cached in localStorage.
const EP = 'https://query.wikidata.org/sparql'
const TTL = 14 * 24 * 3600 * 1000
const KEY = (iso) => `atlas:country:v1:${iso}`

async function run(q) {
  const res = await fetch(`${EP}?format=json&query=${encodeURIComponent(q)}`)
  if (!res.ok) throw new Error(`Wikidata ${res.status}`)
  return (await res.json()).results.bindings
}
const vals = (rows, k) =>
  [...new Set(rows.map((r) => r[k]?.value).filter((v) => v && !/^Q\d+$/.test(v)))]

const qFacts = (iso) => `SELECT ?c ?cLabel ?capLabel ?langLabel ?curLabel ?formLabel ?area ?flag WHERE {
  ?c wdt:P297 "${iso}".
  OPTIONAL { ?c wdt:P36 ?cap }  OPTIONAL { ?c wdt:P37 ?lang }  OPTIONAL { ?c wdt:P38 ?cur }
  OPTIONAL { ?c wdt:P122 ?form } OPTIONAL { ?c wdt:P2046 ?area } OPTIONAL { ?c wdt:P41 ?flag }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 400`

// Current office-holders: statements with no end date
const qLeaders = (iso) => `SELECT ?hosLabel ?hosOfficeLabel ?hogLabel ?hogOfficeLabel WHERE {
  ?c wdt:P297 "${iso}".
  OPTIONAL { ?c p:P35 ?hs . ?hs ps:P35 ?hos . FILTER NOT EXISTS { ?hs pq:P582 ?he } }
  OPTIONAL { ?c p:P6 ?gs . ?gs ps:P6 ?hog . FILTER NOT EXISTS { ?gs pq:P582 ?ge } }
  OPTIONAL { ?c wdt:P1906 ?hosOffice }  OPTIONAL { ?c wdt:P1313 ?hogOffice }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 100`

const qPop = (iso) => `SELECT ?pop ?d WHERE {
  ?c wdt:P297 "${iso}". ?c p:P1082 ?s . ?s ps:P1082 ?pop . OPTIONAL { ?s pq:P585 ?d }
} ORDER BY DESC(?d) LIMIT 1`

async function fetchInfo(iso) {
  const [f, l, p] = await Promise.all([run(qFacts(iso)), run(qLeaders(iso)), run(qPop(iso))])
  if (!f.length) return { empty: true }
  const flag = f.find((r) => r.flag)?.flag.value
  const heads = []
  const hos = vals(l, 'hosLabel'), hog = vals(l, 'hogLabel')
  const hosOff = vals(l, 'hosOfficeLabel'), hogOff = vals(l, 'hogOfficeLabel')
  if (hos.length && hog.length && hos.join() === hog.join())
    heads.push({ role: 'Head of state & government', names: hos, office: hosOff[0] || hogOff[0] })
  else {
    if (hos.length) heads.push({ role: 'Head of state', names: hos, office: hosOff[0] })
    if (hog.length) heads.push({ role: 'Head of government', names: hog, office: hogOff[0] })
  }
  const area = f.find((r) => r.area)?.area.value
  return {
    item: f[0].c.value,
    name: f[0].cLabel?.value,
    heads,
    capitals: vals(f, 'capLabel'),
    languages: vals(f, 'langLabel'),
    currencies: vals(f, 'curLabel'),
    government: vals(f, 'formLabel'),
    area: area ? Number(area) : null,
    flag: flag ? flag.replace(/^http:/, 'https:') + '?width=96' : null,
    population: p[0] ? Number(p[0].pop.value) : null,
    popYear: p[0]?.d ? new Date(p[0].d.value).getUTCFullYear() : null,
  }
}

export async function getCountryInfo(iso) {
  let cached = null
  try { cached = JSON.parse(localStorage.getItem(KEY(iso))) } catch { /* ignore */ }
  if (cached && Date.now() - cached.t < TTL) return cached.d
  try {
    const d = await fetchInfo(iso)
    try { localStorage.setItem(KEY(iso), JSON.stringify({ t: Date.now(), d })) } catch { /* ignore */ }
    return d
  } catch (e) {
    if (cached) return { ...cached.d, stale: true }
    throw e
  }
}
