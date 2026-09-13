import Shell from '@/components/Shell';
import GlobalGlossary from '@/components/GlobalGlossary';
import { getGlossary, listTasks } from '@/lib/tasks';

export const dynamic = 'force-dynamic';

export default async function GlossarySettingsPage() {
  const [tasks, terms] = await Promise.all([listTasks(), getGlossary(null)]);
  return (
    <Shell tasks={tasks} title="Global glossary">
      <div className="content">
        <GlobalGlossary initialTerms={terms} />
      </div>
    </Shell>
  );
}
