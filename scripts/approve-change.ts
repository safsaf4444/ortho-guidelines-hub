/** GitHub comment handler: acknowledgement only. Database authority stays in named-editor RPCs. */
import {asIssue,parseCommentAction} from './lib/change-approval';
const token=process.env.GITHUB_TOKEN??'',repository=process.env.GITHUB_REPOSITORY??'',number=process.env.ISSUE_NUMBER??'';
const action=parseCommentAction(process.env.COMMENT_BODY);
async function request(suffix:string,init:RequestInit={}){
 const response=await fetch('https://api.github.com/repos/'+repository+'/issues/'+number+suffix,{...init,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'}});
 if(!response.ok)throw Error('GitHub request failed: '+response.status);return response.json();
}
async function main(){
 if(!action)return;
 if(!token||!/^[-A-Za-z0-9_.]+\/[-A-Za-z0-9_.]+$/.test(repository)||!/^\d+$/.test(number))throw Error('Explicit GitHub issue configuration required');
 const issue=asIssue(await request(''),'GitHub acknowledgement');if(issue.state!=='open')return;
 // Never check publisher URLs, clear hashes, stamp verification, approve clinical
 // content, publish, or close the issue. Those require attributed DB-editor actions.
 await request('/comments',{method:'POST',body:JSON.stringify({body:'Request acknowledged: '+action+'. No database, verification, clinical approval or publication change was made. A named database editor must review and act through the editorial workflow. This issue remains open.'})});
}
main().catch((error:unknown)=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
