import Shell from '@/components/Shell';
import ChangePassword from '@/components/ChangePassword';
import { passwordOverrideSet } from '@/lib/env';
import { listTasks } from '@/lib/tasks';

export const dynamic = 'force-dynamic';

export default async function PasswordSettingsPage() {
  const tasks = await listTasks();
  return (
    <Shell tasks={tasks} title="Password">
      <div className="content">
        <ChangePassword overridden={passwordOverrideSet()} />
      </div>
    </Shell>
  );
}
