import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Play, ShieldCheck } from 'lucide-react';
import type { Solution, SolutionVersion } from '@/types/domain';
import { backendName, useDataSource } from '@/lib/api/datasource';
import { useCreateRun, useHealth } from '@/lib/api/queries';
import { ApiError } from '@/lib/api/contract';
import { defaultsFromSchema, validateAgainstSchema } from '@/lib/schema';
import { Button, Callout, Dialog, KeyValue, useToast } from '@/components/ui';
import { SolutionInputForm } from '@/components/solutions/SolutionInputForm';

type Preflight =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'passed'; signature: string }
  | { state: 'failed'; message: string };

/**
 * Configure → Validate (server) → Confirm → Create Run → open Run Console.
 * Shared by the Solution Workspace and the AI-planned task flow, so both paths create identical Runs.
 */
export function RunConfigurator({ solution, version, initialInput, sourceRunId, onCreated }: {
  solution: Solution; version: SolutionVersion; initialInput?: Record<string, unknown>; sourceRunId?: string; onCreated?: (runId: string) => void;
}) {
  const { source, kind } = useDataSource();
  const health = useHealth();
  const navigate = useNavigate();
  const toast = useToast();
  const create = useCreateRun();
  const [values, setValues] = useState<Record<string, unknown>>(() => ({ ...defaultsFromSchema(version.inputSchema), ...initialInput }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [preflight, setPreflight] = useState<Preflight>({ state: 'idle' });
  const [confirming, setConfirming] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  const signature = useMemo(() => JSON.stringify([version.version, values]), [version.version, values]);
  const offline = kind === 'harness' && health.isError;

  // Switching version resets the form to that version's schema defaults.
  useEffect(() => { setValues({ ...defaultsFromSchema(version.inputSchema), ...initialInput }); setErrors({}); setPreflight({ state: 'idle' }); }, [version.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (key: string, value: unknown) => {
    setValues((v) => { const next = { ...v }; if (value === undefined) delete next[key]; else next[key] = value; return next; });
    setErrors((e) => { const { [key]: _removed, ...rest } = e; return rest; });
    setPreflight((p) => (p.state === 'failed' ? { state: 'idle' } : p));
    requestId.current = crypto.randomUUID(); // new input ⇒ new idempotency key
  };

  const validate = async () => {
    const local = validateAgainstSchema(version.inputSchema, values);
    if (Object.keys(local).length) { setErrors(local); setPreflight({ state: 'failed', message: '请先修正标记的字段。' }); return false; }
    setPreflight({ state: 'checking' });
    try {
      const result = await source.validateInput(solution.id, version.version, values);
      if (result.valid) { setPreflight({ state: 'passed', signature }); return true; }
      setErrors(result.fieldErrors); setPreflight({ state: 'failed', message: result.message });
    } catch (error) {
      setPreflight({ state: 'failed', message: (error as Error).message });
    }
    return false;
  };

  const passed = preflight.state === 'passed' && preflight.signature === signature;

  const submit = async () => {
    try {
      const run = await create.mutateAsync({ solutionId: solution.id, version: version.version, input: values, requestId: requestId.current, sourceRunId });
      setConfirming(false);
      toast({ tone: 'success', message: `已创建运行 #${run.id.slice(0, 8)}` });
      onCreated?.(run.id);
      navigate(`/runs/${run.id}`);
    } catch (error) {
      setConfirming(false);
      const e = error as ApiError;
      setPreflight({ state: 'failed', message: e.code === 'runtime_unavailable' ? 'Harness 尚未配置该方案的执行环境，暂时无法运行。输入已通过校验。' : e.message });
    }
  };

  return (
    <div className="configurator">
      <div className="configurator-form">
        <SolutionInputForm schema={version.inputSchema} values={values} errors={errors} onChange={change} disabled={create.isPending} />
      </div>
      <div className="configurator-bar">
        <div className="grow" aria-live="polite">
          {preflight.state === 'idle' && <span className="small muted">提交前会由{backendName(kind)}按 v{version.version} 的输入规范校验。</span>}
          {preflight.state === 'checking' && <span className="small muted">正在校验…</span>}
          {preflight.state === 'passed' && (passed
            ? <span className="small row" style={{ color: 'var(--success)' }}><CheckCircle2 size={15} />校验通过，可以运行</span>
            : <span className="small muted">输入已修改，需要重新校验。</span>)}
          {preflight.state === 'failed' && <Callout tone="danger" title="无法运行">{preflight.message}</Callout>}
        </div>
        <Button icon={<ShieldCheck />} loading={preflight.state === 'checking'} disabled={offline} onClick={validate}>校验</Button>
        <Button variant="primary" icon={<Play />} disabled={offline || create.isPending}
          onClick={async () => { if (passed || (await validate())) setConfirming(true); }}>
          运行
        </Button>
      </div>

      <Dialog open={confirming} onClose={() => setConfirming(false)} title="确认运行"
        description={kind === 'mock' ? '将使用以下配置创建一次演示运行（在浏览器内计算，不提交 Harness）。运行开始后可以在运行页查看状态或取消。' : '将使用以下配置在 Harness 中创建一次运行。运行开始后可以在运行页查看状态或取消。'}
        footer={<><Button onClick={() => setConfirming(false)}>返回修改</Button><Button variant="primary" icon={<Play />} loading={create.isPending} onClick={submit}>确认运行</Button></>}>
        <KeyValue items={[
          ['方案', solution.name],
          ['版本', `v${version.version}`],
          ['数据源', kind === 'mock' ? '演示数据源（浏览器内计算）' : 'Harness'],
          ...(sourceRunId ? [['基于运行', `#${sourceRunId.slice(0, 8)}`] as [string, string]] : []),
        ]} />
        <pre className="code-block" style={{ marginTop: 12, maxHeight: 200 }}>{JSON.stringify(values, null, 2)}</pre>
      </Dialog>
    </div>
  );
}
