import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { createDb, audit, json } from "./db.js";
import { enrichHazard, hazardTiming, validateInspection } from "./agent.js";
import { createInspectionDoc, createLedgerWorkbook } from "./exports.js";

const uploadDir = path.resolve("work/uploads");
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir, limits: { fileSize: 20 * 1024 * 1024 } });

const statusLabels = { pending: "待整改", rectifying: "整改中", recheck: "待复查", closed: "已关闭" };
const timingLabels = { overdue: "已逾期", "due-soon": "临期", normal: "正常", closed: "已关闭" };

function inspectionView(row, db) {
  if (!row) return null;
  return {
    ...row,
    basis_ids: json(row.basis_ids),
    missing_fields: json(row.missing_fields),
    conflicts: json(row.conflicts),
    hazards: db.prepare("SELECT * FROM hazards WHERE inspection_id = ? ORDER BY id").all(row.id).map(hazardView),
  };
}

function hazardView(row) {
  if (!row) return null;
  const timing = hazardTiming(row);
  return {
    ...row,
    evidence: json(row.evidence),
    source_refs: json(row.source_refs),
    status_label: statusLabels[row.status],
    timing,
    timing_label: timingLabels[timing],
  };
}

function nextNumber(db, prefix, table) {
  const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const count = db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE created_at LIKE ?`).get(`${new Date().toISOString().slice(0, 10)}%`).count;
  return `${prefix}-${today}-${String(count + 1).padStart(3, "0")}`;
}

function requireRole(...roles) {
  return (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: "当前角色无权执行此操作" });
}

export function createApp({ dbPath } = {}) {
  const app = express();
  const db = createDb(dbPath);
  app.locals.db = db;
  app.use(cors());
  app.use(express.json({ limit: "5mb" }));
  app.use((req, res, next) => {
    const id = Number(req.header("x-user-id") || 2);
    req.user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    if (!req.user) return res.status(401).json({ error: "无效用户" });
    next();
  });

  app.get("/api/bootstrap", (req, res) => {
    res.json({
      users: db.prepare("SELECT * FROM users ORDER BY id").all(),
      project: db.prepare("SELECT * FROM projects WHERE id = 1").get(),
      currentUser: req.user,
    });
  });

  app.get("/api/dashboard", (req, res) => {
    const hazards = db.prepare("SELECT * FROM hazards").all().map(hazardView);
    const inspections = db.prepare("SELECT * FROM inspections").all();
    const byStatus = Object.fromEntries(Object.entries(statusLabels).map(([key, label]) => [label, hazards.filter((h) => h.status === key).length]));
    const byLevel = hazards.reduce((acc, h) => { const key = h.confirmed_level || h.suggested_level; acc[key] = (acc[key] || 0) + 1; return acc; }, {});
    const byDepartment = hazards.reduce((acc, h) => { acc[h.department] = (acc[h.department] || 0) + 1; return acc; }, {});
    const closed = hazards.filter((h) => h.status === "closed").length;
    res.json({
      totals: {
        inspections: inspections.length,
        hazards: hazards.length,
        pendingReview: inspections.filter((i) => i.status === "review").length,
        overdue: hazards.filter((h) => h.timing === "overdue").length,
        dueSoon: hazards.filter((h) => h.timing === "due-soon").length,
        closureRate: hazards.length ? Math.round((closed / hazards.length) * 100) : 0,
      },
      byStatus, byLevel, byDepartment,
      recent: db.prepare(`SELECT i.*,u.name AS creator_name FROM inspections i JOIN users u ON u.id=i.creator_id ORDER BY i.updated_at DESC LIMIT 5`).all(),
    });
  });

  app.get("/api/rules", (req, res) => res.json(db.prepare(`SELECT r.*,u.name AS publisher FROM rules r JOIN users u ON u.id=r.published_by ORDER BY r.is_active DESC,r.id DESC`).all().map((r) => ({ ...r, keywords: json(r.keywords) }))));

  app.post("/api/rules", requireRole("admin"), (req, res) => {
    const { title, version, effectiveDate, type, clause, keywords, category, suggestedLevel, measure } = req.body;
    if (![title, version, effectiveDate, type, clause, category, suggestedLevel, measure].every(Boolean) || !Array.isArray(keywords) || !keywords.length) return res.status(400).json({ error: "规则字段不完整" });
    const result = db.prepare(`INSERT INTO rules(title,version,effective_date,type,clause,keywords,category,suggested_level,measure,is_active,published_by,published_at)
      VALUES (?,?,?,?,?,?,?,?,?,1,?,?)`).run(title, version, effectiveDate, type, clause, JSON.stringify(keywords), category, suggestedLevel, measure, req.user.id, new Date().toISOString());
    const created = db.prepare("SELECT * FROM rules WHERE id = ?").get(result.lastInsertRowid);
    audit(db, { entityType: "rule", entityId: created.id, action: "发布规则", actorId: req.user.id, after: created });
    res.status(201).json(created);
  });

  app.patch("/api/rules/:id/toggle", requireRole("admin"), (req, res) => {
    const before = db.prepare("SELECT * FROM rules WHERE id = ?").get(req.params.id);
    if (!before) return res.status(404).json({ error: "规则不存在" });
    db.prepare("UPDATE rules SET is_active = ? WHERE id = ?").run(before.is_active ? 0 : 1, before.id);
    const after = db.prepare("SELECT * FROM rules WHERE id = ?").get(before.id);
    audit(db, { entityType: "rule", entityId: before.id, action: after.is_active ? "启用规则" : "停用规则", actorId: req.user.id, before, after });
    res.json(after);
  });

  app.get("/api/knowledge-documents", (req, res) => {
    res.json(db.prepare(`SELECT d.*,u.name AS publisher FROM knowledge_documents d
      JOIN users u ON u.id=d.published_by ORDER BY d.is_active DESC,d.published_at DESC`).all());
  });

  app.post("/api/knowledge-documents", requireRole("admin"), upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "请选择制度文件" });
    const { title, version, effectiveDate } = req.body;
    const fileName = Buffer.from(req.file.originalname, "latin1").toString("utf8");
    const extension = path.extname(fileName).toLowerCase();
    const allowed = new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx"]);
    if (!title || !version || !effectiveDate || !allowed.has(extension)) {
      fs.rmSync(req.file.path, { force: true });
      return res.status(400).json({ error: allowed.has(extension) ? "制度名称、版本和生效日期不能为空" : "仅支持 PDF、Word 或 Excel 文件" });
    }
    const now = new Date().toISOString();
    const result = db.prepare(`INSERT INTO knowledge_documents(title,version,effective_date,document_type,file_name,stored_name,mime_type,size,is_active,published_by,published_at)
      VALUES (?,?,?,'安全生产管理制度',?,?,?,?,1,?,?)`).run(title, version, effectiveDate, fileName, req.file.filename, req.file.mimetype, req.file.size, req.user.id, now);
    const created = db.prepare(`SELECT d.*,u.name AS publisher FROM knowledge_documents d JOIN users u ON u.id=d.published_by WHERE d.id=?`).get(result.lastInsertRowid);
    audit(db, { entityType: "knowledge_document", entityId: created.id, action: "上传并发布管理制度", actorId: req.user.id, after: created });
    res.status(201).json(created);
  });

  app.get("/api/knowledge-documents/:id/download", (req, res) => {
    const document = db.prepare("SELECT * FROM knowledge_documents WHERE id=?").get(req.params.id);
    if (!document) return res.status(404).json({ error: "制度文件不存在" });
    const filePath = path.join(uploadDir, document.stored_name);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "制度源文件未找到" });
    res.download(filePath, document.file_name);
  });

  app.patch("/api/knowledge-documents/:id/toggle", requireRole("admin"), (req, res) => {
    const before = db.prepare("SELECT * FROM knowledge_documents WHERE id=?").get(req.params.id);
    if (!before) return res.status(404).json({ error: "制度文件不存在" });
    db.prepare("UPDATE knowledge_documents SET is_active=? WHERE id=?").run(before.is_active ? 0 : 1, before.id);
    const after = db.prepare("SELECT * FROM knowledge_documents WHERE id=?").get(before.id);
    audit(db, { entityType: "knowledge_document", entityId: before.id, action: after.is_active ? "启用管理制度" : "停用管理制度", actorId: req.user.id, before, after });
    res.json(after);
  });

  app.get("/api/inspections", (req, res) => {
    const rows = db.prepare(`SELECT i.*,u.name AS creator_name,rv.name AS reviewer_name,
      (SELECT COUNT(*) FROM hazards h WHERE h.inspection_id=i.id) AS hazard_count
      FROM inspections i JOIN users u ON u.id=i.creator_id LEFT JOIN users rv ON rv.id=i.reviewer_id ORDER BY i.updated_at DESC`).all();
    res.json(rows.map((row) => ({ ...row, missing_fields: json(row.missing_fields) })));
  });

  app.get("/api/inspections/:id", (req, res) => {
    const view = inspectionView(db.prepare("SELECT * FROM inspections WHERE id = ?").get(req.params.id), db);
    if (!view) return res.status(404).json({ error: "检查记录不存在" });
    res.json(view);
  });

  app.post("/api/inspections", requireRole("officer"), (req, res) => {
    const now = new Date().toISOString();
    const input = req.body;
    const missing = validateInspection(input);
    const recordNo = nextNumber(db, "JC", "inspections");
    const result = db.prepare(`INSERT INTO inspections(record_no,project_id,type,inspection_date,location,participants,basis_ids,facts,status,version,missing_fields,conflicts,creator_id,created_at,updated_at)
      VALUES (?,1,?,?,?,?,?,?, 'draft',1,?,?,?, ?,?)`).run(recordNo, input.type || "日常检查", input.inspection_date || "", input.location || "", input.participants || "", JSON.stringify(input.basis_ids || []), input.facts || "", JSON.stringify(missing), JSON.stringify(input.conflicts || []), req.user.id, now, now);
    const inspectionId = Number(result.lastInsertRowid);
    const inspection = db.prepare("SELECT * FROM inspections WHERE id = ?").get(inspectionId);
    for (const raw of input.hazards || []) {
      if (!String(raw.description || "").trim()) continue;
      const enriched = enrichHazard(db, raw, inspection);
      const code = nextNumber(db, "YH", "hazards");
      db.prepare(`INSERT INTO hazards(code,inspection_id,location,description,category,suggested_level,confirmed_level,clause,measure,department,owner,due_date,status,rule_id,source_refs,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'pending',?,?,?,?)`).run(code, inspectionId, enriched.location || input.location || "待确认", enriched.description, enriched.category, enriched.suggested_level, raw.confirmed_level || null, enriched.clause, enriched.measure, raw.department || "待确认", raw.owner || "待确认", raw.due_date || "", enriched.rule_id, JSON.stringify(enriched.source_refs), now, now);
    }
    const created = inspectionView(inspection, db);
    audit(db, { entityType: "inspection", entityId: inspectionId, action: "创建草稿并生成建议", actorId: req.user.id, after: created });
    res.status(201).json(created);
  });

  app.patch("/api/inspections/:id", requireRole("officer"), (req, res) => {
    const before = inspectionView(db.prepare("SELECT * FROM inspections WHERE id = ?").get(req.params.id), db);
    if (!before) return res.status(404).json({ error: "检查记录不存在" });
    if (!['draft','returned'].includes(before.status)) return res.status(409).json({ error: "当前状态不可编辑；已批准记录修订需创建新版本" });
    const input = { ...before, ...req.body };
    const missing = validateInspection(input);
    db.prepare(`UPDATE inspections SET type=?,inspection_date=?,location=?,participants=?,facts=?,basis_ids=?,missing_fields=?,conflicts=?,updated_at=? WHERE id=?`)
      .run(input.type, input.inspection_date, input.location, input.participants, input.facts, JSON.stringify(input.basis_ids || []), JSON.stringify(missing), JSON.stringify(input.conflicts || []), new Date().toISOString(), before.id);
    const after = inspectionView(db.prepare("SELECT * FROM inspections WHERE id = ?").get(before.id), db);
    audit(db, { entityType: "inspection", entityId: before.id, action: "修改草稿", actorId: req.user.id, before, after });
    res.json(after);
  });

  app.post("/api/inspections/:id/submit", requireRole("officer"), (req, res) => {
    const before = inspectionView(db.prepare("SELECT * FROM inspections WHERE id = ?").get(req.params.id), db);
    if (!before) return res.status(404).json({ error: "检查记录不存在" });
    if (!['draft','returned'].includes(before.status)) return res.status(409).json({ error: "当前记录不可送审" });
    const blockers = [...before.missing_fields, ...before.conflicts];
    const hazardBlockers = before.hazards.flatMap((h) => [
      !h.confirmed_level && `${h.code} 未确认隐患级别`,
      (!h.department || h.department === "待确认") && `${h.code} 未确认责任部门`,
      (!h.owner || h.owner === "待确认") && `${h.code} 未确认责任人`,
      !h.due_date && `${h.code} 未设置整改期限`,
      h.clause === "待人工确认" && `${h.code} 缺少适用依据`,
    ].filter(Boolean));
    if (blockers.length || hazardBlockers.length) return res.status(422).json({ error: "存在未确认事项，不能送审", blockers: [...blockers, ...hazardBlockers] });
    db.prepare("UPDATE inspections SET status='review',updated_at=? WHERE id=?").run(new Date().toISOString(), before.id);
    const after = inspectionView(db.prepare("SELECT * FROM inspections WHERE id = ?").get(before.id), db);
    audit(db, { entityType: "inspection", entityId: before.id, action: "提交审核", actorId: req.user.id, before, after });
    res.json(after);
  });

  app.post("/api/inspections/:id/review", requireRole("reviewer"), (req, res) => {
    const before = inspectionView(db.prepare("SELECT * FROM inspections WHERE id = ?").get(req.params.id), db);
    if (!before) return res.status(404).json({ error: "检查记录不存在" });
    if (before.status !== "review") return res.status(409).json({ error: "记录不在待审核状态" });
    const approve = req.body.decision === "approve";
    if (!approve && !String(req.body.comment || "").trim()) return res.status(400).json({ error: "退回时必须填写意见" });
    db.prepare(`UPDATE inspections SET status=?,reviewer_id=?,review_comment=?,approved_at=?,updated_at=? WHERE id=?`)
      .run(approve ? "approved" : "returned", req.user.id, req.body.comment || "审核通过", approve ? new Date().toISOString() : null, new Date().toISOString(), before.id);
    const after = inspectionView(db.prepare("SELECT * FROM inspections WHERE id = ?").get(before.id), db);
    audit(db, { entityType: "inspection", entityId: before.id, action: approve ? "审核批准" : "审核退回", actorId: req.user.id, before, after });
    res.json(after);
  });

  app.post("/api/inspections/:id/revise", requireRole("officer"), (req, res) => {
    const source = inspectionView(db.prepare("SELECT * FROM inspections WHERE id = ?").get(req.params.id), db);
    if (!source || source.status !== "approved") return res.status(409).json({ error: "仅已批准记录可以创建修订版" });
    const now = new Date().toISOString();
    const result = db.prepare(`INSERT INTO inspections(record_no,project_id,type,inspection_date,location,participants,basis_ids,facts,status,version,missing_fields,conflicts,creator_id,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?, 'draft',?,?,?,?,?,?)`).run(source.record_no + `-R${source.version + 1}`, source.project_id, source.type, source.inspection_date, source.location, source.participants, JSON.stringify(source.basis_ids), source.facts, source.version + 1, JSON.stringify(source.missing_fields), JSON.stringify(source.conflicts), req.user.id, now, now);
    const created = inspectionView(db.prepare("SELECT * FROM inspections WHERE id = ?").get(Number(result.lastInsertRowid)), db);
    audit(db, { entityType: "inspection", entityId: created.id, action: "创建修订版", actorId: req.user.id, after: created });
    res.status(201).json(created);
  });

  app.get("/api/attachments", (req, res) => {
    const { entityType, entityId } = req.query;
    if (!entityType || !entityId) return res.status(400).json({ error: "缺少附件归属信息" });
    res.json(db.prepare(`SELECT a.*,u.name AS uploader_name FROM attachments a JOIN users u ON u.id=a.uploaded_by
      WHERE a.entity_type=? AND a.entity_id=? ORDER BY a.created_at DESC`).all(entityType, Number(entityId)));
  });

  app.post("/api/attachments", requireRole("officer"), upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "未选择文件" });
    const { entityType, entityId } = req.body;
    if (!entityType || !entityId) return res.status(400).json({ error: "缺少附件归属信息" });
    const now = new Date().toISOString();
    const fileName = Buffer.from(req.file.originalname, "latin1").toString("utf8");
    const result = db.prepare(`INSERT INTO attachments(entity_type,entity_id,file_name,stored_name,mime_type,size,uploaded_by,created_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run(entityType, Number(entityId), fileName, req.file.filename, req.file.mimetype, req.file.size, req.user.id, now);
    const created = db.prepare("SELECT * FROM attachments WHERE id=?").get(result.lastInsertRowid);
    audit(db, { entityType, entityId: Number(entityId), action: "上传附件", actorId: req.user.id, after: created });
    res.status(201).json(created);
  });

  app.get("/api/hazards", (req, res) => {
    const rows = db.prepare(`SELECT h.*,i.record_no,i.inspection_date FROM hazards h JOIN inspections i ON i.id=h.inspection_id ORDER BY h.updated_at DESC`).all();
    res.json(rows.map(hazardView));
  });

  app.patch("/api/hazards/:id", requireRole("officer"), (req, res) => {
    const before = hazardView(db.prepare("SELECT * FROM hazards WHERE id=?").get(req.params.id));
    if (!before) return res.status(404).json({ error: "隐患不存在" });
    if (before.status === "closed") return res.status(409).json({ error: "已关闭隐患不可修改" });
    const allowed = ["confirmed_level", "measure", "department", "owner", "due_date", "rectification_note"];
    const next = { ...before };
    for (const key of allowed) if (key in req.body) next[key] = req.body[key];
    const status = req.body.status === "rectifying" ? "rectifying" : before.status;
    db.prepare(`UPDATE hazards SET confirmed_level=?,measure=?,department=?,owner=?,due_date=?,rectification_note=?,status=?,updated_at=? WHERE id=?`)
      .run(next.confirmed_level, next.measure, next.department, next.owner, next.due_date, next.rectification_note, status, new Date().toISOString(), before.id);
    const after = hazardView(db.prepare("SELECT * FROM hazards WHERE id=?").get(before.id));
    audit(db, { entityType: "hazard", entityId: before.id, action: "更新整改信息", actorId: req.user.id, before, after });
    res.json(after);
  });

  app.post("/api/hazards/:id/submit-recheck", requireRole("officer"), (req, res) => {
    const before = hazardView(db.prepare("SELECT * FROM hazards WHERE id=?").get(req.params.id));
    if (!before) return res.status(404).json({ error: "隐患不存在" });
    if (!["pending", "rectifying"].includes(before.status)) return res.status(409).json({ error: "当前状态不可提交复查" });
    const note = String(req.body.rectificationNote || before.rectification_note || "").trim();
    if (!note) return res.status(422).json({ error: "请先填写整改说明" });
    const evidence = Array.isArray(req.body.evidence) ? req.body.evidence : before.evidence;
    db.prepare(`UPDATE hazards SET status='recheck',rectification_note=?,evidence=?,submitted_recheck_at=?,updated_at=? WHERE id=?`)
      .run(note, JSON.stringify(evidence), new Date().toISOString(), new Date().toISOString(), before.id);
    const after = hazardView(db.prepare("SELECT * FROM hazards WHERE id=?").get(before.id));
    audit(db, { entityType: "hazard", entityId: before.id, action: "提交复查", actorId: req.user.id, before, after });
    res.json(after);
  });

  app.post("/api/hazards/:id/review", requireRole("reviewer"), (req, res) => {
    const before = hazardView(db.prepare("SELECT * FROM hazards WHERE id=?").get(req.params.id));
    if (!before) return res.status(404).json({ error: "隐患不存在" });
    if (before.status !== "recheck") return res.status(409).json({ error: "隐患不在待复查状态" });
    const pass = req.body.decision === "close";
    const result = String(req.body.result || "").trim();
    if (!result) return res.status(400).json({ error: "必须填写复查结论" });
    db.prepare(`UPDATE hazards SET status=?,review_result=?,closed_at=?,closed_by=?,updated_at=? WHERE id=?`)
      .run(pass ? "closed" : "rectifying", result, pass ? new Date().toISOString() : null, pass ? req.user.id : null, new Date().toISOString(), before.id);
    const after = hazardView(db.prepare("SELECT * FROM hazards WHERE id=?").get(before.id));
    audit(db, { entityType: "hazard", entityId: before.id, action: pass ? "复查关闭" : "复查退回", actorId: req.user.id, before, after });
    res.json(after);
  });

  app.get("/api/audit", (req, res) => {
    const rows = db.prepare(`SELECT a.*,u.name AS actor_name,u.role AS actor_role FROM audit_logs a JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 200`).all();
    res.json(rows.map((r) => ({ ...r, before: json(r.before_json, null), after: json(r.after_json, null) })));
  });

  app.get("/api/inspections/:id/export", async (req, res, next) => {
    try {
      const inspection = db.prepare("SELECT * FROM inspections WHERE id=?").get(req.params.id);
      if (!inspection) return res.status(404).json({ error: "检查记录不存在" });
      if (inspection.status !== "approved") return res.status(409).json({ error: "只有已批准记录可以导出正式 Word" });
      const project = db.prepare("SELECT * FROM projects WHERE id=?").get(inspection.project_id);
      const hazards = db.prepare("SELECT * FROM hazards WHERE inspection_id=?").all(inspection.id);
      const creator = db.prepare("SELECT * FROM users WHERE id=?").get(inspection.creator_id);
      const reviewer = db.prepare("SELECT * FROM users WHERE id=?").get(inspection.reviewer_id);
      const file = await createInspectionDoc({ inspection, project, hazards, creator, reviewer });
      audit(db, { entityType: "inspection", entityId: inspection.id, action: "导出正式 Word", actorId: req.user.id, after: { fileName: file.fileName } });
      res.download(file.filePath, file.fileName);
    } catch (error) { next(error); }
  });

  app.get("/api/hazards/export", async (req, res, next) => {
    try {
      const project = db.prepare("SELECT * FROM projects WHERE id=1").get();
      const hasSelection = typeof req.query.ids === "string";
      const selectedIds = hasSelection ? req.query.ids.split(",").map(Number).filter((id) => Number.isInteger(id) && id > 0) : [];
      if (hasSelection && !selectedIds.length) return res.status(400).json({ error: "请至少选择一条隐患" });
      const where = selectedIds.length ? `WHERE h.id IN (${selectedIds.map(() => "?").join(",")})` : "";
      const hazards = db.prepare(`SELECT h.*,i.record_no,i.inspection_date FROM hazards h JOIN inspections i ON i.id=h.inspection_id ${where} ORDER BY h.id`).all(...selectedIds).map((row) => {
        const view = hazardView(row);
        return { ...view, evidence_text: view.evidence.join("；"), source_text: view.source_refs.join("；") };
      });
      if (selectedIds.length && hazards.length !== selectedIds.length) return res.status(404).json({ error: "部分所选隐患不存在，请刷新后重试" });
      const file = await createLedgerWorkbook({ hazards, project });
      audit(db, { entityType: "ledger", entityId: 1, action: selectedIds.length ? "选择导出隐患台账" : "导出隐患台账", actorId: req.user.id, after: { fileName: file.fileName, count: hazards.length, hazardIds: hazards.map((hazard) => hazard.id), hazardCodes: hazards.map((hazard) => hazard.code) } });
      res.download(file.filePath, file.fileName);
    } catch (error) { next(error); }
  });

  const dist = path.resolve("dist");
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get("/{*path}", (req, res) => res.sendFile(path.join(dist, "index.html")));
  }

  app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).json({ error: "服务器处理失败", detail: process.env.NODE_ENV === "development" ? error.message : undefined });
  });
  return app;
}
