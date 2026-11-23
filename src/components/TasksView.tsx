import { useMemo, useState } from 'react';
import { Check, Circle, CalendarClock, Star, ListTodo, Sun, CalendarRange, CheckCircle2, Trash2, X, Plus } from 'lucide-react';
import type { Repeat, Task } from '@/types';

export type TaskList = 'today' | 'important' | 'planned' | 'all' | 'completed';

const LISTS: { id: TaskList; name: string; Icon: typeof Sun }[] = [
  { id: 'today', name: 'My Day', Icon: Sun },
  { id: 'important', name: 'Important', Icon: Star },
  { id: 'planned', name: 'Planned', Icon: CalendarRange },
  { id: 'all', name: 'Tasks', Icon: ListTodo },
  { id: 'completed', name: 'Completed', Icon: CheckCircle2 },
];

export const todayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function inList(t: Task, list: TaskList, today = todayKey()): boolean {
  switch (list) {
    case 'today':
      return !t.done && !!t.due && t.due <= today;
    case 'important':
      return !t.done && t.important;
    case 'planned':
      return !t.done && !!t.due;
    case 'completed':
      return t.done;
    default:
      return !t.done;
  }
}

function dueLabel(due: string, today: string): { text: string; overdue: boolean } {
  if (due === today) return { text: 'Today', overdue: false };
  const d = new Date(`${due}T00:00:00`);
  const diff = Math.round((d.getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000);
  if (diff === 1) return { text: 'Tomorrow', overdue: false };
  if (diff === -1) return { text: 'Yesterday', overdue: true };
  const text = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return { text, overdue: diff < 0 };
}

interface TasksViewProps {
  tasks: Task[];
  query: string;
  onAdd: (title: string, opts: { due: string | null; important: boolean }) => void;
  onUpdate: (task: Task) => void;
  onDelete: (id: string) => void;
}

export function TasksView({ tasks, query, onAdd, onUpdate, onDelete }: TasksViewProps) {
  const [list, setList] = useState<TaskList>('all');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const today = todayKey();

  const counts = useMemo(() => {
    const c = {} as Record<TaskList, number>;
    for (const l of LISTS) c[l.id] = tasks.filter((t) => inList(t, l.id, today)).length;
    return c;
  }, [tasks, today]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks
      .filter((t) => inList(t, list, today))
      .filter((t) => !q || t.title.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q))
      .sort((a, b) => {
        if (list === 'planned' || list === 'today') return (a.due ?? '').localeCompare(b.due ?? '');
        if (list === 'completed') return (b.completedAt ?? '').localeCompare(a.completedAt ?? '');
        return Number(b.important) - Number(a.important) || b.createdAt.localeCompare(a.createdAt);
      });
  }, [tasks, list, query, today]);

  const active = tasks.find((t) => t.id === activeId) ?? null;

  const submit = () => {
    const t = title.trim();
    if (!t) return;
    onAdd(t, { due: list === 'today' ? today : null, important: list === 'important' });
    setTitle('');
  };

  const toggleDone = (t: Task) => onUpdate({ ...t, done: !t.done, completedAt: t.done ? null : new Date().toISOString() });

  return (
    <section className="flex h-full w-full min-w-0 flex-1 bg-bg-subtle" aria-label="Tasks">
      <div className="flex w-52 shrink-0 flex-col border-r border-line bg-bg-subtle px-3 py-4">
        <nav aria-label="Task lists">
          <ul className="space-y-0.5">
            {LISTS.map(({ id, name, Icon }) => {
              const on = list === id;
              return (
                <li key={id}>
                  <button
                    onClick={() => setList(id)}
                    aria-current={on ? 'page' : undefined}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                      on ? 'bg-accent-soft font-medium text-fg' : 'text-fg-muted hover:bg-bg-muted hover:text-fg'
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${on ? 'text-accent' : ''}`} />
                    <span className="flex-1 text-left">{name}</span>
                    {counts[id] > 0 && id !== 'completed' && (
                      <span className={`rounded-full px-1.5 py-0.5 text-2xs font-semibold ${on ? 'bg-accent text-accent-fg' : 'bg-bg-muted text-fg-muted'}`}>
                        {counts[id]}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="text-base font-semibold tracking-tight text-fg">{LISTS.find((l) => l.id === list)?.name}</h2>
          <span className="text-2xs font-medium text-fg-subtle">
            {visible.length} {visible.length === 1 ? 'task' : 'tasks'}
          </span>
        </div>

        {list !== 'completed' && (
          <form
            className="px-5 pb-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="flex items-center gap-2 rounded-lg border border-line bg-bg px-3 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent">
              <Plus className="h-4 w-4 text-accent" />
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Add a task"
                aria-label="Add a task"
                className="w-full bg-transparent py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none"
              />
            </div>
          </form>
        )}

        <ul className="flex-1 overflow-y-auto px-5 pb-4 scrollbar-thin" data-testid="task-list">
          {visible.map((t) => {
            const due = t.due ? dueLabel(t.due, today) : null;
            return (
              <li key={t.id} className="mb-1">
                <div
                  className={`group flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
                    activeId === t.id ? 'border-accent bg-accent-soft/50' : 'border-line bg-bg hover:bg-bg-muted'
                  }`}
                >
                  <button
                    onClick={() => toggleDone(t)}
                    aria-label={t.done ? `Mark ${t.title} as not done` : `Mark ${t.title} as done`}
                    className="text-fg-subtle hover:text-accent"
                  >
                    {t.done ? <Check className="h-5 w-5 rounded-full bg-accent p-1 text-accent-fg" /> : <Circle className="h-5 w-5" />}
                  </button>
                  <button onClick={() => setActiveId(t.id)} className="min-w-0 flex-1 text-left">
                    <p className={`truncate text-sm ${t.done ? 'text-fg-subtle line-through' : 'text-fg'}`}>{t.title}</p>
                    {due && !t.done && (
                      <p className={`flex items-center gap-1 text-2xs ${due.overdue ? 'text-danger' : 'text-fg-subtle'}`}>
                        <CalendarClock className="h-3 w-3" />
                        {due.text}{t.repeat ? ' · repeats' : ''}
                      </p>
                    )}
                  </button>
                  <button
                    onClick={() => onUpdate({ ...t, important: !t.important })}
                    aria-label={t.important ? 'Remove importance' : 'Mark as important'}
                    aria-pressed={t.important}
                    className={t.important ? 'text-warning' : 'text-fg-subtle opacity-0 hover:text-warning group-hover:opacity-100 focus:opacity-100'}
                  >
                    <Star className={`h-4 w-4 ${t.important ? 'fill-current' : ''}`} />
                  </button>
                </div>
              </li>
            );
          })}
          {visible.length === 0 && (
            <li className="px-1 py-10 text-center text-sm text-fg-subtle">
              {query.trim()
                ? 'No tasks match your search.'
                : list === 'completed'
                  ? 'Completed tasks appear here.'
                  : 'Nothing here yet. Add a task above.'}
            </li>
          )}
        </ul>
      </div>

      {active && (
        <aside className="flex w-80 shrink-0 flex-col border-l border-line bg-bg px-4 py-4" aria-label="Task details">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-fg">Task</h3>
            <button onClick={() => setActiveId(null)} aria-label="Close details" className="text-fg-subtle hover:text-fg">
              <X className="h-4 w-4" />
            </button>
          </div>
          <label className="mb-1 text-2xs font-medium text-fg-subtle" htmlFor="task-title">Title</label>
          <input
            id="task-title"
            key={`t-${active.id}`}
            defaultValue={active.title}
            onBlur={(e) => e.target.value.trim() && e.target.value !== active.title && onUpdate({ ...active, title: e.target.value.trim() })}
            className="mb-3 rounded-lg border border-line bg-bg-subtle px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <label className="mb-1 text-2xs font-medium text-fg-subtle" htmlFor="task-due">Due date</label>
          <div className="mb-3 flex items-center gap-2">
            <input
              id="task-due"
              type="date"
              value={active.due ?? ''}
              onChange={(e) => onUpdate({ ...active, due: e.target.value || null })}
              className="flex-1 rounded-lg border border-line bg-bg-subtle px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            {active.due && (
              <button onClick={() => onUpdate({ ...active, due: null })} className="text-xs text-fg-muted hover:text-fg">
                Clear
              </button>
            )}
          </div>
          <label className="mb-1 text-2xs font-medium text-fg-subtle" htmlFor="task-repeat">Repeat</label>
          <select
            id="task-repeat"
            value={active.repeat?.freq ?? ''}
            onChange={(e) => {
              const f = e.target.value as Repeat['freq'] | '';
              onUpdate({ ...active, repeat: f ? { freq: f, interval: active.repeat?.interval ?? 1 } : undefined });
            }}
            className="mb-3 rounded-lg border border-line bg-bg-subtle px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">Does not repeat</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
          <label className="mb-1 text-2xs font-medium text-fg-subtle" htmlFor="task-notes">Notes</label>
          <textarea
            id="task-notes"
            key={`n-${active.id}`}
            defaultValue={active.notes}
            onBlur={(e) => e.target.value !== active.notes && onUpdate({ ...active, notes: e.target.value })}
            rows={6}
            className="mb-4 resize-none rounded-lg border border-line bg-bg-subtle px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            onClick={() => {
              onDelete(active.id);
              setActiveId(null);
            }}
            className="mt-auto flex items-center justify-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-danger hover:bg-danger/10"
          >
            <Trash2 className="h-4 w-4" />
            Delete task
          </button>
        </aside>
      )}
    </section>
  );
}
