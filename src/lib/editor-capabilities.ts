/** No audited replacement RPC exists for direct correction/maintenance writes. */
export function directWritesDisabled():boolean {return true;}
/**
 * Whether the shared edit modal may submit. Staged candidates publish through the
 * audited approve_staged_guideline RPC, the only supported write path; every other
 * use of the modal is direct maintenance and stays disabled.
 */
export function editorModalWritable(canWrite:boolean,isStagedCandidate:boolean):boolean {return canWrite&&(isStagedCandidate||!directWritesDisabled());}
