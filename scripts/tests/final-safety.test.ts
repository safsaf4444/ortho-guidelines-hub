/** Independent consolidation regressions; synthetic metadata/files only. No DB or live publisher I/O. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {GUIDELINES_DATA,type Guideline} from '../../src/data/guidelines-data';
import {evaluateFreshness,datesInText,validEvidenceDate,catalogueAsOfFrom,type EvidenceRecord,type EvidenceSnapshot} from '../../src/lib/freshness';
import {recordObservation,readMonitorRecord,recordPath,type Observation} from '../lib/monitor-store';
import {diffSurfaceParses} from '../lib/index-diff';
import {declaredStatusWording} from '../lib/status-wording';
import {doiOf,boaAssetGuidOf,detectCoverageGaps,type GapInput} from '../lib/coverage-gap';
import {gateBsgScope} from '../adapters/bsg';
import {parseBofasPublicationsSurface} from '../adapters/bofas';
import {checkOwnership} from '../lib/staging-ownership';
import type {SurfaceParse,DiscoveredRecord} from '../adapters/types';

let passed=0;
const check=(name:string,condition:boolean)=>{assert.ok(condition,name);passed++;console.log('PASS '+name);};
const asOf='2026-11-05';
const row=(over:Partial<Guideline>={}):Guideline=>({...GUIDELINES_DATA[0],id:'synthetic-final-row',topic:'Synthetic fixture guidance',source:'NICE',summary:'',subGroup:'2020',versions:[{label:'Current',url:'https://documents.example.invalid/A%2FB.pdf'}],lastChecked:asOf,linkVerificationStatus:'verified',linkLastVerified:undefined,...over});
const record=(over:Partial<EvidenceRecord>={}):EvidenceRecord=>({guidelineId:'synthetic-final-row',publisher:'NICE',kind:'publisher-page',quality:'confirmed',sourceUrl:'https://www.nice.org.uk/guidance/SYNTHETIC',accessedAt:asOf,...over});
const snapshot=(records:EvidenceRecord[]):EvidenceSnapshot=>({label:'Synthetic independent fixture',generatedAt:asOf,records});
const item=(topic:string,url:string):DiscoveredRecord=>({topic,discoveredUrl:url,statedLabels:[]});
const parse=(items:DiscoveredRecord[]):SurfaceParse=>({items,excluded:[]});

for(const text of ['Not currently withdrawn','was not formally archived','no longer archived','un-archived','isn’t retired'])check('negated status remains a non-declaration: '+text,declaredStatusWording(text)===null);
check('negation does not cross a new status clause',declaredStatusWording('Not updated; withdrawn')==='withdrawn');
const a=item('Synthetic A','https://documents.example.invalid/A.pdf');
const b=item('Synthetic B','https://documents.example.invalid/B.pdf');
const invalidEmpty=diffSurfaceParses(parse([a]),parse([]),{status:200});
check('invalid empty index reports a failure without phantom removals',invalidEmpty.changes.length===0&&invalidEmpty.alerts.some(alert=>alert.level==='alert'));
const firstFailure=diffSurfaceParses(null,parse([a]),{status:503});
check('a failed first observation never claims an initial baseline',!firstFailure.unchanged&&!firstFailure.alerts.some(alert=>alert.code==='initial-baseline'));
check('304 without representation cannot invent removals',diffSurfaceParses(parse([a]),parse([]),{status:304,revalidated:false}).changes.length===0);
check('case-sensitive document URLs remain visible',diffSurfaceParses(parse([a]),parse([item(a.topic,a.discoveredUrl.replace('/A.pdf','/a.pdf'))])).changes.length>0);
check('same-URL retitles are observable',diffSurfaceParses(parse([a]),parse([{...a,topic:'Changed synthetic title'}])).changes.some(change=>change.kind==='title-changed'));
check('an explicitly empty-capable surface can still report real removal',diffSurfaceParses(parse([a]),parse([]),{expectItems:false}).changes.some(change=>change.kind==='removed'));

const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'ortho-final-safety-'));
try {
  const store=path.join(temporary,'store');
  const observation=(over:Partial<Observation>={}):Observation=>({provider:'BOFAS',surfaceUrl:'https://index.example.invalid',status:200,html:'synthetic index A',parse:parse([a]),observedAt:asOf+'T00:00:00Z',...over});
  const first=recordObservation(store,observation());
  fs.mkdirSync(path.join(temporary,'.discovery-cache'));
  fs.writeFileSync(path.join(temporary,'.discovery-cache','synthetic.json'),JSON.stringify({html:'synthetic index B'}));
  check('discovery-cache writes cannot replace the monitoring baseline',readMonitorRecord(store,'BOFAS').baseline?.bodySha256===first.record.baseline?.bodySha256);
  const next=recordObservation(store,observation({html:'synthetic index A+B',parse:parse([a,b]),observedAt:asOf+'T01:00:00Z'}));
  check('next observation retains the earlier comparison point',next.previousBaseline?.bodySha256===first.record.baseline?.bodySha256);
  check('change during cache overwrite is reported',diffSurfaceParses(next.previousBaseline!.parse,next.record.baseline!.parse).changes.some(change=>change.kind==='added'&&change.url===b.discoveredUrl));
  const file=recordPath(store,'BOFAS'),bytes=fs.readFileSync(file,'utf8'),tampered=JSON.parse(bytes);
  tampered.baseline.html='unrecorded mutation';fs.writeFileSync(file,JSON.stringify(tampered));
  let rejected=false;try{readMonitorRecord(store,'BOFAS');}catch{rejected=true;}
  check('baseline content/hash disagreement is rejected',rejected);
  fs.writeFileSync(file,JSON.stringify({provider:'BOFAS',baseline:false,attempts:[]}));
  let invalidShape=false;try{readMonitorRecord(store,'BOFAS');}catch{invalidShape=true;}
  check('a false scalar cannot masquerade as an absent baseline',invalidShape);
  fs.writeFileSync(file,'{corrupt synthetic record');
  let prevented=false;try{recordObservation(store,observation());}catch{prevented=true;}
  check('a corrupt baseline cannot silently become a fresh first run',prevented&&fs.readFileSync(file,'utf8')==='{corrupt synthetic record');
  const html=path.join(temporary,'index.html');fs.writeFileSync(html,'<h2>BOFAS Position Statements</h2><p><a href="/A.pdf">Synthetic A</a></p>');
  const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>['PATH','SYSTEMROOT','WINDIR','COMSPEC','PATHEXT','TEMP','TMP','HOME','USERPROFILE','LOCALAPPDATA','APPDATA'].includes(name.toUpperCase())));
  const cli=spawnSync(process.execPath,[path.resolve('node_modules/tsx/dist/cli.mjs'),path.resolve('scripts/monitor-providers.ts'),'--observe','BOFAS='+html,'--baseline-dir',store],{cwd:temporary,env:{...env,NODE_OPTIONS:'--require '+JSON.stringify(path.resolve('scripts/lib/release-network.cjs'))},encoding:'utf8',timeout:10000,windowsHide:true});
  check('offline monitoring CLI fails before overwriting corrupt history',cli.status===2&&fs.readFileSync(file,'utf8')==='{corrupt synthetic record');
} finally {
  assert.equal(path.dirname(path.resolve(temporary)),path.resolve(os.tmpdir()));assert.ok(path.basename(temporary).startsWith('ortho-final-safety-'));
  fs.rmSync(temporary,{recursive:true,force:true});
}

const doi='10.1234/synthetic-test';
check('reserved DOI punctuation does not collapse distinct identifiers',doiOf('https://doi.org/10.1234/synthetic(1)')==='10.1234/synthetic(1)'&&doiOf('https://doi.org/10.1234/synthetic(1)')!==doiOf('https://doi.org/10.1234/synthetic(1'));
for(const url of ['https://attacker.invalid/'+doi,'https://doi.org.attacker.invalid/'+doi,'https://publisher.example.invalid/?doi='+doi,'https://doi.org@attacker.invalid/'+doi])check('untrusted DOI text cannot establish identity',doiOf(url)===null);
const realBoa=GUIDELINES_DATA.flatMap(g=>g.versions.map(v=>v.url)).find(url=>boaAssetGuidOf(url));
check('BOA GUID evidence comes from an existing catalogue URL',!!realBoa);
check('BOA lookalike host is not authoritative',boaAssetGuidOf(realBoa!.replace(/https?:\/\/[^/]+/,'https://boa.ac.uk.attacker.invalid'))===null);
const held=row({source:'BOA',versions:[{label:'Source',url:'https://link.springer.com/article/'+doi}]});
const input=(records:DiscoveredRecord[],guidelines:Guideline[]=[held]):GapInput=>({provider:'fixture',providerName:'Synthetic provider',catalogueProvider:'BOA',surfaceUrl:'https://index.example.invalid',parse:parse(records),guidelines,discoveredAt:asOf,snapshotLabel:'Synthetic catalogue'});
check('spoofed DOI cannot become represented',detectCoverageGaps(input([item(held.topic,'https://attacker.invalid/'+doi)])).findings[0].class!=='ALREADY_REPRESENTED');
check('multi-owner DOI remains ambiguous',detectCoverageGaps(input([item(held.topic,'https://doi.org/'+doi)],[held,{...held,id:'synthetic-second-owner'}])).findings[0].class==='AMBIGUOUS_REVIEW');
const encodedHeld=row({versions:[{label:'Source',url:'https://documents.example.invalid/Guidance/A'}]});
check('coverage tool uses the genuine v4 unreserved identity rule',detectCoverageGaps(input([item(encodedHeld.topic,'https://documents.example.invalid/Guidance/%41')],[encodedHeld])).findings[0].class==='ALREADY_REPRESENTED');
check('case-only coverage match remains a comparison',detectCoverageGaps(input([item(encodedHeld.topic,'https://documents.example.invalid/Guidance/a')],[encodedHeld])).findings[0].class==='POSSIBLE_SAME_DOCUMENT');
check('BSG unknown section drift reaches review',gateBsgScope({topic:'Synthetic orthopaedic guideline',discoveredUrl:a.discoveredUrl,sectionHeading:'Renamed publisher section'})===null);
check('BSG excluded scope remains excluded',gateBsgScope({topic:'Gastrointestinal stromal tumour guideline',discoveredUrl:a.discoveredUrl})!==null);
check('BSG and BOFAS discovery cannot claim staging ownership',!checkOwnership('BSG','discover').ok&&!checkOwnership('BOFAS','discover').ok);
const headless=parseBofasPublicationsSurface('<a href="/A.pdf">Synthetic A</a>','https://www.bofas.org.uk/');
check('headless BOFAS pages are visibly excluded',headless.items.length===0&&headless.excluded.length===1);

check('ISO catalogue dates retain month/day precision',datesInText('Version 2026-07-29').includes('2026-07-29'));
check('impossible ISO date is not downgraded to a valid year',datesInText('2026-02-30').length===0);
check('valid leap day and invalid non-leap day are distinguished',validEvidenceDate('2024-02-29')&&!validEvidenceDate('2025-02-29'));
for(const verified of [undefined,'2026-02-30','2026-12-01'])check('missing, invalid or future link-check dates cannot borrow lastChecked',evaluateFreshness([row({linkLastVerified:verified})],null,{asOf}).signals.some(signal=>signal.signal==='no-recent-verification'));
const staleProvider=evaluateFreshness([row()],snapshot([record({scope:'provider',stale:true})]),{asOf});
check('stale provider notices are never confirmed evidence',staleProvider.signals.find(signal=>signal.signal==='provider-notice')?.quality==='unverified');
const invalidEvidence=evaluateFreshness([row()],snapshot([record({lastUpdated:'2026-99-99'})]),{asOf});
check('malformed evidence dates are quarantined',invalidEvidence.signals.some(signal=>signal.signal==='stale-evidence-only')&&!invalidEvidence.signals.some(signal=>signal.signal==='publisher-confirms-current'));
check('future observations cannot confirm an earlier evaluation',evaluateFreshness([row()],snapshot([record({accessedAt:'2026-12-01',lastUpdated:'2020'})]),{asOf}).signals.some(signal=>signal.signal==='stale-evidence-only'));
check('undated archival claims remain unverified',evaluateFreshness([row()],snapshot([record({kind:'archive-snapshot',archived:true})]),{asOf}).signals.some(signal=>signal.signal==='stale-evidence-only'));
const replacement=evaluateFreshness([row()],snapshot([record({replacedBy:{identifier:'synthetic-new',url:'https://documents.example.invalid/A/B.pdf'}})]),{asOf});
check('reserved slash differences cannot imply a held replacement',replacement.signals.find(signal=>signal.signal==='replacement-declared')?.suggestedAction.includes('create the replacement')===true);
const dotReplacement=evaluateFreshness([row({versions:[{label:'Current',url:'https://documents.example.invalid/b'}]})],snapshot([record({replacedBy:{identifier:'synthetic-dot',url:'https://documents.example.invalid/a/%2e%2e/b'}})]),{asOf});
check('evidence comparison does not silently resolve encoded dot segments',dotReplacement.signals.find(signal=>signal.signal==='replacement-declared')?.suggestedAction.includes('create the replacement')===true);
check('lookalike publisher host remains an external link',evaluateFreshness([row({versions:[{label:'Document',url:'https://notnice.org.uk/doc'}]})],snapshot([record()]),{asOf}).signals.some(signal=>signal.signal==='unverified-external-link'));
check('catalogue row dates cannot invent export metadata',catalogueAsOfFrom([row()])===null);
const untouched=row(),before=JSON.stringify(untouched);evaluateFreshness([untouched],snapshot([record({archived:true})]),{asOf});
check('freshness does not change clinical rows or statuses',JSON.stringify(untouched)===before);
const app=fs.readFileSync('src/App.tsx','utf8');
check('freshness fixture/view is not imported into the public application',!app.includes('FreshnessDashboard')&&!app.includes('FRESHNESS_EVIDENCE_FIXTURE'));
console.log(passed+' passed, 0 failed');
