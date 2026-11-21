// The not-an-administrator notice, and the guard that shows it -- the Admin
// page's own notice (PHASE_07 §7.67), shared since spec 0114 put /status
// behind it too. Presentation only: the server answers a player's request
// without what an administrator sees (docs/architecture/AUTHORIZATION.md).

import type { ReactNode } from "react";
import { useAuth } from "./AuthContext";

/** "This page is for administrators.", under the page's title. */
export function AdminOnlyNotice({ title }: { title: string }) {
  return (
    <main className="pa-main pa-admin">
      <h1 className="pa-title">{title}</h1>
      <div className="pa-notice pa-notice-warn" role="status">
        <span aria-hidden="true" className="pa-notice-mark" />
        <span className="pa-notice-text">This page is for administrators.</span>
      </div>
    </main>
  );
}

/** Its children for an administrator; the notice for anyone else signed in. */
export function RequireAdmin({ title, children }: { title: string; children: ReactNode }) {
  const { state } = useAuth();
  if (state.status !== "authenticated") return null;
  if (state.user.role !== "ADMIN") return <AdminOnlyNotice title={title} />;
  return <>{children}</>;
}
