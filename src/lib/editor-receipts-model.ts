import type {Guideline} from '../data/guidelines-data';
import {toDbRow} from './guidelines-mapper';
export type ReceiptKind='automated-link-check'|'human-source-review'|'clinical-review';
export interface PublicationReceipt {id:string;kind:ReceiptKind;outcome:string|null;observedAt:string;actor:string|null;note:string;eligible:boolean}
export interface ReceiptLoad {receipts:PublicationReceipt[];availabilityPolicyConfigured:boolean;payloadFingerprint:string;comparisonRequired?:boolean}
export interface PublicationEvidence {verificationEvidenceId?:string;clinicalReviewEvidenceId?:string}
export interface ReceiptSelection extends PublicationEvidence {payloadKey:string;ready:boolean}
export function publicationPayloadKey(g:Guideline):string {return JSON.stringify(toDbRow(g));}
export function receiptSelection(g:Guideline,load:ReceiptLoad|null,clinical:string,verification:string,statusReviewed:boolean):ReceiptSelection {
 const key=publicationPayloadKey(g),rows=load?.receipts??[];
 const c=rows.find(r=>r.id===clinical&&r.kind==='clinical-review'&&r.eligible);
 const v=rows.find(r=>r.id===verification&&r.kind!=='clinical-review'&&r.eligible&&r.outcome===(g.linkVerificationStatus??'unchecked'));
 const clinicalRequired=g.guidanceStatus==='current';
 const verificationRequired=!['unchecked','needs-review'].includes(g.linkVerificationStatus??'unchecked');
 return {payloadKey:key,ready:statusReviewed&&!!load&&!load.comparisonRequired&&(!clinicalRequired||!!c)&&(!verificationRequired||!!v)&&(!clinical||!!c)&&(!verification||!!v),...(c?{clinicalReviewEvidenceId:c.id}:{}),...(v?{verificationEvidenceId:v.id}:{})};
}
