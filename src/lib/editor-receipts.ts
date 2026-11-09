import {supabase} from './supabase';
import type {Guideline} from '../data/guidelines-data';
import {toDbRow} from './guidelines-mapper';
import type {ReceiptLoad} from './editor-receipts-model';
async function rpc(name:string,args:Record<string,unknown>){
 if(!supabase)throw Error('Review evidence needs an authorised database editor; unavailable in static mode.');
 const {data,error}=await supabase.rpc(name,args);
 if(error)throw Error(error.code==='42501'?'A named database editor is required.':error.message+' No publication was made.');
 return data;
}
export const editorReceipts={
 async list(candidateId:string,g:Guideline):Promise<ReceiptLoad>{return await rpc('list_publication_receipts',{p_staged_id:candidateId,p_data:toDbRow(g)}) as ReceiptLoad;},
 async clinical(candidateId:string,g:Guideline,note:string):Promise<string>{return String(await rpc('record_clinical_review',{p_staged_id:candidateId,p_data:toDbRow(g),p_note:note}));},
 async source(g:Guideline,note:string):Promise<string>{return String(await rpc('record_human_source_review',{p_url:g.versions[0]?.url,p_outcome:g.linkVerificationStatus,p_note:note}));},
};
