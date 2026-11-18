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
      this.emitFile({type:'asset', fileName:'reader-module-manifest.json', source:JSON.stringify({modules, forbidden},null,2)});
    },
  };
}
