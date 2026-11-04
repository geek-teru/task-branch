import type { AssigneeOption } from "../lib/types";
import { Avatar } from "./Avatar";

// The assignee's icon and name, as shown in the form's select and the detail panel.
// null = 未割り当て.
export function AssigneeLabel({ assignee }: { assignee: AssigneeOption | null }) {
  if (!assignee) return <span className="text-fg-muted">未割り当て</span>;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Avatar url={assignee.avatarUrl} name={assignee.name} className="size-5 text-[10px]" />
      <span className="truncate">{assignee.name}</span>
    </span>
  );
}

// Select value for 未割り当て (Select needs a string).
export const UNASSIGNED = "";

// Options for a Select of assignees: 未割り当て first, then the candidates.
export function assigneeSelectOptions(assignees: AssigneeOption[]) {
  return [
    { value: UNASSIGNED, label: <AssigneeLabel assignee={null} /> },
    ...assignees.map((a) => ({ value: a.id, label: <AssigneeLabel assignee={a} /> })),
  ];
}
