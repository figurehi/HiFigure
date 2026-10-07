"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { preloadSam2 } from "../lib/sam2-client";
import { flushStudyLog } from "../lib/study-log";
import { useWorkspaceState, WorkspaceProvider } from "../lib/workspace-state";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <WorkspaceProvider>
      <Layout>{children}</Layout>
    </WorkspaceProvider>
  );
}

function Layout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { hydrated, state, logoutUserWorkspace } = useWorkspaceState();
  const hasStudySession = Boolean(state.studyProfile?.userId?.trim());

  useEffect(() => {
    preloadSam2();
  }, []);

  function handleStudyLogout() {
    void flushStudyLog(state);
    logoutUserWorkspace();
    router.replace("/");
  }

  return (
    <div className="app-root">
      <header className="app-topbar" translate="no">
        <Link href="/" className="app-brand">
          <img src="/hifigure-icon.png" alt="" className="app-brand-mark" />
          <span className="app-brand-word">HiFigure</span>
        </Link>
        {hydrated && hasStudySession ? (
          <div className="app-study-session">
            <button
              type="button"
              className="btn btn-secondary btn-sm app-study-logout"
              onClick={handleStudyLogout}
              title="Save progress and return to sign-in"
            >
              <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
                <path
                  d="M8.5 4.5 3 10l5.5 5.5M3.5 10H12a5 5 0 0 1 5 5v.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Log out
            </button>
          </div>
        ) : null}
      </header>

      <main className="app-main">{children}</main>
    </div>
  );
}
