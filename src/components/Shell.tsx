'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import type { TaskSummary } from '@/lib/tasks';

/**
 * App frame: collapsible task sidebar plus a top bar. The sidebar doubles as
 * the progress and invoicing view (spec 5, 8.4).
 */
export default function Shell({
  tasks,
  title,
  actions,
  children,
}: {
  tasks: TaskSummary[];
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="shell">
      <aside className={collapsed ? 'sidebar collapsed' : 'sidebar'}>
        <div className="sidebar-head">
          <p className="sidebar-title">to-word</p>
          <p className="sidebar-sub">$10 per completed file</p>
          <div className="row">
            <Link href="/" className="small">
              Tasks
            </Link>
            <span className="muted">·</span>
            <Link href="/settings/glossary" className="small">
              Glossary
            </Link>
            <span className="muted">·</span>
            <Link href="/settings/password" className="small">
              Password
            </Link>
            <span className="spacer" />
            <button className="ghost small" onClick={logout} title="Sign out">
              Sign out
            </button>
          </div>
        </div>

        <ul className="task-list">
          {tasks.length === 0 && (
            <li className="task-item">
              <span className="small muted" style={{ padding: '0.5rem 0.6rem', display: 'block' }}>
                No tasks yet.
              </span>
            </li>
          )}
          {tasks.map((task) => {
            const active = pathname.startsWith(`/tasks/${task.id}`);
            const percent = Math.round(task.progress * 100);
            return (
              <li key={task.id} className="task-item">
                <Link href={`/tasks/${task.id}`} className={active ? 'active' : undefined}>
                  <span className="task-name">{task.name}</span>
                  <span className="task-meta">
                    <span className={`status ${task.status}`}>{task.status}</span>
                    {task.total > 0 && (
                      <>
                        <span className="bar">
                          <span style={{ width: `${percent}%` }} />
                        </span>
                        <span>{percent}%</span>
                      </>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </aside>

      <div className="main">
        <header className="topbar">
          <button
            className="ghost small"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Show task list' : 'Hide task list'}
            title={collapsed ? 'Show task list' : 'Hide task list'}
          >
            ☰
          </button>
          <h1>{title}</h1>
          <span className="spacer" />
          {actions}
        </header>
        {children}
      </div>
    </div>
  );
}
