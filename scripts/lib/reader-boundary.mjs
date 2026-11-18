/** Fail closed on compiled module identities, rather than trusting hidden controls. */
export function forbiddenReaderModules(ids) {
  return [...ids].map(id => id.replaceAll('\\', '/')).filter(id =>
    /(?:@supabase|\/src\/lib\/(?:supabase|editor-|staged-|changelog-|guidelines-service)|\/src\/components\/(?:Editor|ReviewDashboard|PublicationReceipts|GovernanceReviewInbox))/.test(id));
}
export function readerBoundary() {
  return {
    name: 'require-reader-only-imports',
    generateBundle() {
      const modules = [...this.getModuleIds()].sort();
      const forbidden = forbiddenReaderModules(modules);
      if (forbidden.length) this.error('READER ISOLATION BLOCKED: ' + forbidden.join('\n'));
      const safeModules = modules.map(id => { const normalized=id.replaceAll('\\','/'); const local=normalized.indexOf('/src/')>=0 ? normalized.slice(normalized.indexOf('/src/')+1) : normalized.indexOf('/reader/')>=0 ? normalized.slice(normalized.indexOf('/reader/')+1) : normalized.indexOf('/node_modules/')>=0 ? normalized.slice(normalized.indexOf('/node_modules/')+1) : normalized; return local; });
      this.emitFile({type:'asset', fileName:'reader-module-manifest.json', source:JSON.stringify({modules:safeModules, forbidden},null,2)});
    },
  };
}
