import {stagedPayloadProblems as problems} from '../../src/lib/staged-payload';
import {GUIDELINES_DATA} from '../../src/data/guidelines-data';
let pass=0,fail=0;function check(name:string,ok:boolean){console.log((ok?'PASS ':'FAIL ')+name);if(ok)pass++;else fail++;}
const good={...GUIDELINES_DATA[0]};check('explicit complete payload is accepted',problems(good).length===0);
for(const [key,value] of Object.entries({guidanceStatus:undefined,sourceType:undefined,id:' ',versions:null,topic:null,source:null,section:''}))check('missing/malformed '+key+' refused',problems({...good,[key]:value}).length>0);
for(const url of [null,'','javascript:alert(1)','https://user:secret@example.org/x','file:///etc/passwd'])check('unsafe/missing URL refused '+url,problems({...good,versions:[{url}]}).length>0);
check('empty source list refused',problems({...good,versions:[]}).length>0);
check('review status needs reason',problems({...good,guidanceStatus:'needs-review',inclusionReason:' '}).length>0);
check('unknown clinical status refused',problems({...good,guidanceStatus:'approved-by-ai'}).length>0);
check('unchecked is not upgraded',problems({...good,linkVerificationStatus:'unchecked',linkLastVerified:undefined,linkVerificationNotes:undefined}).length===0);
check('verified without date refused',problems({...good,linkLastVerified:undefined}).length>0);
check('verified without notes refused',problems({...good,linkVerificationNotes:''}).length>0);
check('invalid check date refused',problems({...good,linkLastVerified:'2026-99-99'}).length>0);
check('null payload refused',problems(null).length>0);
console.log(pass+' passed, '+fail+' failed');process.exitCode=fail?1:0;
