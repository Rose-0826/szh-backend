import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Boxes, FileText, MessageSquare, Play, Plus, Sparkles, X } from 'lucide-react';
import { useUI, type AssistantContext } from '@/app/ui-state';
import { useDataSource } from '@/lib/api/datasource';
import { ApiError } from '@/lib/api/contract';
import { useConversation, useCreateConversation, useHealth } from '@/lib/api/queries';
import { IconButton, SkeletonRows, useToast } from '@/components/ui';
import { Composer } from '@/components/assistant/Composer';
import { ThreadComposer, ThreadMessages } from '@/components/assistant/ConversationThread';

const suggestions: Record<string, string[]> = {
  solution: ['这个方案适合解决什么问题？', '输入参数分别代表什么？', '它的能力边界是什么？'],
  run: ['解释当前运行状态', '这次运行失败的原因可能是什么？', '如何基于这次运行再做一次？'],
  artifact: ['帮我解读这个成果文件', '这些结果如何复用到下一步？'],
  general: ['我应该用哪个方案处理我的数据？', '最近的运行有哪些需要关注？'],
};

/** First message carries the page facts (Harness has no context references yet); the question comes first so it titles the conversation. */
function withContext(text: string, context: AssistantContext) {
  if (context.kind === 'general') return text;
  const kind = context.kind === 'solution' ? '方案' : context.kind === 'run' ? '运行' : '成果';
  return [
    text, '',
    `【上下文：${kind}「${context.label}」${context.id ? `（${context.id}）` : ''}】`,
    ...(context.facts ?? []).map((f) => `- ${f.length > 1200 ? f.slice(0, 1200) + '…（已截断）' : f}`),
  ].join('\n');
}

/**
 * Contextual assistant. Conversations stay in the panel and are remembered per page context.
 * It never fakes answers and never submits Runs.
 */
export function AssistantPanel() {
  const { setAssistantOpen, context, threads, setThread } = useUI();
  const { kind } = useDataSource();
  const health = useHealth();
  const toast = useToast();
  const create = useCreateConversation();
  const threadKey = `${kind}:${context.kind}:${context.id ?? context.label}`;
  const threadId = threads[threadKey];
  const conversation = useConversation(threadId);
  const Icon = context.kind === 'solution' ? Boxes : context.kind === 'run' ? Play : context.kind === 'artifact' ? FileText : MessageSquare;
  const modelReady = kind === 'mock' || health.data?.modelConfigured;

  // A remembered conversation that no longer exists (data reset, other data source) is forgotten.
  useEffect(() => {
    if (threadId && conversation.error instanceof ApiError && conversation.error.status === 404) setThread(threadKey, null);
  }, [threadId, threadKey, conversation.error, setThread]);

  const ask = async (text: string) => {
    try {
      const c = await create.mutateAsync(withContext(text, context));
      setThread(threadKey, c.id);
    } catch (error) {
      toast({ tone: 'danger', message: (error as Error).message });
      throw error;
    }
  };

  return (
    <aside className="assistant" aria-label="AI 助手">
      <div className="assistant-head">
        <Sparkles className="spark" /><h2>AI 助手</h2><span className="grow" />
        {threadId && <>
          <Link to={`/conversations/${threadId}`} className="icon-btn icon-btn-sm" title="在对话页打开" aria-label="在对话页打开"><ArrowUpRight /></Link>
          <IconButton size="sm" label="新对话" onClick={() => setThread(threadKey, null)}><Plus /></IconButton>
        </>}
        <IconButton size="sm" label="关闭 (Ctrl+J)" onClick={() => setAssistantOpen(false)}><X /></IconButton>
      </div>
      <div className="assistant-context"><Icon size={14} />当前上下文：<strong className="truncate" style={{ color: 'var(--text-primary)' }}>{context.label}</strong></div>
      <div className="assistant-body">
        {threadId && conversation.data ? (
          <div className="assistant-thread"><ThreadMessages conversation={conversation.data} /></div>
        ) : threadId && conversation.isPending ? (
          <SkeletonRows rows={2} />
        ) : (
          <>
            <p className="small muted">助手可以解释方案、运行与成果，并帮助规划任务。提问时会附带当前页面的记录信息。标准运行请使用方案页面中的表单，助手不会替你提交任务。</p>
            {!modelReady && !health.isPending && (
              <p className="small" style={{ color: 'var(--warning)' }}>Harness 尚未配置模型，提问会返回错误提示。可在服务端 .env 中配置后重试。</p>
            )}
            <div className="stack" style={{ gap: 6 }}>
              {(suggestions[context.kind] ?? suggestions.general).map((s) => (
                <button key={s} className="suggestion" disabled={create.isPending} onClick={() => void ask(s).catch(() => {})}><Sparkles />{s}</button>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="assistant-foot">
        {threadId && conversation.data
          ? <ThreadComposer compact conversation={conversation.data} placeholder="继续提问…" />
          : <Composer compact placeholder={`就「${context.label}」提问…`} busy={create.isPending} onSubmit={ask} />}
      </div>
    </aside>
  );
}
