import assert from 'node:assert/strict';
import { GUIDELINES_DATA } from '../../src/data/guidelines-data';
import { filterPresentation } from '../../src/lib/reader-filters';
import { canonicalProvider } from '../../src/lib/providers';
import { associatedSections } from '../../src/lib/public-presentation';
import { filterGuidelines } from '../../src/lib/guideline-filter';
const ranked=filterGuidelines(GUIDELINES_DATA,{query:'hip fracture',section:'All',linkStatus:'All'});
let passed=0;
for(const publisher of ['All',...new Set(GUIDELINES_DATA.map(g=>canonicalProvider(g.source)))]) {
 for(const specialty of ['All',...new Set(GUIDELINES_DATA.flatMap(associatedSections))]) {
  const result=filterPresentation(ranked,publisher,specialty);
  assert.deepEqual(result,ranked.filter(g=>(publisher==='All'||canonicalProvider(g.source)===publisher)&&(specialty==='All'||associatedSections(g).includes(specialty)))); passed++;
 }
}
const cross=GUIDELINES_DATA.find(g=>g.crossListedIn?.some(s=>s!==g.section))!;
assert.ok(filterPresentation([cross],'All',cross.crossListedIn![0]).includes(cross));passed++;
assert.deepEqual(filterPresentation(ranked,'All','All'),ranked);passed++;
console.log(`${passed} passed, 0 failed`);
