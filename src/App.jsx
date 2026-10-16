import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Archive, BookOpen, Check, CheckCircle2, ChevronRight, ClipboardCheck,
  Building2, Clock3, Download, FileCheck2, FilePlus2, Files, LayoutDashboard, ListChecks, Menu,
  Plus, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, Upload, UserRound,
  X, XCircle,
} from "lucide-react";
import { api, download, setCurrentProject, setCurrentUser } from "./api.js";

const navItems = [
  ["dashboard", "总览", LayoutDashboard],
  ["inspections", "检查记录", ClipboardCheck],
  ["hazards", "隐患台账", AlertTriangle],
  ["rules", "受控知识库", BookOpen],
  ["audit", "审计追溯", Archive],
];

const inspectionStatus = { draft: "草稿", review: "待审核", returned: "已退回", approved: "已批准" };
const roleLabels = { admin: "责任部门管理员", officer: "项目安全员", reviewer: "项目安全负责人" };
const statusTone = { draft: "muted", review: "warn", returned: "danger", approved: "success", pending: "warn", rectifying: "info", recheck: "accent", closed: "success" };

function formatDate(value, withTime = false) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", withTime ? { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" } : { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function Badge({ children, tone = "muted" }) { return <span className={`badge ${tone}`}>{children}</span>; }
function Empty({ icon: Icon = Files, title, text }) { return <div className="empty"><Icon size={34}/><strong>{title}</strong><span>{text}</span></div>; }

function App() {
  const [page, setPage] = useState("dashboard");
  const [hazardFilter, setHazardFilter] = useState("all");
  const [bootstrap, setBootstrap] = useState(null);
  const [user, setUser] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [toast, setToast] = useState(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);

  async function loadBootstrap() {
    const data = await api("/bootstrap");
    setCurrentProject(data.project.id);
    setBootstrap(data);
    setUser(data.currentUser);
  }
  useEffect(() => { loadBootstrap().catch(showError); }, []);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 3200); return () => clearTimeout(id); }, [toast]);

  function showError(error) {
    const blockers = error.data?.blockers?.join("；");
    setToast({ type: "error", text: blockers ? `${error.message}：${blockers}` : error.message });
  }
  function notify(text) { setToast({ type: "success", text }); }
  function refresh() { setRefreshKey((v) => v + 1); }
  function navigate(target, options = {}) {
    if (target === "hazards") setHazardFilter(options.filter || "all");
    setPage(target);
    setMobileNav(false);
  }
  async function changeUser(id) {
    setCurrentUser(id);
    const next = bootstrap.users.find((item) => item.id === Number(id));
    setUser(next);
    setDeletingProject(false);
    notify(`已切换为${roleLabels[next.role]}：${next.name}`);
    refresh();
  }
  async function changeProject(id) {
    setCurrentProject(id);
    try {
      await loadBootstrap();
      setCreatingProject(false);
      setDeletingProject(false);
      setPage("dashboard");
      setHazardFilter("all");
      refresh();
    } catch (error) { showError(error); }
  }
  async function projectCreated(project) {
    setCurrentProject(project.id);
    await loadBootstrap();
    setCreatingProject(false);
    setPage("dashboard");
    setHazardFilter("all");
    refresh();
    notify(`项目“${project.name}”已创建`);
  }
  async function projectDeleted(nextProject) {
    setCurrentProject(nextProject.id);
    await loadBootstrap();
    setDeletingProject(false);
    setPage("dashboard");
    setHazardFilter("all");
    refresh();
    notify("空项目已删除");
  }

  if (!bootstrap || !user) return <div className="splash"><ShieldCheck/><span>安全 Agent 正在启动</span></div>;
  const title = navItems.find(([id]) => id === page)?.[1];
  const pageProps = { user, refreshKey, refresh, notify, showError, project: bootstrap.project };

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
      <div className="brand"><div className="brand-mark"><ShieldCheck size={22}/></div><div><strong>安全生产管理</strong><span>安全生产记录辅助</span></div></div>
      <nav>{navItems.map(([id, label, Icon]) => <button key={id} className={page === id ? "active" : ""} onClick={() => navigate(id)}><Icon size={18}/><span>{label}</span>{page === id && <ChevronRight size={15}/>}</button>)}</nav>
      <div className="sidebar-foot"><span>受控规则运行</span><strong><i/> 企业内网模式</strong></div>
    </aside>
    {mobileNav && <button className="nav-backdrop" onClick={() => setMobileNav(false)}/>}
    <main>
      <header className="topbar">
        <div className="title-wrap"><button className="icon-btn mobile-menu" onClick={() => setMobileNav(true)} title="打开导航"><Menu/></button><div><div className="project-switch"><Building2/><select value={bootstrap.project.id} onChange={(event) => changeProject(event.target.value)} aria-label="当前项目">{bootstrap.projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{user.role === "admin" && <button className="text-btn project-create" onClick={() => setCreatingProject(true)}><Plus/>新建项目</button>}{user.role === "admin" && bootstrap.projects.length > 1 && <button className="project-delete" onClick={() => setDeletingProject(true)} title="删除当前项目" aria-label="删除当前项目"><Trash2/></button>}</div><h1>{title}</h1></div></div>
        <div className="top-actions">
          <button className="icon-btn" onClick={refresh} title="刷新数据"><RefreshCw size={18}/></button>
          <div className="user-switch"><UserRound size={17}/><div><small>{roleLabels[user.role]}</small><select value={user.id} onChange={(event) => changeUser(event.target.value)}>{bootstrap.users.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div></div>
        </div>
      </header>
      <div className="content">
        {page === "dashboard" && <Dashboard {...pageProps} navigate={navigate}/>} 
        {page === "inspections" && <Inspections {...pageProps}/>} 
        {page === "hazards" && <Hazards {...pageProps} initialFilter={hazardFilter}/>} 
        {page === "rules" && <Rules {...pageProps}/>} 
        {page === "audit" && <Audit {...pageProps}/>} 
      </div>
    </main>
    {creatingProject && <ProjectForm onClose={() => setCreatingProject(false)} onCreated={projectCreated} showError={showError}/>}
    {deletingProject && <DeleteProjectModal project={bootstrap.project} onClose={() => setDeletingProject(false)} onDeleted={projectDeleted} showError={showError}/>}
    {toast && <div className={`toast ${toast.type}`}><span>{toast.type === "error" ? <XCircle/> : <CheckCircle2/>}</span>{toast.text}<button onClick={() => setToast(null)}><X/></button></div>}
  </div>;
}

function DeleteProjectModal({ project, onClose, onDeleted, showError }) {
  const [busy, setBusy] = useState(false);
  async function remove() {
    setBusy(true);
    try {
      const result = await api(`/projects/${project.id}`, { method: "DELETE" });
      await onDeleted(result.nextProject);
    } catch (error) { showError(error); }
    finally { setBusy(false); }
  }
  return <Modal title="删除项目" onClose={onClose}><div className="form-stack"><Notice tone="danger" title="仅可删除空项目">已有检查记录的项目属于安全管理档案，系统将禁止删除。</Notice><div className="project-delete-summary"><strong>{project.name}</strong><span>{project.code} · {project.location}</span></div><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>取消</button><button type="button" className="danger-button" disabled={busy} onClick={remove}><Trash2/>{busy ? "删除中" : "确认删除"}</button></div></div></Modal>;
}

function ProjectForm({ onClose, onCreated, showError }) {
  const [form, setForm] = useState({ name: "", code: "", location: "" });
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const created = await api("/projects", { method: "POST", body: JSON.stringify(form) });
      await onCreated(created);
    } catch (error) { showError(error); }
    finally { setBusy(false); }
  }
  return <Modal title="新建项目" onClose={onClose}><form className="form-stack" onSubmit={submit}><Field label="项目名称" required><input autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例如：滨江科创中心二期项目"/></Field><div className="form-grid"><Field label="项目编号" required><input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder="例如：BJ-2026-02"/></Field><Field label="项目地点" required><input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="项目所在区或详细地址"/></Field></div><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>取消</button><button className="primary" disabled={busy}><Plus/>{busy ? "创建中" : "创建项目"}</button></div></form></Modal>;
}

function Dashboard({ refreshKey, showError, navigate }) {
  const [data, setData] = useState(null);
  useEffect(() => { api("/dashboard").then(setData).catch(showError); }, [refreshKey]);
  if (!data) return <Loading/>;
  const cards = [
    ["检查记录", data.totals.inspections, ClipboardCheck, "neutral", "inspections"],
    ["隐患总数", data.totals.hazards, AlertTriangle, "amber", "hazards", "all"],
    ["待审核", data.totals.pendingReview, FileCheck2, "blue", "inspections"],
    ["逾期隐患", data.totals.overdue, Clock3, "red", "hazards", "overdue"],
    ["整改闭环率", `${data.totals.closureRate}%`, CheckCircle2, "green", "hazards", "closed"],
  ];
  const statusFilters = { "待整改": "pending", "整改中": "rectifying", "待复查": "recheck", "已关闭": "closed" };
  const maxDept = Math.max(1, ...Object.values(data.byDepartment));
  return <div className="page-stack">
    <section className="metric-grid">{cards.map(([label, value, Icon, tone, target, filter]) => <button className={`metric ${tone}`} key={label} onClick={() => navigate(target, { filter })} title={`查看${label}明细`}><div><span>{label}</span><strong>{value}</strong></div><Icon/></button>)}</section>
    <section className="dashboard-grid">
      <article className="panel"><div className="panel-head"><div><span className="eyebrow">整改进度</span><h2>隐患状态分布</h2></div><Badge tone={data.totals.dueSoon ? "warn" : "success"}>{data.totals.dueSoon} 项临期</Badge></div>
        <div className="status-rings">{Object.entries(data.byStatus).map(([label, value], index) => <button key={label} className={`ring r${index}`} style={{ "--percent": data.totals.hazards ? `${value / data.totals.hazards * 100}%` : "0%" }} onClick={() => navigate("hazards", { filter: statusFilters[label] })} title={`查看${label}隐患`}><div><strong>{value}</strong><span>{label}</span></div></button>)}</div>
      </article>
      <article className="panel"><div className="panel-head"><div><span className="eyebrow">责任分布</span><h2>责任部门隐患数</h2></div></div>
        <div className="bar-list">{Object.entries(data.byDepartment).length ? Object.entries(data.byDepartment).map(([label, value]) => <button key={label} onClick={() => navigate("hazards")} title={`查看${label}隐患`}><span>{label}</span><div><i style={{ width: `${value / maxDept * 100}%` }}/></div><strong>{value}</strong></button>) : <Empty title="暂无隐患" text="创建检查记录后在这里查看责任分布"/>}</div>
      </article>
    </section>
    <section className="panel"><div className="panel-head"><div><span className="eyebrow">近期活动</span><h2>检查记录</h2></div></div>
      {data.recent.length ? <div className="compact-list">{data.recent.map((item) => <button key={item.id} onClick={() => navigate("inspections")} title={`查看${item.record_no}`}><div className="record-icon"><ClipboardCheck/></div><div><strong>{item.record_no}</strong><span>{item.type} · {item.location}</span></div><span>{item.creator_name}</span><span>{formatDate(item.updated_at, true)}</span><Badge tone={statusTone[item.status]}>{inspectionStatus[item.status]}</Badge></button>)}</div> : <Empty title="暂无检查记录" text="由项目安全员创建第一份检查记录"/>}
    </section>
  </div>;
}

function Inspections({ user, refreshKey, refresh, notify, showError }) {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const load = () => api("/inspections").then(setItems).catch(showError);
  useEffect(() => { load(); }, [refreshKey]);
  const filtered = items.filter((item) => `${item.record_no}${item.location}${item.type}`.toLowerCase().includes(query.toLowerCase()));
  async function openItem(id) { try { setSelected(await api(`/inspections/${id}`)); } catch (e) { showError(e); } }
  async function action(path, body, message) { try { await api(path, { method: "POST", body: JSON.stringify(body || {}) }); notify(message); setSelected(null); load(); refresh(); } catch (e) { showError(e); } }
  return <div className="page-stack">
    <div className="toolbar"><div className="search"><Search/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索编号、类型或检查部位"/></div><div className="toolbar-actions"><button className="secondary" onClick={() => download("/hazards/export")}><Download/>导出台账</button>{user.role === "officer" && <button className="primary" onClick={() => setCreating(true)}><Plus/>新建检查</button>}</div></div>
    <section className="table-panel"><table><thead><tr><th>记录编号</th><th>类型 / 部位</th><th>检查日期</th><th>隐患</th><th>编制人</th><th>状态</th><th/></tr></thead><tbody>{filtered.map((item) => <tr key={item.id} onClick={() => openItem(item.id)}><td><strong>{item.record_no}</strong><small>V{item.version}</small></td><td><strong>{item.type}</strong><small>{item.location}</small></td><td>{formatDate(item.inspection_date)}</td><td>{item.hazard_count} 项</td><td>{item.creator_name}</td><td><Badge tone={statusTone[item.status]}>{inspectionStatus[item.status]}</Badge></td><td><ChevronRight/></td></tr>)}</tbody></table>{!filtered.length && <Empty title="没有匹配记录" text="调整搜索条件或创建新的检查记录"/>}</section>
    {creating && <InspectionForm onClose={() => setCreating(false)} onCreated={(record) => { setCreating(false); setSelected(record); load(); refresh(); notify("检查记录草稿已生成"); }} showError={showError}/>} 
    {selected && <Drawer title="检查记录详情" onClose={() => setSelected(null)}>
      <div className="drawer-hero"><div><span>{selected.record_no} · V{selected.version}</span><h2>{selected.type}</h2><p>{selected.location} · {formatDate(selected.inspection_date)}</p></div><Badge tone={statusTone[selected.status]}>{inspectionStatus[selected.status]}</Badge></div>
      {(selected.missing_fields.length > 0 || selected.conflicts.length > 0) && <Notice tone="danger" title="尚不能送审">{[...selected.missing_fields, ...selected.conflicts].join("、")}</Notice>}
      <Detail label="参加人员" value={selected.participants}/><Detail label="检查事实" value={selected.facts}/>
      <AttachmentBox entityType="inspection" entityId={selected.id} user={user} notify={notify} showError={showError}/>
      <div className="section-title"><h3>隐患及措施</h3><span>{selected.hazards.length} 项</span></div>
      {selected.hazards.length ? selected.hazards.map((h) => <article className="hazard-card" key={h.id}><div><strong>{h.code}</strong><Badge tone={h.suggested_level === "重大隐患" ? "danger" : h.suggested_level === "待人工确认" ? "warn" : "muted"}>{h.confirmed_level || h.suggested_level}</Badge></div><p>{h.description}</p><dl><div><dt>依据</dt><dd>{h.clause}</dd></div><div><dt>措施</dt><dd>{h.measure}</dd></div><div><dt>责任</dt><dd>{h.department} · {h.owner} · {h.due_date || "期限待确认"}</dd></div></dl></article>) : <Empty title="未记录隐患" text="本次检查事实中没有添加隐患项"/>}
      {selected.review_comment && <Notice title="审核意见">{selected.review_comment}</Notice>}
      <div className="drawer-actions">
        {user.role === "officer" && ["draft","returned"].includes(selected.status) && <button className="primary" onClick={() => action(`/inspections/${selected.id}/submit`, {}, "已提交项目安全负责人审核")}><FileCheck2/>提交审核</button>}
        {user.role === "officer" && selected.status === "approved" && <button className="secondary" onClick={() => action(`/inspections/${selected.id}/revise`, {}, "已创建新的修订草稿")}><FilePlus2/>创建修订版</button>}
        {user.role === "reviewer" && selected.status === "review" && <><button className="secondary danger-text" onClick={() => { const comment = window.prompt("请输入退回意见"); if (comment) action(`/inspections/${selected.id}/review`, { decision: "return", comment }, "检查记录已退回"); }}><XCircle/>退回</button><button className="primary" onClick={() => action(`/inspections/${selected.id}/review`, { decision: "approve", comment: "审核通过" }, "检查记录已批准")}><Check/>批准</button></>}
        {selected.status === "approved" && <button className="secondary" onClick={() => download(`/inspections/${selected.id}/export`)}><Download/>正式 Word</button>}
      </div>
    </Drawer>}
  </div>;
}

function InspectionForm({ onClose, onCreated, showError }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ type: "日常检查", inspection_date: today, location: "", participants: "", facts: "", hazards: [] });
  const [busy, setBusy] = useState(false);
  function field(key, value) { setForm((prev) => ({ ...prev, [key]: value })); }
  function addHazard() { field("hazards", [...form.hazards, { location: form.location, description: "", department: "", owner: "", due_date: "", confirmed_level: "" }]); }
  function updateHazard(index, key, value) { field("hazards", form.hazards.map((item, i) => i === index ? { ...item, [key]: value } : item)); }
  function sample() { setForm({ type: "专项检查", inspection_date: today, location: "2#楼三层东侧", participants: "陈工、王班组长", facts: "对临边防护和临时用电开展专项检查。现场人员作业秩序正常，发现一处临边防护栏杆缺失。", hazards: [{ location: "2#楼三层东侧临边", description: "临边防护栏杆缺失，存在人员坠落风险", department: "施工管理部", owner: "王班组长", due_date: new Date(Date.now() + 5 * 86400000).toISOString().slice(0,10), confirmed_level: "一般隐患" }] }); }
  async function submit(e) { e.preventDefault(); setBusy(true); try { onCreated(await api("/inspections", { method: "POST", body: JSON.stringify(form) })); } catch (err) { showError(err); } finally { setBusy(false); } }
  return <Modal title="新建安全检查" onClose={onClose} wide><form onSubmit={submit} className="form-stack"><div className="form-banner"><Sparkles/><div><strong>受控规则辅助生成</strong><span>系统只补充建议级别、依据和措施，不补写现场事实。</span></div><button type="button" className="text-btn" onClick={sample}>填入示例</button></div>
    <div className="form-grid"><Field label="检查类型"><select value={form.type} onChange={(e) => field("type", e.target.value)}><option>日常检查</option><option>专项检查</option></select></Field><Field label="检查日期" required><input type="date" value={form.inspection_date} onChange={(e) => field("inspection_date", e.target.value)}/></Field><Field label="检查部位" required><input value={form.location} onChange={(e) => field("location", e.target.value)} placeholder="楼栋、楼层或作业区域"/></Field><Field label="参加人员" required><input value={form.participants} onChange={(e) => field("participants", e.target.value)} placeholder="以顿号分隔"/></Field></div>
    <Field label="检查事实" required><textarea rows="4" value={form.facts} onChange={(e) => field("facts", e.target.value)} placeholder="仅描述现场已确认事实，不写推测性结论"/></Field>
    <div className="section-title"><div><h3>已确认隐患</h3><p>Agent 将根据描述匹配当前有效规则</p></div><button type="button" className="secondary small" onClick={addHazard}><Plus/>添加隐患</button></div>
    {form.hazards.map((hazard, index) => <div className="hazard-form" key={index}><div className="hazard-form-head"><strong>隐患 {index + 1}</strong><button type="button" className="icon-btn" onClick={() => field("hazards", form.hazards.filter((_, i) => i !== index))}><X/></button></div><div className="form-grid"><Field label="位置"><input value={hazard.location} onChange={(e) => updateHazard(index,"location",e.target.value)}/></Field><Field label="确认级别"><select value={hazard.confirmed_level} onChange={(e) => updateHazard(index,"confirmed_level",e.target.value)}><option value="">待安全员确认</option><option>一般隐患</option><option>重大隐患</option></select></Field></div><Field label="隐患事实" required><textarea rows="2" value={hazard.description} onChange={(e) => updateHazard(index,"description",e.target.value)}/></Field><div className="form-grid three"><Field label="责任部门"><input value={hazard.department} onChange={(e) => updateHazard(index,"department",e.target.value)}/></Field><Field label="责任人"><input value={hazard.owner} onChange={(e) => updateHazard(index,"owner",e.target.value)}/></Field><Field label="整改期限"><input type="date" value={hazard.due_date} onChange={(e) => updateHazard(index,"due_date",e.target.value)}/></Field></div></div>)}
    {!form.hazards.length && <div className="no-hazard"><CheckCircle2/><span>本次检查可记录为无隐患</span></div>}
    <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>取消</button><button className="primary" disabled={busy}><Sparkles/>{busy ? "生成中" : "生成检查草稿"}</button></div>
  </form></Modal>;
}

function Hazards({ user, refreshKey, refresh, notify, showError, initialFilter = "all" }) {
  const [items, setItems] = useState([]); const [selected, setSelected] = useState(null); const [filter, setFilter] = useState(initialFilter);
  const load = () => api("/hazards").then(setItems).catch(showError); useEffect(() => { load(); }, [refreshKey]);
  const filtered = items.filter((h) => filter === "all" || h.status === filter || h.timing === filter);
  async function saveHazard(body) { try { const updated = await api(`/hazards/${selected.id}`, { method: "PATCH", body: JSON.stringify(body) }); setSelected(updated); load(); refresh(); notify("整改信息已更新"); } catch (e) { showError(e); } }
  async function post(path, body, text) { try { await api(path, { method: "POST", body: JSON.stringify(body) }); setSelected(null); load(); refresh(); notify(text); } catch (e) { showError(e); } }
  return <div className="page-stack"><div className="toolbar"><div className="segment">{[["all","全部"],["pending","待整改"],["rectifying","整改中"],["recheck","待复查"],["overdue","已逾期"],["closed","已关闭"]].map(([id,label]) => <button key={id} onClick={() => setFilter(id)} className={filter === id ? "active" : ""}>{label}</button>)}</div><button className="secondary" onClick={() => download("/hazards/export")}><Download/>导出 Excel</button></div>
    <section className="table-panel"><table><thead><tr><th>隐患编号 / 来源</th><th>隐患描述</th><th>级别</th><th>责任与期限</th><th>状态</th><th/></tr></thead><tbody>{filtered.map((h) => <tr key={h.id} onClick={() => setSelected(h)}><td><strong>{h.code}</strong><small>{h.record_no}</small></td><td className="wide-cell"><strong>{h.description}</strong><small>{h.location} · {h.category}</small></td><td><Badge tone={(h.confirmed_level || h.suggested_level) === "重大隐患" ? "danger" : "muted"}>{h.confirmed_level || h.suggested_level}</Badge></td><td><strong>{h.department} · {h.owner}</strong><small className={h.timing === "overdue" ? "danger-text" : ""}>{h.due_date} · {h.timing_label}</small></td><td><Badge tone={statusTone[h.status]}>{h.status_label}</Badge></td><td><ChevronRight/></td></tr>)}</tbody></table>{!filtered.length && <Empty title="暂无隐患" text="当前筛选条件下没有隐患记录"/>}</section>
    {selected && <HazardDrawer hazard={selected} user={user} onClose={() => setSelected(null)} onSave={saveHazard} onPost={post} notify={notify} showError={showError}/>}</div>;
}

function HazardDrawer({ hazard, user, onClose, onSave, onPost, notify, showError }) {
  const [form, setForm] = useState({ confirmed_level: hazard.confirmed_level || "", measure: hazard.measure, department: hazard.department, owner: hazard.owner, due_date: hazard.due_date, rectification_note: hazard.rectification_note || "" });
  return <Drawer title="隐患整改详情" onClose={onClose}><div className="drawer-hero"><div><span>{hazard.code} · 来源 {hazard.record_no}</span><h2>{hazard.category}</h2><p>{hazard.location}</p></div><Badge tone={statusTone[hazard.status]}>{hazard.status_label}</Badge></div>
    {hazard.timing !== "normal" && <Notice tone={hazard.timing === "overdue" ? "danger" : "warn"} title={hazard.timing_label}>整改期限：{hazard.due_date}</Notice>}
    <Detail label="隐患事实" value={hazard.description}/><Detail label="受控依据" value={hazard.clause}/>
    <div className="trace-box"><strong>来源追溯</strong>{hazard.source_refs.map((ref) => <span key={ref}><Check size={14}/>{ref}</span>)}</div>
    <AttachmentBox entityType="hazard" entityId={hazard.id} user={user} notify={notify} showError={showError}/>
    {user.role === "officer" && hazard.status !== "closed" ? <div className="form-stack compact"><div className="form-grid"><Field label="确认级别"><select value={form.confirmed_level} onChange={(e) => setForm({...form,confirmed_level:e.target.value})}><option value="">待确认</option><option>一般隐患</option><option>重大隐患</option></select></Field><Field label="整改期限"><input type="date" value={form.due_date} onChange={(e) => setForm({...form,due_date:e.target.value})}/></Field><Field label="责任部门"><input value={form.department} onChange={(e) => setForm({...form,department:e.target.value})}/></Field><Field label="责任人"><input value={form.owner} onChange={(e) => setForm({...form,owner:e.target.value})}/></Field></div><Field label="整改措施"><textarea rows="3" value={form.measure} onChange={(e) => setForm({...form,measure:e.target.value})}/></Field><Field label="整改说明"><textarea rows="3" value={form.rectification_note} onChange={(e) => setForm({...form,rectification_note:e.target.value})} placeholder="记录已完成的整改动作及证据编号"/></Field><div className="drawer-actions"><button className="secondary" onClick={() => onSave({...form,status:"rectifying"})}>保存整改进度</button>{["pending","rectifying"].includes(hazard.status) && <button className="primary" onClick={() => onPost(`/hazards/${hazard.id}/submit-recheck`, { rectificationNote: form.rectification_note, evidence: form.rectification_note ? ["整改说明已记录，现场照片待归档"] : [] }, "已提交负责人复查")}><FileCheck2/>提交复查</button>}</div></div> : <><Detail label="整改措施" value={hazard.measure}/><Detail label="整改说明" value={hazard.rectification_note || "尚未填写"}/></>}
    {user.role === "reviewer" && hazard.status === "recheck" && <div className="drawer-actions"><button className="secondary danger-text" onClick={() => { const result = window.prompt("请输入复查退回原因"); if (result) onPost(`/hazards/${hazard.id}/review`, { decision: "return", result }, "已退回继续整改"); }}><XCircle/>退回整改</button><button className="primary" onClick={() => { const result = window.prompt("请输入复查结论", "现场复查合格，同意关闭"); if (result) onPost(`/hazards/${hazard.id}/review`, { decision: "close", result }, "隐患已复查关闭"); }}><CheckCircle2/>复查关闭</button></div>}
    {hazard.review_result && <Notice tone="success" title="复查结论">{hazard.review_result}</Notice>}
  </Drawer>;
}

function Rules({ user, refreshKey, refresh, notify, showError }) {
  const [items, setItems] = useState([]); const [documents, setDocuments] = useState([]); const [creating, setCreating] = useState(false); const [uploading, setUploading] = useState(false);
  const load = () => Promise.all([api("/rules"), api("/knowledge-documents")]).then(([rules, docs]) => { setItems(rules); setDocuments(docs); }).catch(showError); useEffect(() => { load(); }, [refreshKey]);
  async function toggle(item) { try { await api(`/rules/${item.id}/toggle`, { method: "PATCH" }); notify(item.is_active ? "规则已停用" : "规则已启用"); load(); refresh(); } catch(e) { showError(e); } }
  async function toggleDocument(item) { try { await api(`/knowledge-documents/${item.id}/toggle`, { method: "PATCH" }); notify(item.is_active ? "管理制度已停用" : "管理制度已启用"); load(); refresh(); } catch(e) { showError(e); } }
  function openUpload() { if (user.role === "admin") setUploading(true); else notify("请切换至责任部门管理员后上传管理制度"); }
  return <div className="page-stack"><div className="toolbar"><div className="toolbar-copy"><strong>当前有效规则 {items.filter((i) => i.is_active).length} 条</strong><span>Agent 只使用已发布且启用的受控版本</span></div><div className="toolbar-actions"><button className="secondary" onClick={openUpload}><Upload/>上传管理制度</button>{user.role === "admin" && <button className="primary" onClick={() => setCreating(true)}><Plus/>发布规则</button>}</div></div>
    <section className="document-panel"><div className="panel-head"><div><span className="eyebrow">制度文件</span><h2>安全生产管理制度</h2></div><Badge tone={documents.filter((item) => item.is_active).length ? "success" : "muted"}>{documents.filter((item) => item.is_active).length} 份有效</Badge></div>{documents.length ? <div className="document-list">{documents.map((item) => <article key={item.id} className={!item.is_active ? "disabled" : ""}><div className="document-icon"><Files/></div><div><div><strong>{item.title}</strong><Badge tone={item.is_active ? "success" : "muted"}>{item.is_active ? "当前有效" : "已停用"}</Badge></div><span>{item.version} · {item.effective_date} 生效 · {item.publisher} 发布</span><small>{item.file_name} · {(item.size / 1024).toFixed(1)} KB</small></div><div className="document-actions"><button className="icon-btn" onClick={() => download(`/knowledge-documents/${item.id}/download`)} title="下载制度文件"><Download/></button>{user.role === "admin" && <button className={`toggle ${item.is_active ? "on" : ""}`} onClick={() => toggleDocument(item)} title={item.is_active ? "停用制度" : "启用制度"}><i/></button>}</div></article>)}</div> : <Empty title="尚未上传管理制度" text="通过上方入口上传责任部门确认的受控文件"/>}</section>
    <div className="rule-grid">{items.map((item) => <article className={`rule-card ${!item.is_active ? "disabled" : ""}`} key={item.id}><div className="rule-top"><div className="rule-icon"><BookOpen/></div><div><Badge tone={item.is_active ? "success" : "muted"}>{item.is_active ? "当前有效" : "已停用"}</Badge><small>{item.type}</small></div>{user.role === "admin" && <button className={`toggle ${item.is_active ? "on" : ""}`} onClick={() => toggle(item)} title={item.is_active ? "停用规则" : "启用规则"}><i/></button>}</div><h3>{item.title}</h3><p>{item.version} · {item.clause}</p><dl><div><dt>建议级别</dt><dd>{item.suggested_level}</dd></div><div><dt>匹配关键词</dt><dd>{item.keywords.join("、")}</dd></div><div><dt>发布信息</dt><dd>{item.publisher} · {item.effective_date} 生效</dd></div></dl></article>)}</div>
    {creating && <RuleForm onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); refresh(); notify("受控规则已发布"); }} showError={showError}/>} 
    {uploading && <KnowledgeUploadForm onClose={() => setUploading(false)} onCreated={() => { setUploading(false); load(); refresh(); notify("安全生产管理制度已上传并发布"); }} showError={showError}/>}</div>;
}

function KnowledgeUploadForm({ onClose, onCreated, showError }) {
  const [form, setForm] = useState({ title: "", version: "", effectiveDate: new Date().toISOString().slice(0, 10), file: null });
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (!form.file) return showError(new Error("请选择制度文件"));
    const body = new FormData(); body.append("title", form.title); body.append("version", form.version); body.append("effectiveDate", form.effectiveDate); body.append("file", form.file);
    setBusy(true);
    try { await api("/knowledge-documents", { method: "POST", body }); onCreated(); }
    catch (error) { showError(error); }
    finally { setBusy(false); }
  }
  return <Modal title="上传安全生产管理制度" onClose={onClose}><form className="form-stack" onSubmit={submit}><Notice title="受控文件要求">上传后默认启用，Agent 仅引用当前有效版本；旧版本可由管理员停用。</Notice><Field label="制度名称" required><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="例如：项目安全生产管理制度"/></Field><div className="form-grid"><Field label="版本" required><input value={form.version} onChange={(event) => setForm({ ...form, version: event.target.value })} placeholder="例如：QHSE-2026-A"/></Field><Field label="生效日期" required><input type="date" value={form.effectiveDate} onChange={(event) => setForm({ ...form, effectiveDate: event.target.value })}/></Field></div><Field label="制度文件" required><label className="file-picker"><Upload/><div><strong>{form.file?.name || "选择 PDF、Word 或 Excel 文件"}</strong><span>单个文件不超过 20 MB</span></div><input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" onChange={(event) => setForm({ ...form, file: event.target.files?.[0] || null })}/></label></Field><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>取消</button><button className="primary" disabled={busy}><Upload/>{busy ? "上传中" : "上传并发布"}</button></div></form></Modal>;
}

function RuleForm({ onClose, onCreated, showError }) {
  const [form,setForm] = useState({ title:"",version:"",effectiveDate:new Date().toISOString().slice(0,10),type:"企业制度",clause:"",keywords:"",category:"",suggestedLevel:"一般隐患",measure:"" });
  async function submit(e) { e.preventDefault(); try { await api("/rules", { method:"POST", body:JSON.stringify({...form,keywords:form.keywords.split(/[、,，]/).map((v)=>v.trim()).filter(Boolean)}) }); onCreated(); } catch(err) { showError(err); } }
  return <Modal title="发布受控规则" onClose={onClose}><form className="form-stack" onSubmit={submit}><Field label="规则名称" required><input value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})}/></Field><div className="form-grid"><Field label="版本" required><input value={form.version} onChange={(e)=>setForm({...form,version:e.target.value})}/></Field><Field label="生效日期" required><input type="date" value={form.effectiveDate} onChange={(e)=>setForm({...form,effectiveDate:e.target.value})}/></Field><Field label="类型"><select value={form.type} onChange={(e)=>setForm({...form,type:e.target.value})}><option>企业制度</option><option>安全检查标准</option><option>隐患分级规则</option></select></Field><Field label="条款"><input value={form.clause} onChange={(e)=>setForm({...form,clause:e.target.value})}/></Field><Field label="隐患类别"><input value={form.category} onChange={(e)=>setForm({...form,category:e.target.value})}/></Field><Field label="建议级别"><select value={form.suggestedLevel} onChange={(e)=>setForm({...form,suggestedLevel:e.target.value})}><option>一般隐患</option><option>重大隐患</option></select></Field></div><Field label="匹配关键词" required><input value={form.keywords} onChange={(e)=>setForm({...form,keywords:e.target.value})} placeholder="使用顿号分隔"/></Field><Field label="标准整改措施" required><textarea rows="4" value={form.measure} onChange={(e)=>setForm({...form,measure:e.target.value})}/></Field><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>取消</button><button className="primary"><Check/>发布并启用</button></div></form></Modal>;
}

function Audit({ refreshKey, showError, notify }) {
  const [items,setItems] = useState([]); const [exporting, setExporting] = useState(false); useEffect(()=>{api("/audit").then(setItems).catch(showError)},[refreshKey]);
  return <div className="page-stack"><div className="toolbar"><div className="toolbar-copy"><strong>全过程操作记录</strong><span>生成、审核、整改、复查、规则和导出操作均可追溯</span></div><button className="primary" onClick={() => setExporting(true)}><ListChecks/>选择导出台账</button></div><section className="timeline-panel">{items.length ? <div className="timeline">{items.map((item)=><div key={item.id}><i/><div className="timeline-time">{formatDate(item.created_at,true)}</div><article><div><strong>{item.action}</strong><Badge>{item.entity_type} #{item.entity_id}</Badge></div><p>{item.actor_name} · {roleLabels[item.actor_role]}</p></article></div>)}</div> : <Empty title="暂无审计记录" text="系统操作会按时间顺序记录在这里"/>}</section>{exporting && <AuditExportModal onClose={() => setExporting(false)} showError={showError} notify={notify}/>}</div>;
}

function AuditExportModal({ onClose, showError, notify }) {
  const [hazards, setHazards] = useState([]);
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(() => new Set());
  useEffect(() => { api("/hazards").then(setHazards).catch(showError); }, []);
  const visible = useMemo(() => hazards.filter((item) => filter === "all" || item.status === filter || item.timing === filter), [hazards, filter]);
  const visibleSelected = visible.length > 0 && visible.every((item) => selected.has(item.id));
  function toggle(id) { setSelected((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; }); }
  function toggleVisible() { setSelected((current) => { const next = new Set(current); if (visibleSelected) visible.forEach((item) => next.delete(item.id)); else visible.forEach((item) => next.add(item.id)); return next; }); }
  function exportSelected() {
    const ids = [...selected];
    if (!ids.length) return showError(new Error("请至少选择一条隐患"));
    download(`/hazards/export?ids=${ids.join(",")}`);
    notify(`正在导出已选择的 ${ids.length} 条隐患`);
    onClose();
  }
  return <Modal title="选择导出隐患台账" onClose={onClose} wide><div className="form-stack"><div className="selection-toolbar"><div className="segment">{[["all","全部"],["pending","待整改"],["rectifying","整改中"],["recheck","待复查"],["overdue","已逾期"],["closed","已关闭"]].map(([id,label]) => <button key={id} type="button" className={filter === id ? "active" : ""} onClick={() => setFilter(id)}>{label}</button>)}</div><span>已选择 <strong>{selected.size}</strong> 项</span></div><div className="selection-table"><table><thead><tr><th className="check-cell"><input type="checkbox" checked={visibleSelected} onChange={toggleVisible} aria-label="全选当前结果"/></th><th>隐患编号</th><th>隐患描述</th><th>责任部门</th><th>状态</th></tr></thead><tbody>{visible.map((item) => <tr key={item.id} onClick={() => toggle(item.id)}><td className="check-cell"><input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} onClick={(event) => event.stopPropagation()} aria-label={`选择${item.code}`}/></td><td><strong>{item.code}</strong><small>{item.record_no}</small></td><td className="wide-cell"><strong>{item.description}</strong><small>{item.location}</small></td><td>{item.department}</td><td><Badge tone={statusTone[item.status]}>{item.status_label}</Badge></td></tr>)}</tbody></table>{!visible.length && <Empty title="没有可导出的隐患" text="调整状态筛选后重试"/>}</div><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>取消</button><button type="button" className="primary" disabled={!selected.size} onClick={exportSelected}><Download/>导出所选 {selected.size ? `(${selected.size})` : ""}</button></div></div></Modal>;
}

function AttachmentBox({ entityType, entityId, user, notify, showError }) {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const load = () => api(`/attachments?entityType=${entityType}&entityId=${entityId}`).then(setItems).catch(showError);
  useEffect(() => { load(); }, [entityType, entityId]);
  async function uploadFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    form.append("entityType", entityType);
    form.append("entityId", entityId);
    setBusy(true);
    try {
      await api("/attachments", { method: "POST", body: form });
      notify("附件已归档并写入审计日志");
      load();
    } catch (error) { showError(error); }
    finally { setBusy(false); event.target.value = ""; }
  }
  return <section className="attachment-box">
    <div className="section-title"><div><h3>{entityType === "inspection" ? "检查材料" : "整改证据"}</h3><p>PDF、Word、Excel 或现场照片，仅作为受控输入与证据</p></div>{user.role === "officer" && <label className={`secondary small upload-label ${busy ? "disabled" : ""}`}><Upload/>{busy ? "上传中" : "上传文件"}<input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" onChange={uploadFile} disabled={busy}/></label>}</div>
    {items.length ? <div className="attachment-list">{items.map((item) => <div key={item.id}><Files/><div><strong>{item.file_name}</strong><span>{item.uploader_name} · {(item.size / 1024).toFixed(1)} KB · {formatDate(item.created_at, true)}</span></div></div>)}</div> : <div className="attachment-empty">尚未上传附件</div>}
  </section>;
}

function Drawer({ title, onClose, children }) { return <><button className="overlay" onClick={onClose}/><aside className="drawer"><div className="drawer-head"><span>{title}</span><button className="icon-btn" onClick={onClose}><X/></button></div><div className="drawer-body">{children}</div></aside></>; }
function Modal({ title, onClose, children, wide=false }) { return <><button className="overlay" onClick={onClose}/><div className={`modal ${wide ? "wide" : ""}`}><div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose}><X/></button></div><div className="modal-body">{children}</div></div></>; }
function Field({ label, required, children }) { return <label className="field"><span>{label}{required && <b>*</b>}</span>{children}</label>; }
function Detail({ label, value }) { return <div className="detail"><span>{label}</span><p>{value || "-"}</p></div>; }
function Notice({ title, children, tone="info" }) { return <div className={`notice ${tone}`}><AlertTriangle/><div><strong>{title}</strong><span>{children}</span></div></div>; }
function Loading() { return <div className="loading"><RefreshCw/><span>正在读取项目数据</span></div>; }

export default App;
