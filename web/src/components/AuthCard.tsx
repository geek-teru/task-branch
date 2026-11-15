import type { ReactNode } from "react";
import { ServiceIcon } from "./Icons";
import { Card } from "./ui/Card";

// Frame shared by the login and OAuth consent pages: a centered card under the service icon and name.
// On phones the card fills the width with 16px on each side and tighter padding inside.
export function AuthCard({ error, children }: { error?: string | null; children: ReactNode }) {
  return (
    <main className="flex min-w-0 flex-1 items-center justify-center bg-bg px-4">
      <Card className="w-full max-w-[400px] px-5 py-6 md:px-8 md:py-8">
        <div className="mb-6 flex flex-col items-center gap-3">
          <ServiceIcon size={40} />
          <h1 className="m-0 text-2xl font-medium text-fg">task-branch</h1>
        </div>
        {children}
        {error && <div className="mt-3 text-[13px] text-danger">{error}</div>}
      </Card>
    </main>
  );
}
