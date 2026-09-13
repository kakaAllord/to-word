import { withAuth } from '@/lib/http';
import { exportDocx, exportFilename, exportMarkdown } from '@/lib/export';
import { getSegments, getSpeakerMap, getTask } from '@/lib/tasks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET ?format=docx|md&timestamps=1 — exports edited text only (spec 11). */
export const GET = withAuth(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const row = await getTask(id);
  if (!row) return new Response('Task not found', { status: 404 });

  const url = new URL(request.url);
  const format = url.searchParams.get('format') === 'md' ? 'md' : 'docx';
  const includeTimestamps = url.searchParams.get('timestamps') === '1';

  const segments = await getSegments(id);
  const speakers = await getSpeakerMap(id);
  const filename = exportFilename(row.name, format);

  if (format === 'md') {
    const markdown = exportMarkdown(row.name, segments, speakers, { includeTimestamps });
    return new Response(markdown, {
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  const buffer = await exportDocx(row.name, segments, speakers, { includeTimestamps });
  return new Response(new Uint8Array(buffer), {
    headers: {
      'content-type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
});
