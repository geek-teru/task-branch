import type { AssigneeOption } from "../lib/types";
import { Avatar } from "./Avatar";
import { ProviderIcon } from "./Icons";

// The assignee's icon: a user's picture, or an agent's provider icon as on /settings/agents.
export function AssigneeIcon({ assignee }: { assignee: AssigneeOption }) {
  if (assignee.agent) return <ProviderIcon provider={assignee.agent.provider} size={20} />;
  return <Avatar url={assignee.avatarUrl} name={assignee.name} className="size-5 text-[10px]" />;
}

// The assignee's icon and name, as shown in the form's select and the detail panel.
// null = 未割り当て.
export function AssigneeLabel({ assignee }: { assignee: AssigneeOption | null }) {
  if (!assignee) return <span className="text-fg-muted">未割り当て</span>;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <AssigneeIcon assignee={assignee} />
      <span className="truncate">{assignee.name}</span>
    </span>
  );
}

// Select value for 未割り当て (Select needs a string).
export const UNASSIGNED = "";

// Options for a Select of assignees: 未割り当て first, then the candidates. current is the task's
// assignee, kept as an option when it is no longer a candidate (e.g. a disconnected agent).
export function assigneeSelectOptions(candidates: AssigneeOption[], current: AssigneeOption | null) {
  const extra = current && !candidates.some((a) => a.id === current.id) ? [current] : [];
  return [
    { value: UNASSIGNED, label: <AssigneeLabel assignee={null} /> },
    ...[...candidates, ...extra].map((a) => ({ value: a.id, label: <AssigneeLabel assignee={a} /> })),
  ];
}
