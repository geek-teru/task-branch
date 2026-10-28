import type { ReactNode } from "react";
import { ServiceIcon } from "./Icons";
import { Card } from "./ui/Card";

// Frame shared by the login and OAuth consent pages: a centered card under the service icon and name.
export function AuthCard({ error, children }: { error?: string | null; children: ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center bg-bg">
      <Card className="w-[400px] max-w-[calc(100%-32px)] px-8 py-8">
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
