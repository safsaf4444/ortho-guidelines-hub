import { useEffect, useMemo, useRef, useState } from 'react';
import { GUIDELINES_DATA, type Guideline } from '../data/guidelines-data';
import { applySearchToCatalogue } from '../lib/search/app-adapter';
import { canonicalProvider } from '../lib/providers';
import { associatedSections, editionLabel, linkCheckContext, primarySourceShortcut, sortSections, uniqueRankedResults } from '../lib/public-presentation';
import { filterPresentation } from '../lib/reader-filters';
import { usePwaUpdate } from '../lib/pwa-update';
import NavigationDrawer from '../components/NavigationDrawer';

const data = GUIDELINES_DATA;
const providers = [...new Set(data.map(g => canonicalProvider(g.source)))].sort();
const sections = sortSections([...new Set(data.flatMap(associatedSections))]);
type Route = { section: string; query: string; publisher: string; specialty: string; link: string; view: 'browse' | 'about' | 'catalogue' };
function readRoute(): Route {
  const hash = location.hash.slice(1), [path, qs] = hash.split('?');
  const p = new URLSearchParams(qs || '');
  const view = path === '/about' ? 'about' : path === '/catalogue' ? 'catalogue' : 'browse';
  const rawSection = path?.startsWith('/section/') ? decodeURIComponent(path.slice(9)) : 'All';
  return { view, section: sections.includes(rawSection) ? rawSection : 'All', query: p.get('q') ?? '', publisher: p.get('publisher') ?? 'All', specialty: p.get('specialty') ?? 'All', link: p.get('link') ?? 'All' };
}
function routeHash(r: Route): string {
  const p = new URLSearchParams();
  if (r.query) p.set('q',r.query); if(r.publisher !== 'All') p.set('publisher',r.publisher);
  if(r.specialty !== 'All') p.set('specialty',r.specialty);if(r.link !== 'All') p.set('link',r.link);
  const path = r.view === 'about' ? '/about' : r.view === 'catalogue' ? '/catalogue' : r.section === 'All' ? '/' : '/section/' + encodeURIComponent(r.section);
  return '#' + path + (p.size ? '?' + p.toString() : '');
}
function Card({g,showSections}:{g:Guideline;showSections:boolean}) {
  const url=primarySourceShortcut(g);
  return <article data-guideline-id={g.id} className="bg-white border border-slate-300 rounded-lg p-4 space-y-2 min-w-0 break-words">
    <h3 className="text-base font-semibold text-slate-900">{g.topic}</h3>
    <p className="text-sm text-slate-700">{g.source} | {g.type}</p>
    {showSections && <p className="text-xs text-slate-700">Sections: {associatedSections(g).join(', ')}</p>}
    <p className="text-xs text-slate-700">Recorded guidance status: {g.guidanceStatus === 'current' ? 'Current (currency unconfirmed)' : g.guidanceStatus}. Link status: {g.linkVerificationStatus ?? 'not checked'}.</p>
    {url && <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded bg-slate-900 px-3 text-sm text-white">Open publisher source<span className="sr-only"> for {g.topic} (new tab)</span></a>}
    {!url && <p className="text-sm text-amber-800">No safe primary source shortcut is available. Review the recorded versions below.</p>}
    <details className="text-sm text-slate-800"><summary className="cursor-pointer min-h-11 py-3 font-medium">Description and recorded versions</summary>
      <div className="space-y-2"><p><strong>Catalogue description:</strong> {g.summary}</p>{g.notes && <p><strong>Recorded notes:</strong> {g.notes}</p>}
      <p>{linkCheckContext(g)}</p><p>Recorded editorial date: {g.editorialReviewDate || 'not recorded'}; this is not evidence of independent clinical sign-off.</p>
      <ul className="space-y-2">{g.versions.map((v,i)=><li key={i}>{/^https?:\/\//i.test(v.url) ? <a href={v.url} target="_blank" rel="noopener noreferrer" className="underline text-slate-900">{editionLabel(v.label) || 'Source'} (new tab)</a> : <span>Unsafe source URL omitted</span>}</li>)}</ul></div>
    </details>
  </article>;
}
export default function ReaderApp(){
  const [route,setRoute]=useState(readRoute);
  const [drawerOpen,setDrawerOpen]=useState(false);const menuRef=useRef<HTMLButtonElement>(null);const searchRef=useRef<HTMLInputElement>(null);
  const [online,setOnline]=useState(navigator.onLine);const pwa=usePwaUpdate();
  useEffect(()=>{const onHash=()=>setRoute(readRoute());const onOnline=()=>setOnline(navigator.onLine);window.addEventListener('hashchange',onHash);window.addEventListener('online',onOnline);window.addEventListener('offline',onOnline);return()=>{window.removeEventListener('hashchange',onHash);window.removeEventListener('online',onOnline);window.removeEventListener('offline',onOnline)}},[]);
  const change=(next:Partial<Route>)=>{const target={...route,...next};setRoute(target);const h=routeHash(target);if(location.hash!==h)history.pushState(null,'',h)};
  const clear=()=>{change({query:'',publisher:'All',specialty:'All',link:'All',section:'All',view:'browse'});searchRef.current?.focus()};
  const matches=useMemo(()=>{
    const scoped=data.filter(g=>!g.archived&&(route.section==='All'||associatedSections(g).includes(route.section))&&(route.link==='All'||(g.linkVerificationStatus??'unchecked')===route.link));
    const outcome=applySearchToCatalogue(scoped,route.query);
    return { outcome,rows:uniqueRankedResults(filterPresentation(outcome.ordered,route.publisher,route.specialty)) };
  },[route]);
  const browsing=!route.query.trim();
  const rows=route.view==='catalogue'?[...data].filter(g=>!g.archived).sort((a,b)=>canonicalProvider(a.source).localeCompare(canonicalProvider(b.source))||a.section.localeCompare(b.section)||a.topic.localeCompare(b.topic)):matches.rows;
  const groupNames=browsing&&route.view==='browse' ? sortSections([...new Set(rows.flatMap(associatedSections))]) : [];
  return <div className="public-browse min-h-screen bg-slate-50 text-slate-900">
    <a href="#main" onClick={e=>{e.preventDefault();document.getElementById('main')?.focus()}} className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:p-3">Skip to results</a>
    <header className="bg-slate-900 text-white p-4 flex items-center gap-3"><button type="button" ref={menuRef} aria-label="Open sections menu" aria-expanded={drawerOpen} aria-controls="sections-drawer" onClick={()=>setDrawerOpen(true)} className="md:hidden min-w-11 min-h-11 border rounded">Menu</button><div><strong className="block">Orthopaedic Guidelines Hub</strong><span className="text-xs">Private local reader preview | bundled 10 September 2026 snapshot</span></div></header>
    <div className="md:flex"><NavigationDrawer open={drawerOpen} setOpen={setDrawerOpen} triggerRef={menuRef}><nav aria-label="Catalogue navigation" className="p-3 space-y-1">{[['All','All entries'],...sections.map(s=>[s,s])].map(([id,label])=><button key={id} type="button" onClick={()=>{change({view:'browse',section:id});setDrawerOpen(false)}} className="block w-full text-left rounded px-3 py-2 min-h-11 hover:bg-slate-100">{label}</button>)}<button type="button" onClick={()=>{change({view:'catalogue'});setDrawerOpen(false)}} className="block w-full text-left px-3 py-2 min-h-11">Full catalogue</button><button type="button" onClick={()=>{change({view:'about'});setDrawerOpen(false)}} className="block w-full text-left px-3 py-2 min-h-11">About</button></nav></NavigationDrawer>
    <main id="main" tabIndex={0} className="flex-1 min-w-0 max-w-5xl mx-auto p-4 space-y-4">
      <p className="bg-amber-50 border border-amber-300 rounded p-3 text-sm">Independent student-built index of {data.length} entries, including guidance and reference resources. Descriptions are finding aids, not instructions. Check original publisher documents and local policy. Completeness, currency, clinical approval and NHS or Trust endorsement are not established.</p>
      {!online && <p role="status" className="bg-amber-100 p-3">Offline: this is a cached snapshot. Publisher pages may be unavailable.</p>}
      {pwa.needRefresh && <div role="status" className="bg-blue-100 p-3">An updated reader is available. <button onClick={pwa.updateNow} className="underline">Refresh now</button> <button onClick={pwa.dismiss} className="underline">Later</button></div>}
      {route.view==='about' ? <section><h1 className="text-xl font-bold mb-3">About this index</h1><p>The bundled catalogue was generated 10 September 2026. Stored link and editorial dates may originate from imports and do not establish independent review. A weekly checker reports reachability; it does not update these badges automatically. A reachable link does not establish current guidance. This reader has no sign-in or editorial controls. The separate editorial platform remains on hold.</p></section> : <>
      <h1 className="text-xl font-bold">{route.view==='catalogue'?'Full catalogue':route.section==='All'?'Find publisher guidance':route.section}</h1>
      {route.view==='browse' && <div className="bg-white rounded border p-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><label className="sm:col-span-2 lg:col-span-3">Search guidelines<input ref={searchRef} type="search" value={route.query} onChange={e=>change({query:e.target.value})} className="block w-full border rounded p-2 mt-1" /></label>
        <label>Publisher group<select value={route.publisher} onChange={e=>change({publisher:e.target.value})} className="block w-full border rounded p-2"><option value="All">All publishers</option>{providers.map(x=><option key={x}>{x}</option>)}</select></label>
        <label>Specialty<select value={route.specialty} onChange={e=>change({specialty:e.target.value})} className="block w-full border rounded p-2"><option value="All">All specialties</option>{sections.map(x=><option key={x}>{x}</option>)}</select></label>
        <label>Link status<select value={route.link} onChange={e=>change({link:e.target.value})} className="block w-full border rounded p-2"><option value="All">All statuses</option>{['verified','unchecked','blocked','broken','moved','needs-review','withdrawn','superseded'].map(x=><option key={x}>{x}</option>)}</select></label>
        <button type="button" onClick={clear} className="border rounded p-2 min-h-11">Clear filters</button>
      </div>}
      <p role="status" aria-live="polite" id="result-count">{rows.length} unique {route.view==='catalogue'?'catalogue entries':browsing?'matching entries':'search results'}{matches.outcome.notice&&route.view==='browse'?'. '+matches.outcome.notice:''}</p>
      {rows.length===0 && <div><p>No entries match these terms and filters.</p><button type="button" onClick={()=>searchRef.current?.focus()} className="underline p-2">Edit search query</button><button type="button" onClick={clear} className="underline p-2">Clear filters</button><button type="button" onClick={()=>change({view:'catalogue'})} className="underline p-2">Full catalogue</button></div>}
      {groupNames.length>0 ? groupNames.map(name=><section key={name} aria-label={name} className="space-y-3"><h2 className="text-lg font-semibold">{name}</h2>{rows.filter(g=>associatedSections(g).includes(name)).map(g=><Card key={g.id} g={g} showSections={false}/>)}</section>) : <section data-search-results={browsing?undefined:''} className="space-y-3">{rows.map(g=><Card key={g.id} g={g} showSections={!browsing}/>)}</section>}
      </>}
    </main></div>
  </div>;
}
