import { useEffect, useRef } from 'react';
import { SignInForm } from './account-panel';
import type { useSyncedProgress } from './use-synced-progress';

type Account = ReturnType<typeof useSyncedProgress>;

/**
 * After the first lesson, the app stays locked until the learner creates an account or logs in.
 * It opens as a modal dialog, so the rest of the page can't be used, and Escape can't close it.
 */
export function SignInGate({ account, online }: { account: Account; online: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    // Browsers let Escape close a dialog anyway when the page hasn't been touched, so reopen it.
    const reopen = () => { if (!element.open) element.showModal(); };
    element.addEventListener('close', reopen);
    reopen();
    return () => {
      element.removeEventListener('close', reopen);
      element.close();
    };
  }, []);

  return (
    <dialog ref={dialog} className="sign-in-gate" aria-labelledby="sign-in-gate-title" onCancel={(event) => event.preventDefault()}>
      <header>
        <span className="label">LESSON 1 COMPLETE</span>
        <h2 id="sign-in-gate-title">Save your progress to keep going</h2>
        <p>Create a free account, or log in, to continue with Day 2. Your progress is kept safe and follows you to your other phones and computers.</p>
      </header>
      <SignInForm account={account} online={online} className="sign-in-gate-form" keepProgress />
    </dialog>
  );
}
