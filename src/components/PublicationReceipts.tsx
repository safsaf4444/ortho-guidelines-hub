import {useEffect,useId,useMemo,useRef,useState} from 'react';
import type {Guideline} from '../data/guidelines-data';
import {editorReceipts} from '../lib/editor-receipts';
import {publicationPayloadKey,receiptSelection,type ReceiptLoad,type ReceiptSelection} from '../lib/editor-receipts-model';
export default function PublicationReceipts({candidateId,guideline,enabled,onChange}:{candidateId:string;guideline:Guideline;enabled:boolean;onChange:(selection:ReceiptSelection)=>void}){
 const key=publicationPayloadKey(guideline),current=useRef(key);current.current=key;
 const uid=useId(),[load,setLoad]=useState<{key:string;value:ReceiptLoad}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[reload,setReload]=useState(0);
 const [chosen,setChosen]=useState({key:'',clinical:'',verification:''}),[statusKey,setStatusKey]=useState(''),[attestedKey,setAttestedKey]=useState(''),[note,setNote]=useState('');
 // K1: the fieldset disables itself while recording, which would drop focus to <body>. Focus is parked
 // on the (non-control, still focusable) live status line, then moved to the outcome: the newly
 // selected receipt on success, the review note on failure. Only if focus is still where we left it.
 const statusRef=useRef<HTMLParagraphElement>(null),clinicalRef=useRef<HTMLSelectElement>(null),noteRef=useRef<HTMLTextAreaElement>(null);
 const [focusAfter,setFocusAfter]=useState<'clinical'|'note'|null>(null),[announced,setAnnounced]=useState({key:'',text:''});
 useEffect(()=>{if(busy||!focusAfter)return;const target=focusAfter==='clinical'?clinicalRef.current:noteRef.current;setFocusAfter(null);
  if(target&&(document.activeElement===statusRef.current||document.activeElement===document.body))target.focus();},[busy,focusAfter]);
 const clinical=chosen.key===key?chosen.clinical:'',verification=chosen.key===key?chosen.verification:'',value=load?.key===key?load.value:null;
 const selection=useMemo(()=>receiptSelection(guideline,value,clinical,verification,statusKey===key),[guideline,value,clinical,verification,statusKey,key]);
 useEffect(()=>{onChange(selection);},[onChange,selection]);
 useEffect(()=>{let active=true;if(!enabled)return;setError('');const timer=setTimeout(()=>{editorReceipts.list(candidateId,guideline).then(value=>{if(active&&current.current===key)setLoad({key,value});}).catch(e=>{if(active)setError(String(e instanceof Error?e.message:e));});},150);return()=>{active=false;clearTimeout(timer);};},[candidateId,key,guideline,enabled,reload]);
 async function record(kind:'clinical'|'source'){
  if(!enabled||busy||attestedKey!==key||statusKey!==key||!note.trim())return;
  const requestedKey=key;statusRef.current?.focus();setBusy(true);setError('');setAnnounced({key:'',text:''});
  try{const id=kind==='clinical'?await editorReceipts.clinical(candidateId,guideline,note):await editorReceipts.source(guideline,note);
   if(current.current===requestedKey){setChosen(p=>({key,clinical:kind==='clinical'?id:(p.key===key?p.clinical:''),verification:kind==='source'?id:(p.key===key?p.verification:'')}));setReload(n=>n+1);setNote('');setAttestedKey('');
    setAnnounced({key:requestedKey,text:kind==='clinical'?'Clinical review recorded and selected for this exact proposed entry.':'Human source review recorded and selected.'});setFocusAfter(kind==='clinical'?'clinical':'note');}
  }catch(e){if(current.current===requestedKey){setError(e instanceof Error?e.message:String(e));setFocusAfter('note');}}finally{setBusy(false);}
 }
 const choose=(field:'clinical'|'verification',id:string)=>setChosen(p=>({key,clinical:p.key===key?p.clinical:'',verification:p.key===key?p.verification:'',[field]:id}));
 return <fieldset disabled={!enabled||busy} className="border border-slate-300 rounded p-3 space-y-2 text-sm" aria-label="Publication review evidence">
  <legend>Publication review evidence</legend>
  <p>Availability checks record URL access only. Human source review records withdrawal or supersession. Clinical review is your explicit assessment of this exact proposed entry. None is inferred from another.</p>
  <label className="block"><input type="checkbox" checked={statusKey===key} onChange={e=>setStatusKey(e.target.checked?key:'')} /> I explicitly reviewed the proposed publication status: {guideline.guidanceStatus}.</label>
  {!enabled?<p>Review actions are unavailable in read-only mode.</p>:!value&&!error?<p role="status">Loading matching evidence...</p>:null}
  {value?.comparisonRequired&&<p role="alert">Rejected-source comparison is required. This entry remains review-only pending an attributed reconsideration decision.</p>}
  {error&&<p role="alert">{error} Missing, expired or mismatched evidence cannot authorise publication.</p>}
  {value&&!value.availabilityPolicyConfigured&&<p>Trusted availability verification is disabled until the issuer and freshness policy are approved.</p>}
  <label className="block" htmlFor={uid+'clinical'}>Clinical review receipt</label>
  <select ref={clinicalRef} id={uid+'clinical'} value={clinical} onChange={e=>choose('clinical',e.target.value)}><option value="">Select an exact-payload clinical review</option>{value?.receipts.filter(r=>r.kind==='clinical-review').map(r=><option key={r.id} value={r.id} disabled={!r.eligible}>{r.observedAt} - {r.actor} - {r.note}{r.eligible?'':' (payload mismatch)'}</option>)}</select>
  <label className="block" htmlFor={uid+'verification'}>Availability or human source receipt</label>
  <select id={uid+'verification'} value={verification} onChange={e=>choose('verification',e.target.value)}><option value="">No source outcome receipt selected</option>{value?.receipts.filter(r=>r.kind!=='clinical-review').map(r=><option key={r.id} value={r.id} disabled={!r.eligible}>{r.kind}: {r.outcome} - {r.observedAt}{r.eligible?'':' (expired, mismatched or policy disabled)'}</option>)}</select>
  <label className="block"><input type="checkbox" checked={attestedKey===key} onChange={e=>setAttestedKey(e.target.checked?key:'')} /> I personally performed the review I am about to record.</label>
  <label className="block" htmlFor={uid+'note'}>Review evidence note</label><textarea ref={noteRef} id={uid+'note'} value={note} onChange={e=>setNote(e.target.value)} />
  <button type="button" disabled={!note.trim()||attestedKey!==key||statusKey!==key} onClick={()=>void record('clinical')}>Record clinical review of this payload</button>
  {['withdrawn','superseded'].includes(guideline.linkVerificationStatus??'')&&<button type="button" disabled={!note.trim()||attestedKey!==key||statusKey!==key} onClick={()=>void record('source')}>Record human source review</button>}
  <p role="status">{!busy&&announced.key===key?announced.text:''}</p>
  <p ref={statusRef} tabIndex={-1} role="status">{busy?'Recording review...':selection.ready?'Required evidence selected; database will revalidate at publication.':'Publication is blocked until status and required matching evidence are reviewed.'}</p>
  <p>Changing any proposed entry field invalidates the selected review and status confirmation.</p>
 </fieldset>;
}
