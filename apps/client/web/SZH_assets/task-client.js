const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const names = { awaiting_confirmation: '等待确认计划', queued: '排队中', running: '正在解析', stopping: '正在停止', stopped: '已停止', interrupted: '上次运行中断', completed: '解析已返回', invalid_output: '输出需处理', failed: '运行未完成' };
const sample = 'Q)KZDV/QMRLC/IV/NBO/A/000/999/3952N10440W005\nA)KDEN B)2301010254 C)2301011200\nE) DEN RWY 17L/35R CLSD';
const activeStates = ['queued', 'running', 'stopping'];
let base = localStorage.getItem('szh-service') || (location.protocol === 'http:' ? location.origin : 'http://127.0.0.1:4782');
let current = null;
let busy = false;
let refreshing = false;
let online = false;
let tab = 'result';
let tasks = [];
let readingMode = localStorage.getItem('szh-reading-mode') || 'plain';

function selectPage(page) {
  const panels = {home:'home',tasks:'panel-tasks',solutions:'panel-solutions',knowledge:'panel-knowledge',settings:'panel-settings',editor:'editor',task:'task-workspace'};
  for (const [name,id] of Object.entries(panels)) $(id).hidden = name !== page;
  const nav = {home:'new-task',tasks:'tasks-nav',solutions:'solutions-nav',knowledge:'knowledge-nav',settings:'settings-nav',editor:'nav-create',task:'tasks-nav'};
  for (const id of Object.values(nav)) { const selected=id===nav[page]; $(id).classList.toggle('active',selected); if(selected)$(id).setAttribute('aria-current','page');else $(id).removeAttribute('aria-current'); }
  $('status-detail').hidden = !['editor','task'].includes(page);
}

function setSidebarCollapsed(collapsed) {
  $('app-shell').classList.toggle('sidebar-collapsed',collapsed);
  $('collapse-sidebar').setAttribute('aria-expanded',String(!collapsed));
  $('collapse-sidebar').setAttribute('aria-label',collapsed?'展开侧栏':'收起侧栏');
  $('collapse-sidebar').title=collapsed?'展开侧栏':'收起侧栏';
  localStorage.setItem('szh-sidebar-collapsed',String(collapsed));
}

function setHistoryCollapsed(collapsed) {
  $('history-content').hidden=collapsed;
  $('toggle-history').setAttribute('aria-expanded',String(!collapsed));
  localStorage.setItem('szh-history-collapsed',String(collapsed));
}

function taskMatches(task, query='', filter='all') {
  const status = filter==='all' || (filter==='active'?activeStates.includes(task.status):filter==='attention'?['failed','invalid_output','interrupted'].includes(task.status):task.status===filter);
  return status && [task.id,task.notam_id,task.notam].join(' ').toLowerCase().includes(query.trim().toLowerCase());
}

function renderTaskLists() {
  const sidebar=tasks.filter(task=>taskMatches(task,$('sidebar-search').value));
  $('task-list').innerHTML=sidebar.length?sidebar.map(taskButton).join(''):'<p class="side-empty">没有匹配的任务。</p>';
  const filtered=tasks.filter(task=>taskMatches(task,$('task-search').value,$('task-filter').value||'all'));
  const rows=list=>list.map(task=>'<button class="recent-task" data-task="'+esc(task.id)+'"><span class="recent-icon"><svg aria-hidden="true"><use href="#i-file"/></svg></span><span><b>'+esc(task.notam_id||task.id.slice(0,8))+'</b><small>航空运行信息解读 · '+(task.parser_type==='report'?'业务解读':'跑道字段提取')+' · '+esc((task.updated_at||'').replace('T',' ').slice(0,16))+' UTC</small></span><span class="recent-state">'+esc(names[task.status]||task.status)+'</span><svg aria-hidden="true"><use href="#i-right"/></svg></button>').join('');
  $('all-tasks').innerHTML=filtered.length?rows(filtered):'<p class="empty-panel">没有匹配的任务，试试其他关键词或状态。</p>';
  $('recent-tasks').innerHTML=tasks.length?rows(tasks.slice(0,4)):'<p class="muted">还没有任务，选择专业能力开始。</p>';
  $('tasks-summary').textContent='共 '+tasks.length+' 项任务，当前显示 '+filtered.length+' 项';
  $('running-count').textContent=tasks.filter(task=>activeStates.includes(task.status)).length;
  $('completed-count').textContent=tasks.filter(task=>task.status==='completed').length;
  $('attention-count').textContent=tasks.filter(task=>['failed','invalid_output','interrupted'].includes(task.status)).length;
}

function showPanel(page) {
  current=null;setNavigation(false,false);selectPage(page);message('');
  const labels={tasks:['全部任务','搜索已有任务，查看进度、结果和交付文件。'],solutions:['专业能力','查看每项能力的工具、技能、规则与适用范围。'],knowledge:['资料库','查询已收录资料，核对来源、版本与适用范围。'],settings:['设置','管理运行服务连接和结果阅读方式。']};
  $('task-heading').textContent=labels[page][0];$('page-description').textContent=labels[page][1];$('view-label').textContent=labels[page][0];$('page-version').textContent='SZH v0.1';
  if(page==='tasks')renderTaskLists();
  if(page==='knowledge')void loadLibrary();
  if(page==='solutions')void loadSolutions();
}

function showTasks(filter='all') { $('task-filter').value=filter;showPanel('tasks'); }

async function loadLibrary() {
  $('library-results').innerHTML='<p class="muted">正在查询资料…</p>';
  try {
    const hits=await api('/api/knowledge/search?q='+encodeURIComponent($('library-query').value));
    $('library-count').textContent='找到 '+hits.length+' 条已收录资料';
    $('library-results').innerHTML=hits.length?hits.map(referenceView).join(''):'<p class="empty-panel">未找到匹配的已收录资料，请更换关键词。</p>';
  } catch(error) { $('library-count').textContent='资料读取未完成';$('library-results').textContent=error.message; }
}

async function loadSolutions() {
  $('solution-start').disabled=true;
  try {
    const list=await api('/api/solutions');
    $('solution-catalog').innerHTML=list.map(solution=>'<article class="solution-detail"><div class="section-heading"><h2>'+esc(solution.name)+'</h2><span class="available-label">已接通 v'+esc(solution.version)+'</span></div><p>'+esc(solution.description)+'</p><div class="capability-detail-grid"><div><h3>配套工具</h3><ul>'+solution.tools.map(tool=>'<li>'+esc(({notam_schema:'读取与检查字段定义',notam_reference:'查询已收录的官方资料'})[tool]||tool)+'<small>'+esc(tool)+'</small></li>').join('')+'</ul></div><div><h3>技能流程</h3><p>读取任务要求，调用工具解析，核对结果并保存记录。</p><small>'+esc(solution.skills.join('、'))+'</small></div><div><h3>操作边界</h3><p>'+esc(solution.constraints.missing_information)+'；'+esc(solution.constraints.unsupported_conclusions)+'。</p></div><div><h3>交付内容</h3><p>'+esc(solution.deliverables.join('、'))+'</p></div></div></article>').join('');
    $('solution-start').disabled=!list.some(solution=>solution.id==='aviation-notam');
  } catch(error) { $('solution-catalog').textContent=error.message; }
}

function openExample() {
  const example=tasks.find(task=>task.status==='completed'&&task.notam_id==='ZPKM_K0790/24')||tasks.find(task=>task.status==='completed'&&task.parser_type==='report');
  if(example)void openTask(example.id);else message('当前服务还没有可查看的业务解读案例，请连接团队服务器，或先创建任务。',true);
}

async function api(path, method = 'GET', body) {
  const response = await fetch(base + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(12000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.data?.message || '服务暂时未能处理该操作。');
  return result.data;
}

function message(text, isError = false) {
  $('message').textContent = text;
  $('message').className = isError ? 'message error' : 'message';
}

function connection(connected, text) {
  online = connected;
  $('connection').textContent = text;
  $('connection').className = connected ? 'connection connected' : 'connection';
  $('runtime-status').textContent = connected ? '运行服务已连接' : '未连接，保留当前内容';
}

function taskButton(task) {
  return `<button class="task-link ${current?.id === task.id ? 'selected' : ''}" data-task="${esc(task.id)}"><span>${task.parser_type === 'report' ? '业务解析' : '跑道解析'} ${esc(task.notam_id || task.id.slice(0, 6))}</span><small>${esc(names[task.status] || task.status)}</small></button>`;
}

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    const [health, list] = await Promise.all([api('/api/health'), api('/api/tasks')]);
    connection(true, '运行服务已连接');
    $('runtime-status').textContent = health.model_configured ? '归档查看不调用模型；新任务使用后端配置（可用性未探测）' : '归档可直接查看；新任务需后端配置模型';
    $('model').textContent = health.model || '未配置';
    $('task-list').innerHTML = list.length ? list.sort((a, b) => b.updated_at.localeCompare(a.updated_at)).map(taskButton).join('') : '<p class="side-empty">尚无任务。创建后会保存在这里。</p>';
    tasks = list;
    $('recent-tasks').innerHTML = list.length ? list.slice(0, 4).map(task => '<button class="recent-task" data-task="' + esc(task.id) + '"><span class="recent-icon"><svg aria-hidden="true"><use href="#i-file"/></svg></span><span><b>' + esc(task.notam_id || task.id.slice(0, 8)) + '</b><small>航空运行信息解读 · ' + (task.parser_type === 'report' ? '业务解读' : '跑道字段提取') + '</small></span><span class="recent-state">' + esc(names[task.status] || task.status) + '</span><svg aria-hidden="true"><use href="#i-right"/></svg></button>').join('') : '<p class="muted">还没有任务。选择上方专业能力开始。</p>';
    $('task-count').textContent = list.length;
    renderTaskLists();
    $('settings-runtime').textContent=health.runtime||'—';
    $('settings-model').textContent=health.model||'未配置';
    $('settings-reasoning').textContent=health.reasoning_effort||'默认';
    $('settings-configured').textContent=health.model_configured?'已填写，额度由实际调用确认':'未填写';
    if (current) {
      const updated = await api('/api/tasks/' + current.id);
      if (updated.updated_at !== current.updated_at) { current = updated; renderTask(); }
    }
  } catch {
    connection(false, '运行服务未连接');
    // A failed request never turns existing records into an empty task list.
  } finally { refreshing = false; }
}

function setNavigation(open, returnFocus = true) {
  const visible = Boolean(open && window.matchMedia('(max-width:760px)').matches);
  $('app-shell').classList.toggle('navigation-open', visible);
  $('toggle-navigation').setAttribute('aria-expanded', String(visible));
  $('navigation-backdrop').hidden = !visible;
  $('app-content').inert = visible;
  if (visible) {
    $('task-navigation').setAttribute('role', 'dialog');
    $('task-navigation').setAttribute('aria-modal', 'true');
    $('new-task').focus();
  } else {
    $('task-navigation').removeAttribute('role');
    $('task-navigation').removeAttribute('aria-modal');
    if (returnFocus) $('toggle-navigation').focus();
  }
}

function showHome(focus = true) {
  setNavigation(false, false);
  current = null;
  selectPage('home');
  $('home').hidden = false;
  $('editor').hidden = true;
  $('task-workspace').hidden = true;
  $('task-heading').textContent = '今天要推进什么工作？';
  $('page-description').textContent = '选择专业能力，准备材料，按计划推进任务。';
  $('page-version').textContent = 'SZH v0.1';
  $('view-label').textContent = '工作台';
  $('status-detail').hidden = true;
  $('new-task').classList.toggle('active', true);
  $('solutions-nav').classList.toggle('active', false);
  message('');
  if (focus) $('task-heading').focus();
}

function newTask() {
  setNavigation(false, false);
  current = null;
  selectPage('editor');
  localStorage.removeItem('szh-task');
  $('home').hidden = true;
  $('editor').hidden = false;
  $('task-workspace').hidden = true;
  $('task-heading').textContent = '航空运行信息解读';
  $('page-description').textContent = '把航行通告整理成易读要点，并保留专业字段和处理依据。';
  $('page-version').textContent = '航空专业能力 v0.1';
  $('status-detail').hidden = false;
  $('view-label').textContent = '新建任务';
  message('');
  $('goal').focus();
}

async function openTask(id) {
  try {
    current = await api('/api/tasks/' + id);
    selectPage('task');
    localStorage.setItem('szh-task', id);
    $('home').hidden = true;
    $('editor').hidden = true;
    $('task-workspace').hidden = false;
    $('view-label').textContent = '任务工作区';
    message('');
    renderTask();
    setNavigation(false, false);
    $('task-heading').focus();
    void refresh();
    return true;
  } catch (error) { message(error.message, true); return false; }
}

async function createTask(event) {
  event.preventDefault();
  if (busy) return;
  busy = true;
  $('create').disabled = true;
  message('正在保存报文并准备计划…');
  const notam = $('goal').value;
  const parserType = $('parser-type').value || 'runway';
  const notamId = $('notam-id').value.trim();
  try {
    const task = await api('/api/tasks', 'POST', { notam, parser_type: parserType, notam_id: notamId || undefined, timeout_seconds: Number($('budget').value) });
    if (await openTask(task.id)) {
      // Consume only the submitted draft after the saved task is displayed.
      if ($('goal').value === notam) $('goal').value = '';
      if ($('notam-id').value.trim() === notamId) $('notam-id').value = '';
    }
  } catch (error) { message(error.message || '连接失败，请启动运行服务后重试。', true); }
  finally { busy = false; $('create').disabled = false; renderTask(); }
}

async function operate(action) {
  if (!current || busy) return;
  busy = true;
  renderTask();
  try {
    current = await api(`/api/tasks/${current.id}/${action}`, 'POST');
    message(action === 'stop' ? '已提交停止请求，正在保留已有记录。' : '任务已提交，可以在这里查看进度。');
    await refresh();
  } catch (error) { message(error.message, true); }
  finally { busy = false; renderTask(); }
}

const artifactLabels = {
  'input.txt': '原始报文', 'result.json': '结构化结果', 'checks.json': '字段检查',
  'model-response.json': '模型返回与工具记录', 'runtime-summary.json': '运行结束摘要'
};

function officialLink(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; }
  catch { return null; }
}

function referenceView(hit) {
  const url = officialLink(hit.url);
  return '<article class="reference-hit"><h3>' + esc(hit.title) + '</h3><span class="source-kind">来源摘要</span>'
    + '<p>' + esc(hit.summary) + '</p><small>' + esc(hit.locator) + ' · ' + esc(hit.publisher) + ' · ' + esc(hit.version) + '</small>'
    + (hit.scope_note ? '<p class="source-scope">' + esc(hit.scope_note) + '</p>' : '')
    + (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">打开官方出处</a>' : '<p>原记录未提供有效的HTTP(S)出处链接。</p>') + '</article>';
}

function actualReferences(task) {
  const hits = new Map();
  for (const step of task.steps || []) {
    const calls = new Set((step.tool_calls || []).filter((call) => call.data?.name === 'notam_reference').map((call) => call.data.callId));
    for (const result of step.tool_results || []) {
      const reply = result.message || result;
      if (!calls.has(reply.toolCallId || reply.source?.callId)) continue;
      for (const block of reply.content || []) {
        if (block.type !== 'text') continue;
        try {
          const parsed = JSON.parse(block.text);
          if (Array.isArray(parsed)) for (const hit of parsed) {
            if (hit && typeof hit === 'object' && hit.id && hit.title && hit.locator) hits.set(hit.id + '|' + hit.locator, hit);
          }
        } catch { /* Keep unparsed tool payloads in the execution record; never invent a source. */ }
      }
    }
  }
  return [...hits.values()];
}

function resultView(task) {
  const partial = (task.checks?.warnings || []).some((text) => text.includes('局部范围'));
  if (task.status === 'completed' && task.parser_type === 'report') {
    const result = task.result;
    const status = {closed: '机场完全关闭', ltd: '存在运行限制', open: '已开放或取消关闭'}[result.restriction_Type] || result.restriction_Type;
    const facilities = (result.affected_facilities || []).map(item => ({Runway:'跑道',Taxiway:'滑行道',Airport:'机场'}[item.type] || item.type) + ' ' + item.name + '：' + ({closed:'关闭',restricted:'受限',open:'开放'}[item.status] || item.status));
    const conditions = (result.restrictions || []).map(item => {
      const flights = (item.applies_to.flight_type || []).map(type => ({international:'国际',domestic:'国内',regional:'地区'}[type] || type)).join('、') || item.applies_to.aircraft_type;
      return flights + ' / ' + ({landing:'着陆',takeoff:'起飞','takeoff,landing':'起降',diversion:'备降'}[item.operation]) + '：' + ({denied:'不允许',conditional:'满足条件后允许',allowed:'允许'}[item.permission]) + (item.condition ? '；' + item.condition : '');
    });
    const qualifications = /机组与航空器同时/.test(result.details || '') ? '<div class="plain-explanation"><b>读懂这里的条件</b><p>“机组与航空器同时具备”表示机组和飞机都需要符合报文要求。具体资格名称见下方。</p></div>' : '';
    return '<strong>' + esc(status) + '</strong>' + qualifications + (result.details ? '<p>' + esc(result.details) + '</p>' : '')
      + (result.Diversion_Restriction ? '<p><b>备降：</b>不接收备降或不用于备降计划。</p>' : '')
      + (result.exception ? '<div class="result-warning"><b>例外条件</b><p>' + esc(result.exception) + '</p></div>' : '')
      + (conditions.length ? '<ul>' + conditions.map(line => '<li>' + esc(line) + '</li>').join('') + '</ul>' : '')
      + (facilities.length ? '<p><b>受影响设施：</b>' + esc(facilities.join('；')) + '</p>' : '')
      + (result.validity ? '<p><b>有效时间（原始UTC）：</b>' + esc(result.validity.start || '未提供') + ' 至 ' + esc(result.validity.permanent ? 'PERM（长期）' : result.validity.end || '未提供') + (result.validity.estimated ? '（预计结束）' : '') + (result.validity.schedule ? '；时段：' + esc(result.validity.schedule) : '') + '</p>' : '')
      + (partial ? '<div class="result-warning"><b>原文涉及局部范围</b><p>按原文保留范围和条件，请结合左侧高亮查看。</p></div>' : '');
  }
  if (task.status === 'completed') {
    return '<strong>提取到 ' + task.result.length + ' 条跑道方向记录</strong>'
      + '<p>字段检查通过。五字段模式按论文规则整理跑道记录，完整业务状态请使用业务解析；专业审核待确认。</p>'
      + (partial ? '<div class="result-warning"><b>原文涉及局部范围</b><p>当前五字段无法完整表达局部影响，请结合原文和下方提示查看。</p></div>' : '');
  }
  if (task.status === 'invalid_output') {
    const unsupported = (task.checks?.errors || []).some((text) => text.includes('当前仅支持跑道解析'));
    if (unsupported) return '<strong>当前任务不支持滑行道解析</strong><p>这份报文涉及滑行道，当前任务只处理跑道信息。原文和检查原因已保留，不把滑行道转换为跑道记录。</p>';
    const insufficient = (task.checks?.errors || []).some((text) => /不能补猜|未提供.*编号/.test(text));
    return '<strong>' + (insufficient ? '报文信息不足，无法生成可用跑道结果' : '输出未通过字段检查') + '</strong>'
      + '<p>' + (insufficient ? '原文未明确给出本任务所需编号，保留原文和检查原因，不补猜机场设施。' : '原始返回已保留，请展开检查结果查看原因。') + '</p>';
  }
  return '<strong>' + esc(names[task.status] || task.status) + '</strong><p>' + esc(task.error?.message || (activeStates.includes(task.status) ? '正在读取规则并解析报文，完成后更新结果。' : '确认计划后开始处理。')) + '</p>';
}

function originalView(task) {
  const items = task.checks?.evidence?.items || [];
  const spans = items.filter(item => Number.isInteger(item.offset) && task.notam.slice(item.offset, item.offset + item.text.length) === item.text).sort((a,b) => a.offset - b.offset);
  let html = '', end = 0;
  for (const item of spans) {
    if (item.offset < end) continue;
    html += esc(task.notam.slice(end, item.offset)) + '<mark title="' + esc(item.field) + '">' + esc(item.text) + '</mark>';
    end = item.offset + item.text.length;
  }
  return html + esc(task.notam.slice(end));
}

async function downloadArtifact(file, button) {
  if (!current || button?.disabled) return;
  const taskId = current.id;
  if (button) button.disabled = true;
  try {
    const response = await fetch(base + '/api/tasks/' + taskId + '/artifacts/' + encodeURIComponent(file), { signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      let detail;
      try { detail = (await response.json()).data?.message; } catch {}
      throw new Error(detail || '该文件尚未生成，请核对当前任务状态。');
    }
    download(await response.text(), file, file.endsWith('.json') ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8');
    message('已下载 ' + file + '（任务 ' + taskId.slice(0, 8) + '）。');
  } catch (error) {
    message(error.name === 'TimeoutError' ? '文件下载超时，请重试；下载不会重新调用模型。' : error.message || '下载失败，请检查服务连接。', true);
  } finally { if (button) button.disabled = false; }
}

function renderTask() {
  const task = current;
  if (!task) return;
  const active = activeStates.includes(task.status);
  $('home').hidden = true;
  $('task-heading').textContent = '航空运行信息解读';
  $('page-description').textContent = '左侧查看原始通告，右侧查看解读结果、处理步骤和依据。';
  $('page-version').textContent = task.parser_type === 'report' ? '业务解读' : '跑道字段提取';
  $('status-detail').hidden = false;
  selectPage('task');
  $('task-state').textContent = names[task.status] || task.status;
  $('task-state').className = 'state ' + (task.status === 'completed' ? 'success' : task.error ? 'warning' : '');
  $('task-id').textContent = (task.notam_id ? task.notam_id + ' / ' : '') + task.id;
  $('record-kind').textContent = String(task.execution_mode || '').includes('test') ? '本机控制测试 · 测试替身，不调用模型' : task.data_origin === 'archived_live_run' ? '历史真实调用归档 · 查看不重新运行' : '当前服务任务';
  $('original').innerHTML = originalView(task);
  $('plan').innerHTML = task.plan.map((line, i) => `<li><span>${i + 1}</span>${esc(line)}</li>`).join('');
  $('budget-label').textContent = `本次上限 ${task.timeout_seconds} 秒。先确认计划，再调用模型。`;
  const action = task.status === 'awaiting_confirmation' ? 'start' : active ? 'stop' : ['stopped', 'interrupted', 'failed', 'invalid_output'].includes(task.status) ? 'resume' : null;
  $('run-action').hidden = !action;
  $('run-action').disabled = busy || task.status === 'stopping';
  $('run-action').dataset.action = action || '';
  $('run-action').textContent = action === 'start' ? '确认计划并开始' : action === 'stop' ? '停止任务' : '继续处理';
  $('action-hint').hidden = action !== 'resume';
  $('action-hint').textContent = action === 'resume' ? '继续会提交新的处理尝试，可能重新调用后端模型；只查看归档无需点击继续。' : '';
  $('record-export').disabled = busy;
  $('progress-summary').textContent = String(task.execution_mode || '').includes('test') ? '本机控制测试：' + (names[task.status] || task.status) + '。记录来自测试替身，不调用模型。' : active ? '任务在后台运行，页面可关闭后重新打开。' : task.data_origin === 'archived_live_run' ? '这是已完成真实调用的归档记录，打开查看不会再次调用模型。' : task.error?.message || (task.status === 'completed' ? '已保存结构化结果、字段检查和实际调用记录。' : '报文与计划已保存。');
  $('simple-result').innerHTML = resultView(task);
  $('result-json').textContent = task.result === null ? '尚无解析结果。' : JSON.stringify(task.result, null, 2);
  $('checks').textContent = task.checks ? task.checks.valid ? '已通过：JSON格式、字段、原文对应和本模式已实现的规则检查。' : (task.checks.errors || []).join('\n') : '检查尚未执行。';
  $('checks').className = 'checks ' + (task.checks ? task.checks.valid ? 'valid' : 'invalid' : 'pending');
  $('review-notes').innerHTML = (task.checks?.warnings || ['按选定模式采用已提供的论文或研究报告规则。']).map((line) => `<li>${esc(line)}</li>`).join('');
  if (task.checks?.normalizations?.length) $('review-notes').innerHTML += task.checks.normalizations.map(item => '<li>' + esc(item.field) + '已按原文整理为“' + esc(item.to) + '”，原始模型返回保留在文件中。</li>').join('');
  $('steps').innerHTML = task.steps.length ? task.steps.map((step) => `<li><b>${esc(step.summary)}</b><small>${esc(names[step.status] || step.status)}</small>${step.tool_calls?.length ? `<details><summary>查看 ${step.tool_calls.length} 次工具调用</summary><pre>${esc(JSON.stringify({ calls: step.tool_calls, results: step.tool_results || [] }, null, 2))}</pre></details>` : ''}</li>`).join('') : '<li>尚未开始运行。</li>';
  $('runtime-detail').textContent = JSON.stringify({ task_id: task.id, notam_id: task.notam_id, parser_type: task.parser_type || 'runway', solution: task.solution, execution_mode: task.execution_mode, runtime_executed: task.runtime_executed, runtime: task.runtime || null, professional_review: task.professional_review, attempts: task.attempts }, null, 2);
  $('downloads').innerHTML = task.attempts.length ? Object.entries(artifactLabels).map(([file, label]) => '<button class="file-download" data-file="' + file + '"><span>' + label + '</span><small>' + file + '</small></button>').join('') : '<p>运行后提供原文、JSON、检查结果和模型调用记录。</p>';
  const references = actualReferences(task);
  $('runtime-sources').innerHTML = references.length ? '<p class="muted">以下' + references.length + '条来自本次notam_reference工具的实际返回；属于来源摘要。</p>' + references.map(referenceView).join('') : '<p class="muted">本次运行记录未提供可展示的资料返回。可到执行过程查看原始工具记录；不把下方资料检索当作本次引用。</p>';
  showTab(tab);
  document.querySelectorAll('details.technical').forEach(detail=>{detail.open=readingMode==='professional';});
}

function showTab(selected) {
  tab = selected;
  document.querySelectorAll('[data-tab]').forEach((button) => { const on = button.dataset.tab === tab; button.classList.toggle('active', on); button.setAttribute('aria-selected', String(on)); button.tabIndex = on ? 0 : -1; });
  document.querySelectorAll('[data-pane]').forEach((pane) => { pane.hidden = pane.dataset.pane !== tab; });
}

function download(data, name, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function sourceSearch(event) {
  event.preventDefault();
  $('source-results').textContent = '正在查询已收录资料…';
  try {
    const hits = await api('/api/knowledge/search?q=' + encodeURIComponent($('source-query').value));
    $('source-results').innerHTML = hits.length ? hits.map(referenceView).join('') : '<p>已收录资料中未找到对应片段，请更换关键词。此结果不表示整个官方资料库都没有依据。</p>';
  } catch { $('source-results').textContent = '资料查询未连接，请先启动运行服务。'; }
}

$('toggle-navigation').addEventListener('click', () => setNavigation(true));
$('close-navigation').addEventListener('click', () => setNavigation(false));
$('navigation-backdrop').addEventListener('click', () => setNavigation(false));
window.matchMedia('(max-width:760px)').addEventListener('change', () => setNavigation(false, false));
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k') { event.preventDefault();showTasks();$('task-search').focus();return; }
  if ((event.ctrlKey||event.metaKey)&&event.key==='\\') { event.preventDefault();setSidebarCollapsed(!$('app-shell').classList.contains('sidebar-collapsed'));return; }
  if (!$('app-shell').classList.contains('navigation-open')) return;
  if (event.key === 'Escape') { event.preventDefault(); setNavigation(false); }
  if (event.key === 'Tab') {
    const items = [...$('task-navigation').querySelectorAll('button, input, summary, [tabindex]')].filter((element) => !element.disabled && element.tabIndex !== -1 && element.getClientRects().length);
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
});
$('tabs').addEventListener('keydown', (event) => {
  const buttons = [...$('tabs').querySelectorAll('[data-tab]')];
  const index = buttons.indexOf(event.target);
  if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
  showTab(buttons[next].dataset.tab);
  buttons[next].focus();
});

$('new-task').addEventListener('click', () => showHome());
$('back-home').addEventListener('click', () => showHome());
$('solutions-nav').addEventListener('click', () => showPanel('solutions'));
$('tasks-nav').addEventListener('click', () => showTasks());
$('knowledge-nav').addEventListener('click', () => showPanel('knowledge'));
$('settings-nav').addEventListener('click', () => showPanel('settings'));
$('nav-create').addEventListener('click',newTask);
$('tasks-create').addEventListener('click',newTask);
$('solution-start').addEventListener('click',newTask);
$('solution-example').addEventListener('click',openExample);
$('collapse-sidebar').addEventListener('click',()=>setSidebarCollapsed(!$('app-shell').classList.contains('sidebar-collapsed')));
$('toggle-history').addEventListener('click',()=>setHistoryCollapsed(!$('history-content').hidden));
$('sidebar-search').addEventListener('input',renderTaskLists);
$('task-search').addEventListener('input',renderTaskLists);
$('task-filter').addEventListener('change',renderTaskLists);
$('all-tasks').addEventListener('click',event=>{const button=event.target.closest('[data-task]');if(button)void openTask(button.dataset.task);});
$('home-tasks').addEventListener('click',()=>showTasks());
$('home-knowledge').addEventListener('click',()=>showPanel('knowledge'));
$('home-solutions').addEventListener('click',()=>showPanel('solutions'));
$('home-settings').addEventListener('click',()=>showPanel('settings'));
$('open-task-search').addEventListener('click',()=>{showTasks();$('task-search').focus();});
$('quick-filters').addEventListener('click',event=>{const button=event.target.closest('[data-task-filter]');if(button)showTasks(button.dataset.taskFilter);});
$('library-form').addEventListener('submit',event=>{event.preventDefault();void loadLibrary();});
$('library-clear').addEventListener('click',()=>{$('library-query').value='';void loadLibrary();});
$('test-connection').addEventListener('click',async()=>{await refresh();message(online?'运行服务连接正常。':'未能连接运行服务，请检查地址和服务器状态。',!online);});
$('reading-mode').addEventListener('change',()=>{readingMode=$('reading-mode').value;localStorage.setItem('szh-reading-mode',readingMode);message('已保存阅读方式，下次打开结果时生效。');});
$('start-aviation').addEventListener('click', newTask);
$('open-example').addEventListener('click',openExample);
$('recent-tasks').addEventListener('click', (event) => { const button = event.target.closest('[data-task]'); if (button) void openTask(button.dataset.task); });
$('task-list').addEventListener('click', (event) => { const button = event.target.closest('[data-task]'); if (button) void openTask(button.dataset.task); });
$('create-form').addEventListener('submit', createTask);
$('load-sample').addEventListener('click', () => { $('goal').value = sample; message('已填入论文附录公开样例，可编辑后生成计划。'); });
$('import-file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 100000) { message('请选择不超过100KB的文本报文。', true); return; }
  $('goal').value = await file.text(); message(`已读取 ${file.name}，生成计划时发送至运行服务。`); event.target.value = '';
});
$('run-action').addEventListener('click', () => void operate($('run-action').dataset.action));
$('refresh').addEventListener('click', () => void refresh());
$('tabs').addEventListener('click', (event) => { const button = event.target.closest('[data-tab]'); if (button) showTab(button.dataset.tab); });
$('record-export').addEventListener('click', () => { if (current) download(JSON.stringify(current, null, 2), `task-${current.id}.json`); });
$('downloads').addEventListener('click', (event) => {
  const button = event.target.closest('[data-file]');
  if (button) void downloadArtifact(button.dataset.file, button);
});
$('source-form').addEventListener('submit', sourceSearch);
$('settings-form').addEventListener('submit', (event) => {
  event.preventDefault();
  try { const url = new URL($('service-url').value); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(); base = url.href.replace(/\/$/, ''); localStorage.setItem('szh-service', base); void refresh(); message('已保存服务地址，正在连接…'); }
  catch { message('请输入有效的运行服务网址。', true); }
});
$('service-url').value = base;
$('reading-mode').value=readingMode;
setSidebarCollapsed(localStorage.getItem('szh-sidebar-collapsed')==='true');
setHistoryCollapsed(localStorage.getItem('szh-history-collapsed')==='true');
showHome(false);
void refresh();
setInterval(() => { if (!document.hidden) void refresh(); }, 1800);
