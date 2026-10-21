/**
 * Task Inbox grouping — the shared source of truth for the employee grouping and
 * the priority grouping, so the rules live in exactly one place and the tests
 * can pin them without rendering React.
 *
 * The two dimensions are ALTERNATIVES, never one replacing the other:
 * priority grouping groups the same task set by urgency, employee grouping
 * groups it by assignee. Both operate on the SAME permission-filtered dataset,
 * so a group count can never describe rows the caller may not open.
 *
 * The unassigned bucket is a first-class group («بدون مسئول»), not a silently
 * dropped remainder, and a task whose assignee is no longer in the active roster
 * still appears under that person's name rather than disappearing.
 */

/** The synthetic group key for tasks with no assignee. */
export const UNASSIGNED_GROUP = 'UNASSIGNED';

export type TaskGroupDimension = 'NONE' | 'PRIORITY' | 'EMPLOYEE';

export interface TaskGroupOption {
  id: string;
  name: string;
}

/** A display name for a user, never a raw database id. */
export function taskAssigneeName(user: { id: string; name?: string; username?: string }): string {
  return user.name || user.username || user.id;
}

/**
 * The employees eligible to appear in the grouping control.
 *
 * Built from the real user list — never a hardcoded roster. Deactivated and
 * suspended accounts are omitted from the OPTIONS, but their tasks are not
 * erased: they are reported separately as historical assignees so the group
 * headings still carry a real name.
 */
export function eligibleTaskAssignees(
  users: { id: string; name?: string; username?: string; status?: string }[],
  canManageAll: boolean,
  currentUserId?: string
): TaskGroupOption[] {
  const active = users.filter((u) => u.status !== 'INACTIVE' && u.status !== 'SUSPENDED');
  if (!canManageAll) {
    // An ordinary employee sees only themselves, so the control cannot become
    // a staff directory.
    const me = active.find((u) => u.id === currentUserId);
    return me ? [{ id: me.id, name: taskAssigneeName(me) }] : [];
  }
  return active
    .map((u) => ({ id: u.id, name: taskAssigneeName(u) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fa'));
}

/**
 * Assignees that appear on tasks but are absent from the eligible roster —
 * deactivated or historical accounts. They are surfaced, never dropped.
 */
export function historicalTaskAssignees(
  tasks: { assignedUserId?: string; assignedUserName?: string }[],
  eligible: TaskGroupOption[]
): TaskGroupOption[] {
  const known = new Set(eligible.map((o) => o.id));
  const seen = new Map<string, string>();
  for (const t of tasks) {
    if (t.assignedUserId && !known.has(t.assignedUserId)) {
      seen.set(t.assignedUserId, t.assignedUserName || t.assignedUserId);
    }
  }
  return Array.from(seen, ([id, name]) => ({ id, name })).sort((a, b) =>
    a.name.localeCompare(b.name, 'fa')
  );
}

/**
 * Narrows a task list to one employee. The scope is applied ON TOP of the
 * caller's permission filter, never instead of it.
 */
export function applyTaskAssigneeScope<T extends { assignedUserId?: string }>(
  tasks: T[],
  assigneeId: string
): T[] {
  if (!assigneeId || assigneeId === 'ALL') return tasks;
  if (assigneeId === UNASSIGNED_GROUP) return tasks.filter((t) => !t.assignedUserId);
  return tasks.filter((t) => t.assignedUserId === assigneeId);
}

export interface TaskGroup<T> {
  key: string;
  title: string;
  tasks: T[];
}

const PRIORITY_ORDER = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'];

const PRIORITY_LABELS: Record<string, string> = {
  URGENT: 'فوری',
  HIGH: 'بالا',
  MEDIUM: 'متوسط',
  LOW: 'پایین',
};

/** Translated priority headings, supplied by the caller so the labels follow i18n. */
export type PriorityLabelMap = Record<string, string>;

/**
 * The groups for the requested dimension. `null` means "no grouping" and the
 * caller renders one flat list.
 *
 * Counts are the exact number of rows under each heading, and the groups always
 * hold the WHOLE set for that dimension — the caller must not paginate across
 * groups, because slicing a page across groups would show a count that does not
 * match the rows beneath it.
 */
export function buildTaskGroups<T extends { priority?: string; assignedUserId?: string; assignedUserName?: string }>(
  dimension: TaskGroupDimension,
  tasks: T[],
  eligible: TaskGroupOption[],
  historical: TaskGroupOption[] = [],
  priorityLabels: PriorityLabelMap = PRIORITY_LABELS
): TaskGroup<T>[] | null {
  if (dimension === 'NONE') return null;

  if (dimension === 'PRIORITY') {
    const buckets = new Map<string, T[]>();
    for (const task of tasks) {
      const key = String(task.priority || 'LOW').toUpperCase();
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(task);
    }
    const known = PRIORITY_ORDER.filter((p) => buckets.has(p));
    const rest = Array.from(buckets.keys()).filter((k) => !PRIORITY_ORDER.includes(k));
    return known.concat(rest).map((key) => ({
      key,
      title: priorityLabels[key] || key,
      tasks: buckets.get(key)!,
    }));
  }

  // EMPLOYEE: one section per assignee, plus the clearly named unassigned group.
  const buckets = new Map<string, T[]>();
  for (const task of tasks) {
    const key = task.assignedUserId || UNASSIGNED_GROUP;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(task);
  }

  const nameOf = (id: string): string => {
    if (id === UNASSIGNED_GROUP) return 'بدون مسئول';
    return (
      eligible.find((o) => o.id === id)?.name ||
      historical.find((o) => o.id === id)?.name ||
      id
    );
  };

  const ids = Array.from(buckets.keys());
  ids.sort((a, b) => {
    // Unassigned always sorts last: it is a cleanup queue, not a person.
    if (a === UNASSIGNED_GROUP) return 1;
    if (b === UNASSIGNED_GROUP) return -1;
    return nameOf(a).localeCompare(nameOf(b), 'fa');
  });

  return ids.map((key) => ({ key, title: nameOf(key), tasks: buckets.get(key)! }));
}
