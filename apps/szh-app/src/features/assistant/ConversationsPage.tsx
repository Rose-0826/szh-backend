import { Link, useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { MessageSquare, Plus } from 'lucide-react';
import { usePageContext } from '@/app/ui-state';
import { useConversation, useConversations, useCreateConversation, useHealth } from '@/lib/api/queries';
import { relativeTime } from '@/lib/format';
import { Button, Callout, EmptyState, ErrorState, QueryView, SkeletonRows, useToast } from '@/components/ui';
import { Composer } from '@/components/assistant/Composer';
import { ThreadComposer, ThreadMessages } from '@/components/assistant/ConversationThread';

/** AI conversations backed by the Harness task service (solution_id = "general"). */
export function ConversationsPage() {
  const { id } = useParams();
  const list = useConversations();
  const conversation = useConversation(id);
  usePageContext([{ label: '对话', to: '/conversations' }, ...(conversation.data ? [{ label: conversation.data.title }] : [])]);
  const navigate = useNavigate();

  return (
    <div className="chat-layout">
      <aside className="chat-list">
        <div className="row" style={{ padding: '16px 12px 8px' }}>
          <h2 className="grow" style={{ fontSize: 'var(--text-md)' }}>对话</h2>
          <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => navigate('/conversations')}>新对话</Button>
        </div>
        <QueryView query={list} compact loading={<SkeletonRows rows={4} />} isEmpty={(d) => d.length === 0} empty={<p className="xs faint" style={{ padding: '4px 12px' }}>还没有对话</p>}>
          {(d) => <div className="stack" style={{ padding: '0 6px', gap: 1 }}>{d.map((c) => (
            <Link key={c.id} to={`/conversations/${c.id}`} className={clsx('nav-item chat-item', c.id === id && 'active')}>
              <span className="truncate grow">{c.title}</span><span className="xs faint">{relativeTime(c.updatedAt)}</span>
            </Link>))}</div>}
        </QueryView>
      </aside>
      <section className="chat-main">{id ? <Thread id={id} /> : <NewConversation />}</section>
    </div>
  );
}

function NewConversation() {
  const health = useHealth();
  const navigate = useNavigate();
  const toast = useToast();
  const create = useCreateConversation();
  return (
    <div className="chat-empty">
      <EmptyState icon={<MessageSquare />} title="与 AI 讨论科研问题" description="对话用于理解问题与解释结果。需要计算时，请在方案中运行，以获得可追溯的运行与成果。" />
      {health.data && !health.data.modelConfigured && <Callout tone="warning">Harness 尚未配置模型，发送后会返回未完成提示。</Callout>}
      <Composer placeholder="输入你的问题…" busy={create.isPending} autoFocusKey={1} onSubmit={async (t) => {
        try { const c = await create.mutateAsync(t); navigate(`/conversations/${c.id}`); }
        catch (e) { toast({ tone: 'danger', message: (e as Error).message }); throw e; }
      }} />
    </div>
  );
}

function Thread({ id }: { id: string }) {
  const conversation = useConversation(id);
  if (conversation.isPending) return <div style={{ padding: 32 }}><SkeletonRows rows={3} /></div>;
  if (conversation.isError) return <ErrorState error={conversation.error} onRetry={() => conversation.refetch()} />;
  return (
    <>
      <div className="thread"><ThreadMessages conversation={conversation.data} /></div>
      <div className="thread-composer"><ThreadComposer conversation={conversation.data} /></div>
    </>
  );
}
