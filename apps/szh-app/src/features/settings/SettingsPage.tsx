import { RotateCw } from 'lucide-react';
import { usePageContext } from '@/app/ui-state';
import { useDataSource } from '@/lib/api/datasource';
import { harnessBaseUrl } from '@/lib/api/harness';
import { useHealth } from '@/lib/api/queries';
import { dateTime } from '@/lib/format';
import { Badge, Button, KeyValue, PageHeader, Section, Segmented } from '@/components/ui';

export function SettingsPage() {
  usePageContext([{ label: '设置' }]);
  const { kind, setKind } = useDataSource();
  const health = useHealth();
  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <PageHeader title="设置" description="连接、数据源与客户端信息。" />
      <div className="stack" style={{ gap: 36 }}>
        <Section title="数据源">
          <div className="setting-row">
            <div className="grow stack"><span style={{ fontWeight: 500 }}>当前数据源</span><span className="small muted">演示数据仅用于体验通用交互，所有演示记录都会带“演示”标记。切换后页面数据会重新加载。</span></div>
            <Segmented label="数据源" value={kind} onChange={setKind} items={[{ value: 'harness', label: 'Harness' }, { value: 'mock', label: '演示数据' }]} />
          </div>
        </Section>
        <Section title="Harness 连接" action={<Button size="sm" variant="ghost" icon={<RotateCw />} loading={health.isFetching} onClick={() => health.refetch()}>重新检测</Button>}>
          <KeyValue items={[
            ['服务地址', <code key="u">{harnessBaseUrl() || `${location.origin}（同源 /api）`}</code>],
            ['状态', kind === 'mock' ? <Badge key="s">未使用</Badge> : health.isError ? <Badge key="s" tone="danger">未连接</Badge> : health.isPending ? <Badge key="s">检测中</Badge> : <Badge key="s" tone="success">已连接</Badge>],
            ['模型', health.data ? (health.data.modelConfigured ? health.data.model ?? '已配置' : '未配置') : '—'],
            ['最近检测', dateTime(health.data?.checkedAt)],
          ]} />
          {health.isError && kind === 'harness' && <p className="small muted">请在项目根目录运行 <code>npm start</code> 启动 Harness（默认端口 4782），或通过环境变量 SZH_HARNESS_URL 指定地址后重启客户端。</p>}
        </Section>
        <Section title="客户端">
          <KeyValue items={[
            ['版本', 'SZH Desktop 0.2.0（新版前端预览）'],
            ['运行环境', window.szhDesktop ? `Electron · ${window.szhDesktop.platform}` : '浏览器'],
            ['旧版客户端', '仍保留：Start-SZH.cmd / SZH_Desktop\\SZH.exe，可随时回退使用'],
          ]} />
        </Section>
        <Section title="快捷键">
          <KeyValue items={[['Ctrl + K', '搜索与跳转'], ['Ctrl + B', '展开/收起侧栏'], ['Ctrl + J', '打开/关闭 AI 助手'], ['Enter / Shift + Enter', '发送 / 换行']]} />
        </Section>
      </div>
    </div>
  );
}
