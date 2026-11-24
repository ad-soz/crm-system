import { PriorityBadge, StatusBadge } from '@/lib/display';
import { TaskActions } from '@/components/tasks/TaskActions';
import { formatDate } from '@/lib/utils';
import type { Task } from '@/types';

/** One task in a short list (on a person or a deal). Shows the Contact it came from, if any. */
export function TaskListItem({ task }: { task: Task }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <div>
        <p className="text-sm font-medium">{task.title}</p>
        <p className="text-xs text-muted-foreground">
          Due {formatDate(task.dueDate)}
          {task.contact && ` · From: ${task.contact.subject}`}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <PriorityBadge priority={task.priority} />
        <StatusBadge status={task.status} />
        <TaskActions task={task} />
      </div>
    </li>
  );
}
