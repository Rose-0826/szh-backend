import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  ArrowLeft, ArrowRight, Boxes, ChevronRight, FileStack, Home, MessageSquare, PanelLeft, PanelRight, Play, Plus, Search, Settings, Sparkles,
} from 'lucide-react';
import { useUI } from '@/app/ui-state';
import { useDataSource } from '@/lib/api/datasource';
import { useHealth, useRuns } from '@/lib/api/queries';
import { isActive } from '@/lib/status';
import { shortId } from '@/lib/format';
import { Button, IconButton, Kbd, RunStatusIcon } from '@/components/ui';
import { AssistantPanel } from './AssistantPanel';
import { CommandPalette } from './CommandPalette';

const desktop = window.szhDesktop;

export function AppShell() {
  const { collapsed, assistantOpen, setPaletteOpen, toggleSidebar, setAssistantOpen } = useUI();
  const { kind, setKind } = useDataSource();
  const health = useHealth();
  const offline = kind === 'harness' && health.isError;

  // Global shortcuts: Ctrl/⌘+K search, Ctrl/⌘+B sidebar, Ctrl/⌘+J assistant.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'k') { e.preventDefault(); setPaletteOpen(true); }
      if (k === 'b') { e.preventDefault(); toggleSidebar(); }
      if (k === 'j') { e.preventDefault(); setAssistantOpen(!assistantOpen); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [assistantOpen, setAssistantOpen, setPaletteOpen, toggleSidebar]);

  return (
    <div className={clsx('shell', collapsed && 'is-collapsed')}>
      <TitleBar />
      <Sidebar />
      <main className={clsx('main', assistantOpen && 'with-assistant')}>
        {kind === 'mock' && (
          <div className="demo-banner" role="note">
            <Sparkles size={13} />演示模式：页面数据由前端演示数据源生成，不来自 Harness，也不代表真实科研结果。
            <button onClick={() => setKind('harness')}>切换到 Harness</button>
          </div>
        )}
        {offline && (
          <div className="offline-banner" role="alert">
            未连接到 Harness（{desktop?.harnessUrl ?? '同源 /api'}）。已加载的内容仍可查看，运行与提交暂不可用。
            <button onClick={() => health.refetch()}>重新连接</button>
          </div>
        )}
        <div className="scroll" id="main-scroll"><Outlet /></div>
      </main>
      {assistantOpen && <AssistantPanel />}
      <CommandPalette />
    </div>
  );
}

function TitleBar() {
  const { toggleSidebar, collapsed, crumbs, setPaletteOpen, assistantOpen, setAssistantOpen } = useUI();
  const navigate = useNavigate();
  return (
    <header className={clsx('titlebar', desktop && desktop.platform !== 'darwin' && 'has-overlay', desktop?.platform === 'darwin' && 'is-mac')}
      onDoubleClick={(e) => { if (e.target === e.currentTarget) void desktop?.toggleMaximize(); }}>
      <div className="brand">
        <span className="brand-mark">深</span><span className="brand-name">SZH</span>
        <span className="grow" />
        <IconButton size="sm" label={collapsed ? '展开侧栏 (Ctrl+B)' : '收起侧栏 (Ctrl+B)'} onClick={toggleSidebar}><PanelLeft /></IconButton>
      </div>
      <div className="nav-arrows">
        <IconButton size="sm" label="后退" onClick={() => navigate(-1)}><ArrowLeft /></IconButton>
        <IconButton size="sm" label="前进" onClick={() => navigate(1)}><ArrowRight /></IconButton>
      </div>
      <nav className="crumbs" aria-label="当前位置">
        {crumbs.map((c, i) => (
          <span key={i} className="row" style={{ gap: 4, minWidth: 0 }}>
            {i > 0 && <ChevronRight />}
            {c.to && i < crumbs.length - 1 ? <Link to={c.to} className="truncate">{c.label}</Link> : <span className={clsx('truncate', i === crumbs.length - 1 && 'current')}>{c.label}</span>}
          </span>
        ))}
      </nav>
      <span className="spacer" />
      <button className="search-trigger" onClick={() => setPaletteOpen(true)}>
        <Search />搜索方案、运行与操作<Kbd>Ctrl K</Kbd>
      </button>
      <span className="spacer" />
      <ConnectionIndicator />
      <IconButton size="sm" label="AI 助手 (Ctrl+J)" pressed={assistantOpen} onClick={() => setAssistantOpen(!assistantOpen)}><PanelRight /></IconButton>
    </header>
  );
}

function ConnectionIndicator() {
  const { kind } = useDataSource();
  const health = useHealth();
  const navigate = useNavigate();
  const state = kind === 'mock' ? { cls: 'wait', label: '演示数据' } : health.isPending ? { cls: 'wait', label: '连接中' } : health.isError ? { cls: 'bad', label: '未连接' } : { cls: 'ok', label: 'Harness 已连接' };
  return (
    <button className="conn" onClick={() => navigate('/settings')} title="连接与数据源设置">
      <span className={clsx('dot', state.cls)} />{state.label}
    </button>
  );
}

function Sidebar() {
  const runs = useRuns();
  const location = useLocation();
  const navigate = useNavigate();
  const active = runs.data?.filter((r) => isActive(r.status)).length ?? 0;
  const recent = runs.data?.slice(0, 8) ?? [];
  const items = [
    { to: '/', icon: Home, label: '工作台', end: true },
    { to: '/solutions', icon: Boxes, label: 'Solutions' },
    { to: '/runs', icon: Play, label: '运行', count: active },
    { to: '/artifacts', icon: FileStack, label: '成果' },
    { to: '/conversations', icon: MessageSquare, label: '对话' },
  ];
  return (
    <aside className="sidebar" aria-label="主导航">
      <Button className="new-task" icon={<Plus />} onClick={() => navigate('/', { state: { focusComposer: Date.now() } })} title="新任务">
        <span>新任务</span>
      </Button>
      <nav className="nav">
        {items.map(({ to, icon: Icon, label, end, count }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive: a }) => clsx('nav-item', a && 'active')} title={label}>
            <Icon /><span>{label}</span>
            {!!count && <span className="nav-count"><span className="dot dot-live" />{count}</span>}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-section">最近运行</div>
      <div className="recent">
        {runs.isPending ? <div className="recent-empty">加载中…</div> : runs.isError && !runs.data ? <div className="recent-empty">暂时无法加载</div> : recent.length === 0 ? <div className="recent-empty">还没有运行记录</div> : recent.map((r) => (
          <Link key={r.id} to={`/runs/${r.id}`} className={clsx('nav-item', location.pathname === `/runs/${r.id}` && 'active')} title={`${r.solutionName} · ${r.id}`}>
            <RunStatusIcon status={r.status} /><span className="truncate grow">{r.solutionName}</span><span className="recent-id">#{shortId(r.id).slice(0, 4)}</span>
          </Link>
        ))}
      </div>
      <div className="sidebar-foot">
        <NavLink to="/settings" className={({ isActive: a }) => clsx('nav-item', a && 'active')} title="设置"><Settings /><span>设置</span></NavLink>
      </div>
    </aside>
  );
}
