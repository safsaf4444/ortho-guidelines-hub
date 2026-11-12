import fs from 'node:fs';import assert from 'node:assert/strict';
import {GUIDELINES_DATA as data} from '../../src/data/guidelines-data';
import {applySearchToCatalogue} from '../../src/lib/search/app-adapter';
import {filterGuidelinesOutcome} from '../../src/lib/guideline-filter';
import {uniqueRankedResults,associatedSections,primarySourceShortcut,sortSections,SECTION_ORDER,linkCheckContext} from '../../src/lib/public-presentation';
const queries=['search-benchmark','search-heldout'].flatMap(name=>JSON.parse(fs.readFileSync(`scripts/tests/fixtures/${name}.json`,'utf8')).queries.map((q:{id:string;query:string})=>({...q,fixture:name})));
const results=queries.map(q=>{const ranked=applySearchToCatalogue(data,q.query).ordered;const visible=uniqueRankedResults(ranked);assert.deepEqual(visible,ranked);assert.equal(new Set(visible.map(x=>x.id)).size,visible.length);return {...q,ids:visible.map(x=>x.id)};});
assert.equal(results.length,80);assert.equal(data.length,231);
const hip=applySearchToCatalogue(data,'hip fracture').ordered;assert.deepEqual(uniqueRankedResults([...hip,...hip]),hip);
for(const status of ['All','verified','broken','unchecked']){const x=filterGuidelinesOutcome(data,{query:'hip fracture',section:'All',linkStatus:status}).ordered;assert.deepEqual(uniqueRankedResults(x),x);}
for(const g of data){assert.deepEqual(new Set(associatedSections(g)),new Set([g.section,...(g.crossListedIn??[])]));assert.match(linkCheckContext(g),/Not a clinical review/);}
const sections=[...new Set(data.flatMap(g=>[g.section,...(g.crossListedIn??[])]))];assert(sections.every(s=>SECTION_ORDER.includes(s)));assert.deepEqual(sortSections(sections),sortSections([...sections].reverse()));assert(!SECTION_ORDER.includes('Infection / Tumour'));
for(const status of ['broken','withdrawn','superseded'] as const)assert.equal(primarySourceShortcut({...data[0],linkVerificationStatus:status}),undefined);
for(const url of ['#','','javascript:alert(1)','data:text/html,test'])assert.equal(primarySourceShortcut({...data[0],versions:[{url,label:'test'}]}),undefined);
assert.equal(primarySourceShortcut({...data[0],versions:[{url:'https://example.test/source',label:'test'}],linkVerificationStatus:'blocked'}),'https://example.test/source');
fs.mkdirSync('reports/ux-model',{recursive:true});fs.writeFileSync('reports/ux-model/expected.json',JSON.stringify({queries:results},null,2));
console.log('PASS 64 benchmark and 16 held-out presentation orders; unique IDs; filters; associations; deterministic sections; safe source shortcuts.');console.log('hip fracture: '+hip.length+' unique results; category placements '+hip.reduce((n,g)=>n+1+(g.crossListedIn?.length??0),0));

console.log(results.length + ' passed, 0 failed');
