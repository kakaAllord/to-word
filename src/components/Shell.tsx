'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { TaskSummary } from '@/lib/tasks';

/** Recency buckets, so a long list still reads at a glance. */
const BUCKETS = ['Today', 'Yesterday', 'Previous 7 days', 'Older'] as const;

function bucketOf(createdAt: Date | string): (typeof BUCKETS)[number] {
  const then = new Date(createdAt);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const days = Math.floor((startOfToday.getTime() - then.getTime()) / 86_400_000);
  if (days < 0) return 'Today';
  if (days === 0) return 'Yesterday';
  if (days < 7) return 'Previous 7 days';
  return 'Older';
}

/** A task only earns a second line when it is waiting on something or moving. */
function caption(task: TaskSummary): string | null {
  if (task.status === 'uploaded') return 'Queued';
  if (task.status === 'transcribing') return 'Transcribing…';
  if (task.status === 'failed') return 'Failed';
  if (task.status === 'paid') return 'Paid';
  if (task.status === 'delivered') return 'Delivered';
  if (task.total > 0) return `${Math.round(task.progress * 100)}%`;
  return null;
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="3.1" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M19.4 13.5a7.9 7.9 0 0 0 0-3l1.7-1.3-1.8-3.1-2 .8a7.8 7.8 0 0 0-2.6-1.5L14.4 3H9.6l-.3 2.4a7.8 7.8 0 0 0-2.6 1.5l-2-.8-1.8 3.1 1.7 1.3a7.9 7.9 0 0 0 0 3l-1.7 1.3 1.8 3.1 2-.8a7.8 7.8 0 0 0 2.6 1.5l.3 2.4h4.8l.3-2.4a7.8 7.8 0 0 0 2.6-1.5l2 .8 1.8-3.1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SidebarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 4.5v15" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/**
 * App frame: a quiet task rail on the left and a thin top bar. The rail carries
 * new-task, the task list and settings, so the transcript page itself stays bare.
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
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => setMenuOpen(false), [pathname]);

  useEffect(() => {
    if (window.matchMedia('(max-width: 820px)').matches) setCollapsed(true);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  const groups = BUCKETS.map((label) => ({
    label,
    tasks: tasks.filter((task) => bucketOf(task.createdAt) === label),
  })).filter((group) => group.tasks.length > 0);

  return (
    <div className="shell">
      <aside className={collapsed ? 'sidebar collapsed' : 'sidebar'}>
        <div className="sidebar-head">
          <span className="brand">to-word</span>
          <button
            className="icon-btn desktop-only"
            onClick={() => setCollapsed(true)}
            aria-label="Hide task list"
            title="Hide task list"
          >
            <SidebarIcon />
          </button>
        </div>

        <Link href="/" className="rail-new">
          <PlusIcon />
          <span>New task</span>
        </Link>

        <nav className="task-list" aria-label="Tasks">
          {tasks.length === 0 && <p className="rail-empty">No tasks yet.</p>}
          {groups.map((group) => (
            <section key={group.label} className="task-group">
              <h2 className="task-group-label">{group.label}</h2>
              {group.tasks.map((task) => {
                const active = pathname.startsWith(`/tasks/${task.id}`);
                const note = caption(task);
                const percent = Math.round(task.progress * 100);
                return (
                  <Link
                    key={task.id}
                    href={`/tasks/${task.id}`}
                    className={active ? 'task-item active' : 'task-item'}
                    title={task.name}
                  >
                    <span className="task-name">{task.name}</span>
                    {note && <span className="task-note">{note}</span>}
                    {task.total > 0 && task.status === 'proofreading' && (
                      <span className="task-progress">
                        <span style={{ width: `${percent}%` }} />
                      </span>
                    )}
                  </Link>
                );
              })}
            </section>
          ))}
        </nav>

        <div className="sidebar-foot">
          {menuOpen && (
            <>
              <button
                className="menu-scrim"
                aria-label="Close settings menu"
                onClick={() => setMenuOpen(false)}
              />
              <div className="rail-menu" role="menu">
                <Link href="/settings/glossary" role="menuitem">
                  Glossary
                </Link>
                <Link href="/settings/password" role="menuitem">
                  Password
                </Link>
                <button role="menuitem" onClick={logout}>
                  Sign out
                </button>
              </div>
            </>
          )}
          <button
            className="rail-foot-btn"
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <GearIcon />
            <span>Settings</span>
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          {collapsed && (
            <button
              className="icon-btn desktop-only"
              onClick={() => setCollapsed(false)}
              aria-label="Show task list"
              title="Show task list"
            >
              <SidebarIcon />
            </button>
          )}
          <button
            className="icon-btn mobile-only"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Show task list' : 'Hide task list'}
          >
            <SidebarIcon />
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
