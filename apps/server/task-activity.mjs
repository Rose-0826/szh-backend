import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';

// Keep the model's public text/reasoning and tool events; the raw request and
// system/developer instructions do not belong in the task transcript.
export function activityEvent(event) {
  if (['step/start', 'step/end', 'tool/call', 'tool/result', 'turn/end'].includes(event?.type)) {
    return { type: event.type, data: event.data };
  }
  if (event?.type === 'assistant/message') {
    const content = event.data?.message?.content?.filter((part) => ['text', 'reasoning'].includes(part.type));
    if (content?.length) return { type: event.type, data: { turn: event.data.turn, step: event.data.step, message: { role: 'assistant', content } } };
  }
  return null;
}

export async function readArchivedActivity(directory, sessionId) {
  if (!sessionId) return [];
  const root = join(directory, 'dsh', 'sessions');
  let workspaces;
  try { workspaces = await readdir(root, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  for (const workspace of workspaces) {
    if (!workspace.isDirectory()) continue;
    let bytes;
    try { bytes = await readFile(join(root, workspace.name, sessionId, 'session.v4.jsonl.zstd')); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    return zstdDecompressSync(bytes).toString('utf8').split('\n').filter((line) => line.trim()).map((line) => activityEvent(JSON.parse(line))).filter(Boolean);
  }
  return [];
}
