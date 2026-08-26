import { useState, useEffect, useMemo } from 'react'
import { Search, ChevronDown, ExternalLink, Menu, X, TriangleAlert, Plus, WifiOff, Download, Database, History, ClipboardList } from 'lucide-react'
import { GUIDELINES_DATA, Guideline, GuidelineVersion } from './data/guidelines-data'
import { guidelinesService } from './lib/guidelines-service'
import { changelogService, type ChangelogEntry } from './lib/changelog-service'
import { isSupabaseEnabled } from './lib/supabase'
import { findDuplicateCandidates, countGuidelinesWithDuplicates, pairKey, DuplicateCandidate } from './lib/duplicate-detection'
import { computeMerge } from './lib/dedupe'
import { cn } from './lib/utils'
import ReviewDashboard from './components/ReviewDashboard'

const DUPLICATES_VIEW = '__duplicates__';
const CHANGELOG_VIEW = '__changelog__';
const REVIEW_QUEUE_VIEW = '__review-queue__';

// TEMPORARY READ-ONLY LOCKDOWN pending governance and editor-ownership decisions.
// While this is false, every write control (Add / Edit / Delete / Merge /
// link-verification / changelog "Add note") is hidden from everyone, matching the
// database lockdown in supabase-migration-readonly-lockdown.sql (RLS on, no write
// policy). Browsing, search, filtering, grouping and the static fallback are
// unaffected. A future Auth/editor model will replace this flag with real
// per-user gating. Typed as boolean so the (currently unreachable) write UI still
// type-checks for that later change.
const WRITES_ENABLED: boolean = false;

const LINK_STATUS_OPTIONS: { value: NonNullable<Guideline['linkVerificationStatus']>; label: string }[] = [
  { value: 'unchecked', label: 'Unchecked' },
  { value: 'needs-review', label: 'Needs review' },
  { value: 'broken', label: 'Broken' },
  { value: 'verified', label: 'Verified' },
];

function linkStatusBadgeClass(status: Guideline['linkVerificationStatus']): string {
  switch (status) {
    case 'verified': return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'broken': return 'border-red-200 bg-red-50 text-red-700';
    case 'needs-review': return 'border-amber-200 bg-amber-50 text-amber-700';
    default: return 'border-slate-200 bg-slate-50 text-slate-500';
  }
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

const DISMISSED_DUPLICATES_KEY = 'ortho-hub:dismissed-duplicate-pairs';

function loadDismissedPairs(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_DUPLICATES_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveDismissedPairs(pairs: Set<string>) {
  try {
    localStorage.setItem(DISMISSED_DUPLICATES_KEY, JSON.stringify([...pairs]));
  } catch {
    // localStorage unavailable — dismissals just won't persist across reloads
  }
}

const SECTION_ORDER = [
  "Emergencies", "Trauma", "Elective", "Bone Health",
  "Hand & Wrist", "Shoulder & Elbow", "Knee", "Foot & Ankle",
  "Spine", "Paediatrics", "Infection / Tumour", "Quick Reference",
  "Local Overlay"
];

const SECTION_SUBTITLES: Record<string, string> = {
  'Emergencies': 'Time-critical, on-call',
  'Trauma': 'Fractures and acute injuries',
  'Elective': 'Planned surgical pathways',
  'Bone Health': 'Osteoporosis and metabolic bone',
  'Hand & Wrist': 'Upper limb — distal',
  'Shoulder & Elbow': 'Upper limb — proximal',
  'Knee': 'Knee pathology',
  'Foot & Ankle': 'Lower limb — distal',
  'Spine': 'Spinal pathology and referral',
  'Paediatrics': 'Paediatric orthopaedics',
  'Infection / Tumour': 'Bone infection and neoplasia',
  'Quick Reference': 'Clinical reference tables',
  'Local Overlay': 'Trust-specific protocols',
};

const SECTION_OPTIONS = [
  "Emergencies", "Trauma", "Elective", "Bone Health",
  "Hand & Wrist", "Shoulder & Elbow", "Knee", "Foot & Ankle",
  "Spine", "Paediatrics", "Infection / Tumour", "Quick Reference", "Local Overlay"
];

const TYPE_OPTIONS = [
  "National guidance", "Specialist society guidance", "Quick reference", "Local overlay"
];

const STATUS_OPTIONS = [
  "Live", "To source", "Drafted", "Reviewed", "Under review", "Archived"
];

function sortSections(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const ia = SECTION_ORDER.indexOf(a);
    const ib = SECTION_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
}

// "Also published by" (Feature 3): the real co-badging signal in this dataset
// lives inside a single row's `source` string (e.g. "GIRFT / BHS / BOA",
// "BOA (BOASt) with BOFAS"), NOT across separate records — 0 topics appear
// under more than one distinct source. So we surface the co-publishers by
// parsing the source field, splitting only on " / " and " with " at paren depth
// 0. We deliberately do NOT split on "&", "and", or "," because those occur
// inside single society names (e.g. "BAJIS (Bone & Joint Infection Society)",
// "NHFD (RCP / FFFAP)").
function splitPublishers(source: string): string[] {
  const out: string[] = [];
  let buf = '';
  let depth = 0;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '(') { depth++; buf += ch; continue; }
    if (ch === ')') { depth = Math.max(0, depth - 1); buf += ch; continue; }
    if (depth === 0) {
      if (ch === '/' && source[i - 1] === ' ' && source[i + 1] === ' ') { out.push(buf); buf = ''; continue; }
      if (source.slice(i).toLowerCase().startsWith(' with ')) { out.push(buf); buf = ''; i += ' with '.length - 1; continue; }
    }
    buf += ch;
  }
  out.push(buf);
  return out.map(p => p.trim()).filter(Boolean);
}

// ─── Provider normalisation (Phase 0: presentation only) ─────────────────────
// The "By provider" view used to group on the raw `source` string, which yields
// 53 groups for 231 records because every collaboration spelling becomes its own
// bucket ("BESS", "BESS / BOA", "BESS / BOA / NHS EBI Programme", …).
//
// canonicalProvider() reduces a raw source to the single organisation that owns
// the document. It is a PURE function used only for grouping/sorting — the raw
// `source` string is still rendered verbatim on cards and in the detail view, and
// nothing here reads or writes the database.
//
// Rules (agreed 2026-08-23):
//   R1 first-listed publisher wins; collaborators never form their own group
//   R2 acronym expansions collapse to the acronym  (BASS (British Assoc…) → BASS)
//   R3 series/sub-brands collapse to the parent    (BOA (BOASt), BOA SpecS → BOA)
//   R4 parent-org parentheticals are dropped       (GIRFT (NHS England) → GIRFT)
//   R5 trailing " - Sub-report" is dropped         (GIRFT … - Spinal Services)
//   R6 a few whole strings are overridden outright (see OVERRIDES)
// NHFD is deliberately kept separate from FFFAP.

// Whole-source overrides. These win before any parsing, and exist because the
// first-listed publisher is NOT the owning body for these specific documents.
const PROVIDER_OVERRIDES: Record<string, string> = {
  'Academy of Medical Royal Colleges / NHS England / NICE / GIRFT': 'NHS EBI Programme',
  // UKSSB owns the standard; BASS is listed first but is not the owner here.
  'BASS / UKSSB': 'UKSSB',
};

// Canonical name for a single publisher token, after splitting. Maps long-form
// names and alternate spellings onto one label so the same body cannot produce
// two groups (e.g. "FFFAP (RCP)" and "RCP (FFFAP)").
const PROVIDER_ALIASES: Record<string, string> = {
  'academy of medical royal colleges': 'AoMRC',
  'british geriatrics society': 'BGS',
  'british hip society': 'BHS',
  'british sarcoma group': 'BSG',
  'british scoliosis society': 'BSS',
  'international osteoporosis foundation': 'IOF',
  'nhs evidence-based interventions (ebi) programme': 'NHS EBI Programme',
  'nhs ebi programme': 'NHS EBI Programme',
  'royal osteoporosis society': 'ROS',
  // Both spellings of the RCP falls & fragility fracture audit programme.
  'fffap (rcp)': 'FFFAP',
  'rcp (fffap)': 'FFFAP',
  // Parenthetical here is the parent org, not a sub-brand — keep NHFD distinct.
  'nhfd (rcp / fffap)': 'NHFD',
};

function canonicalProvider(source: string): string {
  const raw = (source ?? '').trim();
  if (!raw) return 'Unspecified';
  if (PROVIDER_OVERRIDES[raw]) return PROVIDER_OVERRIDES[raw];

  // R1: the owning body is the first publisher listed.
  let name = splitPublishers(raw)[0] ?? raw;

  // Alias check before stripping, so multi-word keys like "NHFD (RCP / FFFAP)"
  // and "FFFAP (RCP)" match while their parentheses are still intact.
  const aliased = PROVIDER_ALIASES[name.toLowerCase()];
  if (aliased) return aliased;

  // R5: drop a trailing " - Sub-report" (GIRFT (NHS England) - Spinal Services).
  name = name.replace(/\s+-\s+.+$/, '').trim();

  // R2/R3/R4: drop a trailing parenthetical. The text OUTSIDE the parentheses is
  // always the provider, whether the inside is an acronym expansion
  // ("BAJIS (Bone & Joint Infection Society)"), a series ("BOA (BOASt)",
  // "British Hip Society (NAHR)"), or a parent org ("GIRFT (NHS England)").
  //
  // Do NOT try to guess from string length which side is the acronym: NAHR is
  // shorter than "British Hip Society" but is a registry/series, not an alias for
  // it, so a length rule wrongly creates a top-level "NAHR" group. The reverse
  // cases where the acronym really is inside the brackets
  // ("British Sarcoma Group (BSG)") are handled by PROVIDER_ALIASES on the outer
  // text instead, which is explicit and cannot misfire.
  const paren = name.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  if (paren) name = paren[1].trim();

  // R3: space-separated sub-brand with no parentheses ("BOA SpecS" → "BOA").
  name = name.replace(/^(BOA)\s+SpecS$/i, '$1');

  return PROVIDER_ALIASES[name.toLowerCase()] ?? name.trim();
}

// Tracks connectivity so the UI can flag when the user is viewing the cached
// (installed/offline) copy rather than a live-loaded page.
function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

export default function App() {
  const [guidelines, setGuidelines] = useState<Guideline[]>(GUIDELINES_DATA);
  const isOnline = useOnlineStatus();

  // Silently replace static data with DB data when Supabase is configured.
  // Falls back to GUIDELINES_DATA automatically — see guidelines-service.ts.
  useEffect(() => {
    guidelinesService.getAll().then(setGuidelines);
  }, []);
  const [currentSection, setCurrentSection] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [linkStatusFilter, setLinkStatusFilter] = useState('All');
  // Sidebar navigation always filters by clinical section; this toggle only
  // changes how the resulting cards are grouped/labelled in the main panel —
  // same underlying data, no schema change, just a different lens on it.
  const [groupBy, setGroupBy] = useState<'section' | 'provider'>('section');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [editingGuideline, setEditingGuideline] = useState<Guideline | null>(null);
  const [isNewGuideline, setIsNewGuideline] = useState(false);
  const [dismissedPairs, setDismissedPairs] = useState<Set<string>>(() => loadDismissedPairs());

  const sections = sortSections([...new Set(guidelines.map(g => g.section))]);

  const duplicateCandidates = useMemo(
    () => findDuplicateCandidates(guidelines).filter(c => !dismissedPairs.has(pairKey(c.a, c.b))),
    [guidelines, dismissedPairs]
  );

  const filteredData = guidelines.filter(g => {
    if (currentSection !== 'All' && g.section !== currentSection) return false;
    if (linkStatusFilter !== 'All' && (g.linkVerificationStatus ?? 'unchecked') !== linkStatusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !g.topic.toLowerCase().includes(q) &&
        !g.summary.toLowerCase().includes(q) &&
        !g.source.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  // Two lenses on the same filtered data, chosen by the groupBy toggle:
  //  - 'section': a guideline appears under its primary section AND every
  //    cross-listed section — one canonical record, shown wherever it's
  //    clinically relevant. Sidebar filtering is unaffected either way.
  //  - 'provider': grouped by the CANONICAL issuing body, one bucket per
  //    provider, no cross-listing (a guideline has exactly one source). The raw
  //    `source` string is still shown on the card — only the grouping key is
  //    normalised (see canonicalProvider).
  const grouped: Record<string, Guideline[]> = {};
  if (groupBy === 'section') {
    filteredData.forEach(g => {
      const memberSections = [g.section, ...(g.crossListedIn ?? [])];
      for (const sec of memberSections) {
        if (!grouped[sec]) grouped[sec] = [];
        grouped[sec].push(g);
      }
    });
  } else {
    filteredData.forEach(g => {
      const key = canonicalProvider(g.source);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(g);
    });
  }

  const sortedSections = groupBy === 'section'
    ? sortSections(Object.keys(grouped))
    : Object.keys(grouped).sort((a, b) => a.localeCompare(b));

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      next.has(section) ? next.delete(section) : next.add(section);
      return next;
    });
  };

  const handleEdit = (guideline: Guideline) => {
    setEditingGuideline({ ...guideline, versions: guideline.versions.map(v => ({ ...v })) });
    setIsNewGuideline(false);
  };

  // Opens the shared Edit modal with a candidate's topic/source/versions
  // prefilled, for manual editorial review. Not in `guidelines`, so treated
  // as "new" like handleAddNew — the modal's own read-only gate is what
  // actually prevents this from ever reaching Supabase (see persistGuideline).
  const handleReviewCandidate = (draft: Guideline) => {
    setEditingGuideline(draft);
    setIsNewGuideline(true);
  };

  const handleAddNew = () => {
    const n = guidelines.filter(g => g.id.startsWith('new-')).length + 1;
    setEditingGuideline({
      id: `new-${String(n).padStart(3, '0')}`,
      section: SECTION_OPTIONS[0],
      topic: '',
      source: '',
      type: TYPE_OPTIONS[0],
      summary: '',
      notes: '',
      lastChecked: new Date().toISOString().split('T')[0],
      status: 'To source',
      regionalVariation: false,
      localOverlayNeeded: false,
      versions: [],
    });
    setIsNewGuideline(true);
  };

  const persistGuideline = async (updated: Guideline, isNew: boolean) => {
    // Read-only lockdown enforced at the source, not just by hiding the Save
    // button: even if something calls this directly, it must not reach
    // Supabase while WRITES_ENABLED is false.
    if (!WRITES_ENABLED) {
      console.warn('[persistGuideline] Ignored — WRITES_ENABLED is false. No local or database change made.');
      return;
    }
    // Update local state immediately
    setGuidelines(prev =>
      isNew ? [...prev, updated] : prev.map(g => g.id === updated.id ? updated : g)
    );
    try {
      if (isNew) {
        await guidelinesService.create(updated);
      } else {
        await guidelinesService.update(updated);
      }
    } catch (err) {
      console.error('[persistGuideline] Failed to persist guideline to Supabase:', err);
      const msg = err instanceof Error ? err.message : String(err);
      alert(`⚠️ DATABASE SAVE WARNING:\n\nFailed to save to Supabase database!\n\nReason: ${msg}\n\nYour changes are visible in this browser tab for now, but will be lost if you refresh. Please check your Supabase connection.`);
    }
  };

  const handleExportJSON = () => {
    const jsonStr = JSON.stringify(guidelines, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ortho-guidelines-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSave = (updated: Guideline) => {
    setEditingGuideline(null);
    persistGuideline(updated, isNewGuideline);
  };

  // Fast, in-card update path for link verification review — no modal round-trip.
  const handleQuickUpdate = (updated: Guideline) => {
    persistGuideline(updated, false);
  };

  const handleDismissDuplicate = (a: Guideline, b: Guideline) => {
    setDismissedPairs(prev => {
      const next = new Set(prev);
      next.add(pairKey(a, b));
      saveDismissedPairs(next);
      return next;
    });
  };

  // Non-optimistic: wait for the server delete to succeed before the UI
  // claims the record is gone, so a failed call never leaves a false state.
  const handleDelete = async (id: string) => {
    if (!WRITES_ENABLED) {
      console.warn('[handleDelete] Ignored — WRITES_ENABLED is false. No database change made.');
      return;
    }
    try {
      await guidelinesService.remove(id);
      setGuidelines(prev => prev.filter(g => g.id !== id));
    } catch (err) {
      console.error('[handleDelete] Failed to delete guideline:', err);
      alert(`Delete failed — the record was not removed.\n\n${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleMergeDuplicates = async (canonical: Guideline, duplicate: Guideline) => {
    const merged = computeMerge(canonical, duplicate);
    try {
      await guidelinesService.update(merged);
      await guidelinesService.remove(duplicate.id);
      setGuidelines(prev =>
        prev.map(g => g.id === merged.id ? merged : g).filter(g => g.id !== duplicate.id)
      );
    } catch (err) {
      // update() and remove() are awaited sequentially — if update throws,
      // remove() never runs, so a failure here never leaves a merge half-done.
      console.error('[handleMergeDuplicates] Failed to persist merge:', err);
      alert(`Merge failed — no changes were made.\n\n${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white font-sans text-slate-800">

      {/* Header */}
      <header className="h-[56px] bg-white border-b border-slate-200 flex items-center justify-between px-5 shrink-0 z-50">
        <div className="flex items-center gap-3">
          <button className="md:hidden text-slate-600" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
            <Menu className="w-5 h-5" />
          </button>
          <div className="bg-[#0F172A] text-white w-7 h-7 rounded flex items-center justify-center font-semibold text-sm shrink-0">
            O
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-serif text-[1rem] text-slate-900 leading-tight">Orthopaedic Guidelines Hub</span>
            <span className="text-[11px] text-slate-400 hidden sm:block mt-0.5">
              National guidance, grouped by topic — ward, on call, and clinic
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Supabase connection badge */}
          <div
            title={isSupabaseEnabled ? "Connected to Supabase live database" : "Operating in static fallback mode"}
            className={cn(
              "hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
              isSupabaseEnabled
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-amber-50 text-amber-700 border-amber-200"
            )}
          >
            <Database className="w-3.5 h-3.5" />
            <span>{isSupabaseEnabled ? "Supabase Live" : "Static Mode"}</span>
          </div>

          {/* Review Staged Guidelines — read-only manual review tool. Visible to
              everyone: it's a review surface, not a publication or admin
              surface, so it needs no sign-in. See ReviewDashboard.tsx. */}
          <button
            onClick={() => setCurrentSection(REVIEW_QUEUE_VIEW)}
            title="Manually review discovered guideline candidates awaiting editorial completion"
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
              currentSection === REVIEW_QUEUE_VIEW
                ? "bg-[#0F172A] text-white"
                : "text-slate-700 bg-slate-100 hover:bg-slate-200"
            )}
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Review Staged Guidelines</span>
          </button>

          {/* Export JSON backup button */}
          <button
            onClick={handleExportJSON}
            title="Download current guidelines as JSON backup"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export JSON</span>
          </button>
        </div>
      </header>

      {/* Offline notice — honest signal that this is a cached copy, not live data */}
      {!isOnline && (
        <div className="bg-amber-50 border-b border-amber-200 px-5 py-1.5 flex items-center gap-2 text-[11px] text-amber-800 shrink-0">
          <WifiOff className="w-3 h-3 shrink-0" />
          <span>Offline — showing a cached copy. Always confirm against the live source guidance.</span>
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {isSidebarOpen && (
          <div
            className="fixed inset-0 top-[56px] bg-black/40 z-30 md:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside className={cn(
          "w-[240px] bg-white border-r border-slate-200 flex flex-col justify-between overflow-y-auto shrink-0 transition-transform duration-300 z-40",
          "fixed md:relative top-[56px] md:top-0 bottom-0 left-0",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}>
          <div className="p-4">
            <div className="text-[10px] font-semibold text-slate-400 tracking-wider mb-2 uppercase">
              Sections
            </div>
            <nav className="flex flex-col gap-px">
              <button
                onClick={() => { setCurrentSection('All'); setIsSidebarOpen(false); }}
                className={cn(
                  "flex justify-between items-center px-2.5 py-1.5 rounded transition-colors",
                  currentSection === 'All'
                    ? "bg-[#0F172A] text-white"
                    : "text-slate-600 hover:bg-slate-50"
                )}
              >
                <span className="text-[12px] font-medium">All guidelines</span>
                <span className={cn(
                  "px-1.5 py-px rounded text-[11px] font-medium",
                  currentSection === 'All' ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                )}>
                  {guidelines.length}
                </span>
              </button>

              <button
                onClick={() => { setCurrentSection(DUPLICATES_VIEW); setIsSidebarOpen(false); }}
                className={cn(
                  "flex justify-between items-center px-2.5 py-1.5 rounded transition-colors",
                  currentSection === DUPLICATES_VIEW
                    ? "bg-[#0F172A] text-white"
                    : "text-slate-600 hover:bg-slate-50"
                )}
              >
                <span className="text-[12px] font-medium">Possible duplicates</span>
                <span className={cn(
                  "px-1.5 py-px rounded text-[11px] font-medium",
                  currentSection === DUPLICATES_VIEW ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700"
                )}>
                  {countGuidelinesWithDuplicates(duplicateCandidates)}
                </span>
              </button>

              <button
                onClick={() => { setCurrentSection(CHANGELOG_VIEW); setIsSidebarOpen(false); }}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded transition-colors",
                  currentSection === CHANGELOG_VIEW
                    ? "bg-[#0F172A] text-white"
                    : "text-slate-600 hover:bg-slate-50"
                )}
              >
                <History className="w-3 h-3 shrink-0" />
                <span className="text-[12px] font-medium">Changelog</span>
              </button>

              {sections.map(section => {
                const count = guidelines.filter(
                  g => g.section === section || (g.crossListedIn ?? []).includes(section)
                ).length;
                const isActive = currentSection === section;
                return (
                  <button
                    key={section}
                    onClick={() => { setCurrentSection(section); setIsSidebarOpen(false); }}
                    className={cn(
                      "flex justify-between items-center px-2.5 py-1.5 rounded transition-colors",
                      isActive ? "bg-[#0F172A] text-white" : "text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    <span className="text-[12px]">{section}</span>
                    <span className={cn(
                      "px-1.5 py-px rounded text-[11px] font-medium",
                      isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                    )}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="p-4 text-[10px] text-slate-400 border-t border-slate-100 leading-relaxed">
            National reference only. Not a substitute for clinical judgement or local trust policy.
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 flex flex-col bg-[#F8FAFC] overflow-y-auto relative">

          {/* Toolbar */}
          <div className="px-5 py-1.5 flex justify-between items-center gap-2 border-b border-slate-100 bg-white shrink-0">
            {currentSection === DUPLICATES_VIEW ? (
              <span className="text-[11px] text-slate-400">
                Heuristic matches only — nothing is merged or deleted automatically.
              </span>
            ) : currentSection === CHANGELOG_VIEW ? (
              <span className="text-[11px] text-slate-400">
                Full edit history across all guidelines, newest first. Append-only — notes can't be edited or deleted.
              </span>
            ) : currentSection === REVIEW_QUEUE_VIEW ? (
              <span className="text-[11px] text-slate-400">
                Read-only manual review — a discovery/candidate queue, not a publication tool.
              </span>
            ) : (
              <>
                <span className="text-[11px] text-slate-400 hidden md:block">
                  Tap a card to expand sources and versions.
                </span>
                <div className="flex items-center gap-2 w-full md:w-auto">
                  <div className="relative flex-1 md:w-[220px]">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search topics, providers…"
                      className="w-full pl-7 pr-3 py-1.5 bg-white border border-slate-200 rounded text-[12px] focus:outline-none focus:ring-1 focus:ring-slate-300 transition-shadow"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <select
                    value={linkStatusFilter}
                    onChange={e => setLinkStatusFilter(e.target.value)}
                    className="px-2 py-1.5 border border-slate-200 rounded text-[12px] bg-white focus:outline-none focus:ring-1 focus:ring-slate-300 shrink-0"
                  >
                    <option value="All">All link statuses</option>
                    {LINK_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  {/* Group-by toggle: same filtered data, different lens on the main panel.
                      Sidebar section filtering is untouched — this only changes how the
                      resulting cards are bucketed and labelled below. */}
                  <div className="hidden md:flex items-center border border-slate-200 rounded overflow-hidden shrink-0">
                    <button
                      onClick={() => setGroupBy('section')}
                      title="Group cards by clinical section"
                      className={cn(
                        "px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                        groupBy === 'section' ? "bg-[#0F172A] text-white" : "bg-white text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      By section
                    </button>
                    <button
                      onClick={() => setGroupBy('provider')}
                      title="Group cards by issuing provider/organisation"
                      className={cn(
                        "px-2.5 py-1.5 text-[12px] font-medium transition-colors border-l border-slate-200",
                        groupBy === 'provider' ? "bg-[#0F172A] text-white" : "bg-white text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      By provider
                    </button>
                  </div>
                  {WRITES_ENABLED && (
                    <button
                      onClick={handleAddNew}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-[#0F172A] text-white rounded text-[12px] font-medium hover:bg-slate-800 transition-colors shrink-0"
                    >
                      <Plus className="w-3 h-3" />
                      <span className="hidden sm:inline">Add guideline</span>
                      <span className="sm:hidden">Add</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Cards */}
          <div className="px-4 pt-3 pb-8 w-full max-w-4xl">
            {currentSection === DUPLICATES_VIEW ? (
              <DuplicatesPanel
                candidates={duplicateCandidates}
                onOpen={handleEdit}
                onDismiss={handleDismissDuplicate}
                onMerge={handleMergeDuplicates}
                onDeleteOne={g => handleDelete(g.id)}
              />
            ) : currentSection === CHANGELOG_VIEW ? (
              <ChangelogPanel guidelines={guidelines} />
            ) : currentSection === REVIEW_QUEUE_VIEW ? (
              <ReviewDashboard onEditCandidate={handleReviewCandidate} />
            ) : sortedSections.length === 0 ? (
              <p className="text-[12px] text-slate-400 mt-3">No guidelines found.</p>
            ) : (
              sortedSections.map(section => (
                <SectionContainer
                  key={section}
                  section={section}
                  items={grouped[section]}
                  allGuidelines={guidelines}
                  groupBy={groupBy}
                  isCollapsed={collapsedSections.has(section)}
                  onToggleCollapse={() => toggleSection(section)}
                  onEdit={handleEdit}
                  onQuickUpdate={handleQuickUpdate}
                />
              ))
            )}
          </div>
        </main>
      </div>

      {/* Reachable regardless of WRITES_ENABLED — the read-only Pending Review
          UI opens this modal for prefilled manual review (see
          handleReviewCandidate). Save/Delete are gated inside EditModal
          itself, and persistGuideline/handleDelete refuse to write while
          WRITES_ENABLED is false — this outer condition is not the write
          boundary. */}
      {editingGuideline && (
        <EditModal
          guideline={editingGuideline}
          onSave={handleSave}
          onClose={() => setEditingGuideline(null)}
          onDelete={handleDelete}
          isNew={isNewGuideline}
        />
      )}
    </div>
  );
}

// ─── Section Container ────────────────────────────────────────────────────────

function SectionContainer({
  section, items, allGuidelines, groupBy, isCollapsed, onToggleCollapse, onEdit, onQuickUpdate,
}: {
  section: string;
  items: Guideline[];
  allGuidelines: Guideline[];
  groupBy: 'section' | 'provider';
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onEdit: (g: Guideline) => void;
  onQuickUpdate: (g: Guideline) => void;
}) {
  // When grouped by section, `section` is a real clinical section with a
  // known subtitle. When grouped by provider, `section` is actually a
  // provider/source name — show a count instead of a clinical subtitle,
  // since SECTION_SUBTITLES has no entry (and wouldn't be meaningful) for it.
  const subtitle = groupBy === 'section'
    ? (SECTION_SUBTITLES[section] || 'Clinical guidance')
    : `${items.length} guideline${items.length === 1 ? '' : 's'}`;

  return (
    <div className="border border-slate-200 rounded-md mb-2.5 overflow-hidden bg-white">
      <div
        className="px-3.5 py-2 flex justify-between items-center cursor-pointer select-none hover:bg-slate-50 transition-colors"
        onClick={onToggleCollapse}
      >
        <div>
          <span className="text-[13px] font-semibold text-slate-700">{section}</span>
          <span className="text-[11px] text-slate-400 ml-2">{subtitle}</span>
        </div>
        <ChevronDown className={cn(
          "w-3.5 h-3.5 text-slate-400 transition-transform duration-200 shrink-0",
          isCollapsed && "rotate-180"
        )} />
      </div>

      {!isCollapsed && (
        <div className="px-3.5 pb-3.5 flex flex-col gap-1.5 border-t border-slate-100">
          <div className="h-1.5" />
          {items.map(g => (
            <GuidelineCard key={g.id} item={g} sectionContext={section} allGuidelines={allGuidelines} onEdit={onEdit} onQuickUpdate={onQuickUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Guideline Card ───────────────────────────────────────────────────────────

function GuidelineCard({
  item, sectionContext, allGuidelines, onEdit, onQuickUpdate,
}: {
  item: Guideline;
  sectionContext: string;
  allGuidelines: Guideline[];
  onEdit: (g: Guideline) => void;
  onQuickUpdate: (g: Guideline) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  // Sections this card also lives in, relative to where it's being viewed —
  // avoids e.g. showing "also in Trauma" while already inside the Trauma list.
  const otherSections = [item.section, ...(item.crossListedIn ?? [])].filter(s => s !== sectionContext);
  const linkStatus = item.linkVerificationStatus ?? 'unchecked';

  // Feature 3a — "Related in [section]": other guidelines that are members of
  // this card's primary clinical section (by primary section or cross-listing),
  // excluding itself, capped at 5. Computed live, nothing stored.
  const related = useMemo(() => {
    const inSection = (g: Guideline) =>
      g.section === item.section || (g.crossListedIn ?? []).includes(item.section);
    return allGuidelines.filter(g => g.id !== item.id && inSection(g)).slice(0, 5);
  }, [allGuidelines, item.id, item.section]);

  // Feature 3b — "Also published by": co-badging societies parsed from this
  // row's own source string (the only real signal for it — see splitPublishers).
  const alsoPublishedBy = useMemo(() => {
    const pubs = splitPublishers(item.source);
    return pubs.length > 1 ? pubs.slice(1) : [];
  }, [item.source]);

  return (
    <div className="border border-slate-200 rounded overflow-hidden bg-white">

      {/* Header row */}
      <button
        className="w-full px-3 py-1.5 flex justify-between items-center hover:bg-slate-50 text-left transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex flex-col gap-px min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[13px] font-medium text-slate-800 leading-snug">{item.topic}</span>
            <span className="text-[10px] text-slate-400 border border-slate-200 rounded px-1 py-px shrink-0">
              {item.type}
            </span>
            {otherSections.map(cl => (
              <span key={cl} className="text-[10px] text-slate-400">· also in {cl}</span>
            ))}
          </div>
          {item.subGroup && (
            <div className="text-[11px] text-slate-400">{item.subGroup}</div>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-3">
          <span className="text-[11px] text-slate-400 hidden sm:block">{item.source}</span>
          {(item.type === 'National guidance' || item.type === 'Specialist society guidance') && (
            <span className="text-[10px] text-slate-400 border border-slate-200 rounded px-1 py-px shrink-0">
              Natl
            </span>
          )}
          {item.regionalVariation && (
            <span className="text-[10px] text-slate-400 border border-slate-200 rounded px-1 py-px shrink-0">
              Reg
            </span>
          )}
          <ChevronDown className={cn(
            "w-3.5 h-3.5 text-slate-400 transition-transform duration-200",
            isExpanded && "rotate-180"
          )} />
        </div>
      </button>

      {/* Expanded body */}
      {isExpanded && (
        <div className="border-t border-slate-100 px-3 pt-2 pb-2.5">

          <p className="text-[12px] text-slate-600 leading-relaxed mb-1.5 whitespace-pre-line">
            {item.summary}
          </p>

          {item.regionalVariation && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-50 border border-slate-200 rounded mb-1.5">
              <TriangleAlert className="w-3 h-3 text-slate-400 shrink-0" />
              <span className="text-[11px] text-slate-500">
                Regional variation — check local trust protocol before applying.
              </span>
            </div>
          )}

          {item.versions.length > 0 && (
            <div className="mb-1.5">
              <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
                <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest">
                  Source Links
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={cn(
                    "text-[10px] px-1.5 py-px rounded border font-medium",
                    linkStatusBadgeClass(linkStatus)
                  )}>
                    {LINK_STATUS_OPTIONS.find(o => o.value === linkStatus)?.label}
                  </span>
                  {item.linkLastVerified && (
                    <span className="text-[10px] text-slate-400">verified {item.linkLastVerified}</span>
                  )}
                  {WRITES_ENABLED && (
                    <>
                      <select
                        value={linkStatus}
                        onClick={e => e.stopPropagation()}
                        onChange={e => onQuickUpdate({
                          ...item,
                          linkVerificationStatus: e.target.value as Guideline['linkVerificationStatus'],
                        })}
                        className="text-[10px] border border-slate-200 rounded px-1 py-0.5 bg-white focus:outline-none"
                      >
                        {LINK_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          onQuickUpdate({ ...item, linkVerificationStatus: 'verified', linkLastVerified: todayISO() });
                        }}
                        className="text-[10px] text-slate-500 hover:text-slate-700 underline underline-offset-2"
                      >
                        Mark verified today
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="flex flex-col">
                {item.versions.map((v, idx) => (
                  <div key={idx} className="flex justify-between items-center py-0.5 border-b border-slate-100 last:border-0">
                    {v.url && v.url !== '#' ? (
                      <a
                        href={v.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-slate-600 hover:text-slate-900 hover:underline flex items-center gap-1"
                        onClick={e => e.stopPropagation()}
                      >
                        {v.label}
                        <ExternalLink className="w-2.5 h-2.5 shrink-0 text-slate-400" />
                      </a>
                    ) : (
                      <span className="text-[11px] text-slate-500">{v.label}</span>
                    )}
                    {v.date && (
                      <span className="text-[10px] text-slate-400 ml-3 shrink-0">{v.date}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {item.notes && (
            <p className="text-[11px] text-slate-400 italic mb-1.5">{item.notes}</p>
          )}

          {/* Feature 3 — cross-references, computed live from existing data */}
          {alsoPublishedBy.length > 0 && (
            <div className="mb-1.5">
              <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">
                Also published by
              </div>
              <div className="flex flex-wrap gap-1">
                {alsoPublishedBy.map(p => (
                  <span key={p} className="text-[10px] text-slate-500 border border-slate-200 rounded px-1.5 py-px">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}

          {related.length > 0 && (
            <div className="mb-1.5">
              <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">
                Related in {item.section}
              </div>
              <div className="flex flex-col gap-px">
                {related.map(r => (
                  <span key={r.id} className="text-[11px] text-slate-600 truncate">
                    · {r.topic} <span className="text-slate-400">— {r.source}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Feature 2 — append-only changelog for this guideline. Mounts (and
              fetches) only when the card is expanded. */}
          <CardChangelog guidelineId={item.id} />

          <div className="flex justify-between items-center pt-1 border-t border-slate-100">
            <div className="flex items-center gap-2.5">
              {item.lastChecked && (
                <span className="text-[10px] text-slate-400">Last checked: {item.lastChecked}</span>
              )}
              <span className="text-[10px] text-slate-400">ID: {item.id}</span>
            </div>
            {WRITES_ENABLED && (
              <button
                onClick={e => { e.stopPropagation(); onEdit(item); }}
                className="px-2 py-0.5 text-[10px] font-medium border border-slate-200 rounded text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
              >
                Edit
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Changelog (Feature 2) ────────────────────────────────────────────────────

function fmtTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// Append-only note history for a single guideline, shown inside the expanded
// card. Fetches on mount (i.e. when the card expands). In static/offline mode
// the service returns [] for reads and throws on write (surfaced via alert).
function CardChangelog({ guidelineId }: { guidelineId: string }) {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const MAX_INLINE = 3;

  useEffect(() => {
    let active = true;
    changelogService.listForGuideline(guidelineId)
      .then(e => { if (active) setEntries(e); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [guidelineId]);

  const addNote = async () => {
    const trimmed = text.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const created = await changelogService.create({ guidelineId, description: trimmed });
      setEntries(prev => [created, ...prev]);
      setText('');
    } catch (err) {
      alert(`Could not add note.\n\n${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-1.5 border-t border-slate-100 pt-1.5">
      <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest mb-1">
        Changelog
      </div>

      {loading ? (
        <p className="text-[11px] text-slate-400">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-[11px] text-slate-400">No notes yet.</p>
      ) : (
        <ul className="flex flex-col gap-0.5 mb-1.5">
          {entries.slice(0, MAX_INLINE).map(e => (
            <li key={e.id} className="text-[11px] text-slate-600 flex gap-2">
              <span className="text-slate-400 shrink-0 tabular-nums">{fmtTimestamp(e.createdAt)}</span>
              <span className="whitespace-pre-line">{e.description}</span>
            </li>
          ))}
          {entries.length > MAX_INLINE && (
            <li className="text-[10px] text-slate-400">
              +{entries.length - MAX_INLINE} more — see the Changelog view.
            </li>
          )}
        </ul>
      )}

      {WRITES_ENABLED && (
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addNote(); } }}
            onClick={e => e.stopPropagation()}
            placeholder="Add a note…"
            className="flex-1 min-w-0 px-2 py-1 border border-slate-200 rounded text-[11px] bg-white focus:outline-none focus:ring-1 focus:ring-slate-300"
          />
          <button
            onClick={e => { e.stopPropagation(); addNote(); }}
            disabled={saving || !text.trim()}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium border border-slate-200 rounded text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            <Plus className="w-3 h-3" />
            Add note
          </button>
        </div>
      )}
    </div>
  );
}

// Project-wide edit history, newest first — reuses the full-width special-view
// pattern (like DuplicatesPanel), toggled from the sidebar.
function ChangelogPanel({ guidelines }: { guidelines: Guideline[] }) {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    changelogService.listAll()
      .then(e => { if (active) setEntries(e); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const guidelineById = useMemo(() => {
    const m = new Map<string, Guideline>();
    guidelines.forEach(g => m.set(g.id, g));
    return m;
  }, [guidelines]);

  if (loading) return <p className="text-[12px] text-slate-400 mt-3">Loading changelog…</p>;
  if (entries.length === 0) {
    return (
      <p className="text-[12px] text-slate-400 mt-3">
        No changelog entries yet{isSupabaseEnabled ? '' : ' — the live database isn’t connected, so notes are unavailable in static mode'}.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 mt-3">
      {entries.map(e => {
        const g = guidelineById.get(e.guidelineId);
        return (
          <div key={e.id} className="border border-slate-200 rounded-md bg-white px-3 py-2">
            <div className="flex justify-between items-start gap-2 flex-wrap">
              <span className="text-[12px] font-medium text-slate-800">{g ? g.topic : e.guidelineId}</span>
              <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">{fmtTimestamp(e.createdAt)}</span>
            </div>
            <p className="text-[12px] text-slate-600 whitespace-pre-line mt-0.5">{e.description}</p>
            <div className="text-[10px] text-slate-400 mt-1">
              {g ? `${g.section} · ${g.source}` : 'guideline not in current view'} · ID: {e.guidelineId}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

function EditModal({
  guideline, onSave, onClose, onDelete, isNew,
}: {
  guideline: Guideline;
  onSave: (g: Guideline) => void;
  onClose: () => void;
  onDelete: (id: string) => void;
  isNew: boolean;
}) {
  const [form, setForm] = useState<Guideline>({
    ...guideline,
    versions: guideline.versions.map(v => ({ ...v })),
  });

  const set = <K extends keyof Guideline>(key: K, value: Guideline[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const addVersion = () =>
    setForm(prev => ({ ...prev, versions: [...prev.versions, { label: '', url: '', date: '' }] }));

  const removeVersion = (idx: number) =>
    setForm(prev => ({ ...prev, versions: prev.versions.filter((_, i) => i !== idx) }));

  const setVersion = (idx: number, key: keyof GuidelineVersion, value: string) =>
    setForm(prev => ({
      ...prev,
      versions: prev.versions.map((v, i) => i === idx ? { ...v, [key]: value } : v),
    }));

  const lbl = "block text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5";
  const inp = "w-full px-2.5 py-1.5 border border-slate-200 rounded text-[12px] bg-white focus:outline-none focus:ring-1 focus:ring-slate-300";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3" onClick={onClose}>
      <div
        className="bg-white rounded-lg w-full max-w-[500px] max-h-[88vh] flex flex-col shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-4 py-2.5 border-b border-slate-200 shrink-0">
          <h2 className="text-[13px] font-semibold text-slate-800">
            {isNew ? 'Add Guideline' : 'Edit Guideline'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto px-4 py-3 flex flex-col gap-3">

          {/* Row 1: ID · Section · Type */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className={lbl}>ID</label>
              <input type="text" value={form.id} readOnly
                className={cn(inp, "bg-slate-50 text-slate-400 cursor-default")} />
            </div>
            <div>
              <label className={lbl}>Section</label>
              <select value={form.section} onChange={e => set('section', e.target.value)} className={inp}>
                {SECTION_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Type</label>
              <select value={form.type} onChange={e => set('type', e.target.value)} className={inp}>
                {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Topic */}
          <div>
            <label className={lbl}>Topic</label>
            <input type="text" value={form.topic}
              onChange={e => set('topic', e.target.value)}
              placeholder="Guideline topic name" className={inp} />
          </div>

          {/* Source */}
          <div>
            <label className={lbl}>Source</label>
            <input type="text" value={form.source}
              onChange={e => set('source', e.target.value)}
              placeholder="e.g. GIRFT, BOA, NICE" className={inp} />
          </div>

          {/* Summary */}
          <div>
            <label className={lbl}>Summary</label>
            <textarea value={form.summary}
              onChange={e => set('summary', e.target.value)}
              placeholder="Clinical summary…" rows={3}
              className={cn(inp, "resize-y min-h-[54px]")} />
          </div>

          {/* Notes */}
          <div>
            <label className={lbl}>Notes</label>
            <textarea value={form.notes ?? ''}
              onChange={e => set('notes', e.target.value)}
              placeholder="Optional notes…" rows={2}
              className={cn(inp, "resize-y min-h-[36px]")} />
          </div>

          {/* Last Checked · Status */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={lbl}>Last Checked</label>
              <input type="date" value={form.lastChecked}
                onChange={e => set('lastChecked', e.target.value)} className={inp} />
            </div>
            <div>
              <label className={lbl}>Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} className={inp}>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Link Verification Status · Last Verified */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={lbl}>Link Verification Status</label>
              <select value={form.linkVerificationStatus ?? 'unchecked'}
                onChange={e => set('linkVerificationStatus', e.target.value as Guideline['linkVerificationStatus'])}
                className={inp}>
                {LINK_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Link Last Verified</label>
              <input type="date" value={form.linkLastVerified ?? ''}
                onChange={e => set('linkLastVerified', e.target.value)} className={inp} />
            </div>
          </div>

          {/* Link Verification Notes */}
          <div>
            <label className={lbl}>Link Verification Notes</label>
            <textarea value={form.linkVerificationNotes ?? ''}
              onChange={e => set('linkVerificationNotes', e.target.value)}
              placeholder="e.g. redirects to login, 404 on PDF, moved to new URL…" rows={2}
              className={cn(inp, "resize-y min-h-[36px]")} />
          </div>

          {/* Cross-listing — one canonical record, shown in other sections too */}
          <div>
            <label className={lbl}>Also show in sections</label>
            <div className="flex flex-wrap gap-1.5">
              {SECTION_OPTIONS.filter(s => s !== form.section).map(s => {
                const active = (form.crossListedIn ?? []).includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      const current = form.crossListedIn ?? [];
                      const next = active ? current.filter(x => x !== s) : [...current, s];
                      set('crossListedIn', next.length > 0 ? next : undefined);
                    }}
                    className={cn(
                      "text-[11px] px-2 py-0.5 rounded border transition-colors",
                      active ? "bg-[#0F172A] text-white border-[#0F172A]" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                    )}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Checkboxes */}
          <div className="flex items-center gap-5 flex-wrap">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input type="checkbox" checked={form.regionalVariation}
                onChange={e => set('regionalVariation', e.target.checked)}
                className="w-3.5 h-3.5 rounded border-slate-300 accent-slate-700" />
              <span className="text-[12px] text-slate-600">Regional variation applies</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input type="checkbox" checked={form.localOverlayNeeded}
                onChange={e => set('localOverlayNeeded', e.target.checked)}
                className="w-3.5 h-3.5 rounded border-slate-300 accent-slate-700" />
              <span className="text-[12px] text-slate-600">Local overlay needed</span>
            </label>
          </div>

          {/* Version Links */}
          <div>
            <div className="text-[11px] font-semibold text-slate-600 mb-1.5">Version Links</div>
            {form.versions.length > 0 && (
              <div className="flex flex-col gap-1.5 mb-1.5">
                {form.versions.map((v, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <input type="text" value={v.label}
                      onChange={e => setVersion(idx, 'label', e.target.value)}
                      placeholder="Label"
                      className="flex-1 px-2 py-1 border border-slate-200 rounded text-[12px] bg-white focus:outline-none focus:ring-1 focus:ring-slate-300 min-w-0" />
                    <input type="text" value={v.url}
                      onChange={e => setVersion(idx, 'url', e.target.value)}
                      placeholder="URL"
                      className="flex-[2] px-2 py-1 border border-slate-200 rounded text-[12px] bg-white focus:outline-none focus:ring-1 focus:ring-slate-300 min-w-0" />
                    <input type="text" value={v.date ?? ''}
                      onChange={e => setVersion(idx, 'date', e.target.value)}
                      placeholder="Date"
                      className="w-[76px] shrink-0 px-2 py-1 border border-slate-200 rounded text-[12px] bg-white focus:outline-none focus:ring-1 focus:ring-slate-300" />
                    <button onClick={() => removeVersion(idx)}
                      className="text-slate-400 hover:text-slate-600 transition-colors shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button onClick={addVersion}
              className="text-[12px] text-slate-500 hover:text-slate-700 font-medium transition-colors">
              + Add version
            </button>
          </div>
        </div>

        {/* Footer */}
        {!WRITES_ENABLED && (
          <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 text-[11px] text-amber-800 shrink-0">
            Read-only mode — publication is disabled. This form is for review and prefill only; nothing typed here can be saved.
          </div>
        )}
        <div className="flex justify-between items-center gap-2 px-4 py-2.5 border-t border-slate-200 shrink-0">
          <div>
            {/* Delete is a write action too — same WRITES_ENABLED gate as Save.
                The actual write boundary is in handleDelete/persistGuideline
                (App.tsx); hiding it here is the UI-convenience layer only. */}
            {WRITES_ENABLED && !isNew && (
              <button
                onClick={() => {
                  if (window.confirm(`Delete "${form.topic}"? This permanently removes it from the catalogue and cannot be undone.`)) {
                    onDelete(form.id);
                    onClose();
                  }
                }}
                className="px-3 py-1.5 border border-red-200 text-red-600 rounded text-[12px] font-medium hover:bg-red-50 transition-colors"
              >
                Delete
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {WRITES_ENABLED ? (
              <button onClick={() => onSave(form)}
                className="bg-[#0F172A] text-white py-1.5 px-4 rounded text-[12px] font-medium hover:bg-slate-800 transition-colors">
                Save Guideline
              </button>
            ) : (
              <button
                disabled
                title="Read-only mode — publication is disabled"
                className="bg-slate-200 text-slate-400 py-1.5 px-4 rounded text-[12px] font-medium cursor-not-allowed"
              >
                Save Guideline
              </button>
            )}
            <button onClick={onClose}
              className="px-4 py-1.5 border border-slate-200 rounded text-[12px] text-slate-600 hover:bg-slate-50 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Duplicates Panel ─────────────────────────────────────────────────────────
// Review-only surface: heuristic matches, opened per pair for editorial
// judgement. Three actions per pair — merge into the chosen canonical
// record, keep both (dismiss), or delete the redundant one outright.
// Nothing here runs automatically or in bulk.

function DuplicatesPanel({
  candidates, onOpen, onDismiss, onMerge, onDeleteOne,
}: {
  candidates: DuplicateCandidate[];
  onOpen: (g: Guideline) => void;
  onDismiss: (a: Guideline, b: Guideline) => void;
  onMerge: (canonical: Guideline, duplicate: Guideline) => void;
  onDeleteOne: (g: Guideline) => void;
}) {
  if (candidates.length === 0) {
    return <p className="text-[12px] text-slate-400 mt-3">No likely duplicates detected.</p>;
  }

  return (
    <div className="flex flex-col gap-2.5 mt-3">
      {candidates.map(c => (
        <DuplicatePairCard
          key={`${c.a.id}::${c.b.id}`}
          candidate={c}
          onOpen={onOpen}
          onDismiss={onDismiss}
          onMerge={onMerge}
          onDeleteOne={onDeleteOne}
        />
      ))}
    </div>
  );
}

function DuplicatePairCard({
  candidate, onOpen, onDismiss, onMerge, onDeleteOne,
}: {
  candidate: DuplicateCandidate;
  onOpen: (g: Guideline) => void;
  onDismiss: (a: Guideline, b: Guideline) => void;
  onMerge: (canonical: Guideline, duplicate: Guideline) => void;
  onDeleteOne: (g: Guideline) => void;
}) {
  const { a, b, reasons } = candidate;
  const [canonicalId, setCanonicalId] = useState(a.id);
  const canonical = canonicalId === a.id ? a : b;
  const duplicate = canonicalId === a.id ? b : a;

  const preview = useMemo(() => computeMerge(canonical, duplicate), [canonical, duplicate]);
  const newVersionCount = preview.versions.length - canonical.versions.length;
  const newSections = (preview.crossListedIn ?? []).filter(
    s => s !== canonical.section && !(canonical.crossListedIn ?? []).includes(s)
  );

  const handleMerge = () => {
    const lines = [
      `Merge "${duplicate.topic}" into "${canonical.topic}"?`,
      newVersionCount > 0 ? `${newVersionCount} new link(s) will be added.` : 'No new links to add.',
      newSections.length > 0 ? `Will also appear in: ${newSections.join(', ')}.` : null,
      `"${duplicate.topic}" will then be permanently deleted.`,
    ].filter(Boolean);
    if (window.confirm(lines.join('\n'))) {
      onMerge(canonical, duplicate);
    }
  };

  const handleDeleteDuplicate = () => {
    if (window.confirm(`Delete "${duplicate.topic}" without merging? This permanently removes it and cannot be undone.`)) {
      onDeleteOne(duplicate);
    }
  };

  return (
    <div className="border border-slate-200 rounded-md bg-white p-3">
      <div className="flex justify-between items-start gap-2 mb-2 flex-wrap">
        <div className="flex flex-wrap gap-1">
          {reasons.map(r => (
            <span key={r} className="text-[10px] px-1.5 py-px rounded border border-amber-200 bg-amber-50 text-amber-700">
              {r}
            </span>
          ))}
        </div>
        {WRITES_ENABLED && (
          <button
            onClick={() => onDismiss(a, b)}
            className="text-[10px] text-slate-400 hover:text-slate-600 shrink-0 underline underline-offset-2"
          >
            Keep both — dismiss
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
        {[a, b].map(g => {
          const isCanonical = g.id === canonicalId;
          return (
            <div key={g.id} className={cn(
              "border rounded px-2 py-1.5 flex flex-col gap-0.5",
              isCanonical ? "border-slate-300 bg-slate-50" : "border-slate-100"
            )}>
              <div className="flex justify-between items-center gap-1">
                <span className="text-[12px] font-medium text-slate-800">{g.topic}</span>
                {isCanonical && (
                  <span className="text-[9px] px-1 py-px rounded bg-slate-700 text-white shrink-0">canonical</span>
                )}
              </div>
              <span className="text-[10px] text-slate-400">
                {g.section} · {g.source} · {g.status}{g.archived ? ' · archived' : ''} · {g.versions.length} link{g.versions.length === 1 ? '' : 's'}
              </span>
              {WRITES_ENABLED && (
                <div className="flex items-center gap-2 mt-1">
                  <button
                    onClick={() => onOpen(g)}
                    className="text-[10px] text-slate-500 hover:text-slate-700 underline underline-offset-2"
                  >
                    Open
                  </button>
                  {!isCanonical && (
                    <button
                      onClick={() => setCanonicalId(g.id)}
                      className="text-[10px] text-slate-500 hover:text-slate-700 underline underline-offset-2"
                    >
                      Use as canonical
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {WRITES_ENABLED && (
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100 flex-wrap">
          <button
            onClick={handleMerge}
            className="px-2.5 py-1 bg-[#0F172A] text-white rounded text-[11px] font-medium hover:bg-slate-800 transition-colors"
          >
            Merge into "{canonical.topic}"
          </button>
          <button
            onClick={handleDeleteDuplicate}
            className="px-2.5 py-1 border border-red-200 text-red-600 rounded text-[11px] font-medium hover:bg-red-50 transition-colors"
          >
            Delete "{duplicate.topic}" without merging
          </button>
          <span className="text-[10px] text-slate-400 ml-auto">
            {newVersionCount > 0 ? `+${newVersionCount} link${newVersionCount === 1 ? '' : 's'}` : 'no new links'}
            {newSections.length > 0 ? ` · adds ${newSections.join(', ')}` : ''}
          </span>
        </div>
      )}
    </div>
  );
}
