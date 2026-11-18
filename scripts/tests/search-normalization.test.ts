/** Consistent qualifier and abbreviation normalization; no external operations. */
import {GUIDELINES_DATA as rows} from '../../src/data/guidelines-data';
import {applySearchToCatalogue} from '../../src/lib/search/app-adapter';
import * as adapter from '../../src/lib/search/app-adapter';
let pass=0,fail=0;
function check(name:string,ok:boolean){console.log((ok?'PASS ':'FAIL ')+name);if(ok)pass++;else fail++;}
const search=(q:string)=>applySearchToCatalogue(rows,q);
const ids=(q:string)=>search(q).ordered.map(g=>g.id);
const rank=(adapter as unknown as {rankSearchGroups?:(query:string)=>boolean}).rankSearchGroups;
for(const base of ['THR','THA','TKR','TKA'])for(const query of [base,base.toLowerCase(),base+'.','('+base+')',' /'+base+'/ ','\t'+base+'\n',base+',']){
 check('equivalent retrieval '+JSON.stringify(query),JSON.stringify(ids(query))===JSON.stringify(ids(base)));
 check('equivalent ranking interpretation '+JSON.stringify(query),rank?.(query)===true);
}
for(const query of ['ACL','OA','NOF','CES','MSCC','hip replacement','NICE','THR knee'])check('established grouping remains '+query,rank?.(query)===false);
for(const core of ['hip replacement','knee replacement'])for(const q of ['painful '+core,'painful, '+core,core+' painful',core.split(' ')[0]+' painful replacement','('+core+'), painful']){
 const r=search(q);check('qualifier retrieval '+q,JSON.stringify(r.ordered.map(g=>g.id))===JSON.stringify(ids('painful '+core)));
 check('qualifier disclosure '+q,Boolean(r.notice?.includes('not matched'))&&r.explanations.size>0&&[...r.explanations.values()].every(x=>x.partial&&x.unmatched.includes('painful')));
}
for(const q of ['painful renal hip replacement','renal hip replacement painful','not painful hip replacement','hip replacement not painful','painless hip replacement','painful cardiac catheterisation','zzzznonsenseword'])check('unsupported constraint retained '+q,ids(q).length===0);
console.log(pass+' passed, '+fail+' failed');process.exitCode=fail?1:0;
