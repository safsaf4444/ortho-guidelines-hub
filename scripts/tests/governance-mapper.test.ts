import {toDbRow} from '../../src/lib/guidelines-mapper';import {GUIDELINES_DATA,type Guideline} from '../../src/data/guidelines-data';
let passed=0,failed=0;function check(name:string,value:boolean){console.log((value?'PASS ':'FAIL ')+name);if(value)passed++;else failed++;}
for(const value of [undefined,null,'']){let refused=false;try{toDbRow({...GUIDELINES_DATA[0],guidanceStatus:value} as unknown as Guideline);}catch{refused=true;}check('mapper refuses missing clinical status '+value,refused);}
check('all existing snapshot statuses are preserved',GUIDELINES_DATA.every(g=>toDbRow(g).guidance_status===g.guidanceStatus));
console.log(passed+' passed, '+failed+' failed');process.exitCode=failed?1:0;
