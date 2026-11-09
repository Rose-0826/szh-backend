import { useEffect, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import type { Conversation } from '@/types/domain';
import { useSendMessage, useStopReply } from '@/lib/api/queries';
import { Callout, DemoTag, useToast } from '@/components/ui';
import { Composer } from './Composer';
import { Markdown } from './Markdown';

export const isReplyPending = (c?: Conversation) => (c?.messages ?? []).some((m) => ['queued', 'running', 'stopping'].includes(m.status));

/** Questions sent from the assistant panel carry a page-context block; it stays inspectable but folded. */
function UserMessage({ content }: { content: string }) {
  const cut = content.indexOf('\n\n【上下文：');
  if (cut < 0) return <div className="msg-user">{content}</div>;
  return (
    <div className="msg-user">
      {content.slice(0, cut)}
      <details className="msg-context"><summary>附带的页面上下文</summary><pre>{content.slice(cut + 2)}</pre></details>
    </div>
  );
}

const statusNote: Record<string, string> = { stopped: '已停止回复', interrupted: '回复被中断', failed: '回复失败' };

export function ThreadMessages({ conversation }: { conversation: Conversation }) {
  const end = useRef<HTMLDivElement>(null);
  const messages = conversation.messages;
  const last = messages[messages.length - 1];
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [messages.length, last?.status, last?.reply]);
  return (
    <>
      {messages.map((m) => (
        <div key={m.id} className="turn">
          <UserMessage content={m.content} />
          <div className="msg-ai">
            <span className="msg-ai-mark"><Sparkles size={14} /></span>
            <div className="grow">
              {m.reply ? <div className="msg-ai-text"><Markdown text={m.reply} />{conversation.origin === 'mock' && <DemoTag />}</div>
                : m.error ? <Callout tone="danger">{m.error}</Callout>
                  : ['queued', 'running', 'stopping'].includes(m.status) ? <span className="typing" aria-label="正在回复"><i /><i /><i /></span>
                    : <span className="small faint">{statusNote[m.status] ?? '无回复'}</span>}
            </div>
          </div>
        </div>
      ))}
      <div ref={end} />
    </>
  );
}

/** Follow-up composer for an existing conversation, with stop while a reply is pending. */
export function ThreadComposer({ conversation, compact, placeholder }: { conversation: Conversation; compact?: boolean; placeholder?: string }) {
  const send = useSendMessage(conversation.id);
  const stop = useStopReply(conversation.id);
  const toast = useToast();
  const pending = isReplyPending(conversation);
  return (
    <Composer compact={compact} placeholder={pending ? '正在回复…' : placeholder ?? '继续提问…'} busy={pending || send.isPending}
      onStop={pending ? () => stop.mutate(undefined, { onError: (e) => toast({ tone: 'danger', message: (e as Error).message }) }) : undefined}
      onSubmit={async (t) => {
        try { await send.mutateAsync(t); }
        catch (e) { toast({ tone: 'danger', message: (e as Error).message }); throw e; }
      }} />
  );
}
