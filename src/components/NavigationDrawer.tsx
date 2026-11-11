import { useEffect, useRef, useState, type ReactNode, type RefObject, type Dispatch, type SetStateAction } from 'react'
import { X } from 'lucide-react'

/** Native modality makes every element outside the mobile drawer inert. */
export default function NavigationDrawer({ open, setOpen, triggerRef, children }: {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  triggerRef: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
}) {
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const desktopRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => setMobile(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!mobile) {
      if (open) {
        setOpen(false);
        desktopRef.current?.querySelector('button')?.focus();
      }
      return;
    }
    const dialog = dialogRef.current;
    const trigger = triggerRef.current;
    if (!open || !dialog) return;
    dialog.showModal();
    closeRef.current?.focus();
    return () => {
      dialog.close();
      // The trigger is hidden after crossing the desktop breakpoint.
      if (trigger?.getClientRects().length) trigger.focus();
    };
  }, [mobile, open, setOpen, triggerRef]);

  if (!mobile) {
    return <aside ref={desktopRef} id="sections-drawer" aria-label="Sections" className="w-[240px] bg-white border-r border-slate-200 flex flex-col justify-between overflow-y-auto shrink-0">{children}</aside>;
  }

  return (
    <dialog
      ref={dialogRef}
      id="sections-drawer"
      aria-label="Sections"
      aria-modal="true"
      onCancel={event => { event.preventDefault(); setOpen(false); }}
      onClose={() => setOpen(false)}
      onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}
      onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]')]
          .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus();
        }
      }}
      className="m-0 p-0 border-0 w-[240px] max-w-full h-full max-h-none bg-white text-slate-800 backdrop:bg-black/40"
    >
      <div className="min-h-full flex flex-col [&>div:last-child]:mt-auto">
        <button ref={closeRef} type="button" aria-label="Close sections menu" onClick={() => setOpen(false)} className="self-end m-2 min-h-11 min-w-11 flex items-center justify-center rounded text-slate-600">
          <X className="w-5 h-5" aria-hidden="true" />
        </button>
        {children}
      </div>
    </dialog>
  );
}
