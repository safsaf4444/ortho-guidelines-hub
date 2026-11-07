/** Post-browser-QA regressions. Pure synthetic/static data, no clinical writes. */
import {GUIDELINES_DATA,type Guideline} from '../../src/data/guidelines-data';
import {applySearchToCatalogue} from '../../src/lib/search/app-adapter';
import {searchGuidelines} from '../../src/lib/search/engine';
import {filterGuidelines} from '../../src/lib/guideline-filter';
let passed=0,failed=0;
function check(name:string,value:boolean){console.log((value?'PASS ':'FAIL ')+name);if(value)passed++;else failed++;}
const rows=GUIDELINES_DATA,ids=(query:string)=>applySearchToCatalogue(rows,query).ordered.map(row=>row.id);
const original=JSON.stringify(rows);
const painful=applySearchToCatalogue(rows,'painful hip replacement');
check('A: painful hip replacement does not silently collapse to an empty catalogue',painful.ordered.length>0);
check('A: clinically relevant hip PJI remains available without claiming one diagnosis',painful.ordered.some(row=>row.id==='bhs-periprosthetic-joint-infection'));
check('A: relaxed qualifier is explicitly disclosed',(painful as typeof painful&{notice?:string}).notice?.includes('painful')===true);
check('A: fallback results retain partial explanations and unmatched qualifier',painful.ordered.length>0&&[...painful.explanations.values()].every(result=>result.partial&&result.unmatched.includes('painful')));
check('A: fallback is restricted to the original hip-replacement candidate set',painful.ordered.every(row=>ids('hip replacement').includes(row.id)));
const synthetic=(id:string,topic:string,summary=''):Guideline=>({...rows[0],id,topic,summary,source:'Synthetic',section:'Synthetic',crossListedIn:[],subGroup:'',type:'Synthetic',versions:[]});
const exact=synthetic('exact','Painful hip replacement'),broad=synthetic('broad','Total hip replacement');
check('A: full matches win without mixing relaxed matches',JSON.stringify(applySearchToCatalogue([exact,broad],'painful hip replacement').ordered.map(row=>row.id))===JSON.stringify(['exact']));
check('A: full matches do not display a fallback notice',!(applySearchToCatalogue([exact,broad],'painful hip replacement') as {notice?:string}).notice);
for(const query of ['renal hip replacement','painful renal hip replacement','painless hip replacement','not painful hip replacement','cardiac catheterisation','zzzznonsenseword','!!!@@@###','MiXeD CaSe AcL']){
 check('negative/unsupported constraints remain empty: '+query,ids(query).length===0);
}
const incidental=[synthetic('arthroscopy','Arthroscopy and arthritis'),synthetic('thrombosis','Thrombosis follow-up'),synthetic('inventory','STKR7 instrument inventory')];
for(const abbreviation of ['THR','TKR','THA','TKA']){
 check('B: letters inside longer words are not abbreviation tokens: '+abbreviation,applySearchToCatalogue(incidental,abbreviation).ordered.length===0);
 const result=searchGuidelines(rows,abbreviation,{minCoverage:1,allowRelated:false})[0];
 check('B: engine top hit has a title-level prosthesis match: '+abbreviation,result?.matches.some(match=>match.field==='title')===true&&/replacement|arthroplasty/i.test(result.record.topic));
}
check('abbreviation expansion remains clinically scoped to THR/TKR targets',ids('THR').includes('nice-thr-resurfacing-ta304')&&ids('TKR').includes('nice-mini-incision-tkr-htg220'));
check('section restrictions apply before fallback',filterGuidelines(rows,{query:'painful hip replacement',section:'Foot & Ankle',linkStatus:'broken'}).length===0);
const archived={...broad,archived:true};
check('archived flags remain excluded during fallback',applySearchToCatalogue([archived],'painful hip replacement').ordered.length===0);
check('search never mutates clinical catalogue or statuses',JSON.stringify(rows)===original);
console.log(passed+' passed, '+failed+' failed');process.exitCode=failed?1:0;
