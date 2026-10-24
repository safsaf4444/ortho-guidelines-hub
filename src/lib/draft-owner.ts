import { createContext } from 'react';

/**
 * Whose unsaved editor work is on screen.
 *
 * Reject reasons, decision notes, card notes and an open Edit modal are typed
 * by one account. They live only in React state, but React state outlives a
 * sign-out: without this, the next person to sign in on the same browser —
 * another editor, from this tab or another one — would find the previous
 * editor's text already filled in, and could read it or submit it under their
 * own name.
 *
 * So every draft is owned by this key and discarded the moment it changes:
 * sign-out, a different account signing in (including a switch made in another
 * tab, which never passes through "signed out" here), or a session that ends
 * because it could not be refreshed. A token refresh for the SAME account keeps
 * the key, so drafts survive it.
 *
 * Not an access control (see editor-session.ts). It only decides when unsent
 * text is thrown away.
 */
export const SIGNED_OUT_OWNER = 'signed-out';

export function draftOwnerKey(session: { signedIn: boolean; userId: string | null }): string {
  return session.signedIn && session.userId ? `user:${session.userId}` : SIGNED_OUT_OWNER;
}

/** The current draft owner, for components too deep to receive it as a prop. */
export const DraftOwnerContext = createContext<string>(SIGNED_OUT_OWNER);
