/** Local payload validation only; the database remains the publication authority. */
export function stagedPayloadProblems(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['Payload must be an object.'];
  const row=value as Record<string,unknown>, problems:string[]=[];
  const required=['id','topic','source','section'];
  for(const key of required)if(typeof row[key]!=='string'||!(row[key] as string).trim())problems.push(key+' is required.');
  if(!['current','superseded','archived','needs-review','link-unavailable','no-source-identified'].includes(String(row.guidanceStatus)))problems.push('An explicit valid guidance status is required; current is never inferred.');
  if(!['national','specialist-society','local-pruh','quick-reference','external-non-uk'].includes(String(row.sourceType)))problems.push('An explicit source type is required.');
  if(['superseded','archived','needs-review','no-source-identified'].includes(String(row.guidanceStatus))&&(typeof row.inclusionReason!=='string'||!row.inclusionReason.trim()))problems.push('This guidance status requires an inclusion reason.');
  if(!Array.isArray(row.versions)||row.versions.length===0)problems.push('At least one explicit source URL is required.');
  else for(const link of row.versions){
    try {const url=new URL(typeof link==='object'&&link!==null?(link as {url:string}).url:'');if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error();}
    catch{problems.push('Every version requires an HTTP(S) source URL without credentials.');}
  }
  if(row.linkVerificationStatus==='verified'){
    if(typeof row.linkLastVerified!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(row.linkLastVerified)||!Number.isFinite(Date.parse(row.linkLastVerified))||new Date(row.linkLastVerified).toISOString().slice(0,10)!==row.linkLastVerified)problems.push('Reachability requires a valid recorded check date.');
    if(typeof row.linkVerificationNotes!=='string'||!row.linkVerificationNotes.trim())problems.push('Reachability requires recorded check evidence; this client cannot authenticate its provenance.');
  }
  return problems;
}
