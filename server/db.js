import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','officer','reviewer'))
);
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  location TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  version TEXT NOT NULL,
  effective_date TEXT NOT NULL,
  type TEXT NOT NULL,
  clause TEXT NOT NULL,
  keywords TEXT NOT NULL,
  category TEXT NOT NULL,
  suggested_level TEXT NOT NULL,
  measure TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  published_by INTEGER NOT NULL,
  published_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS inspections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_no TEXT UNIQUE NOT NULL,
  project_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  inspection_date TEXT NOT NULL,
  location TEXT NOT NULL,
  participants TEXT NOT NULL,
  basis_ids TEXT NOT NULL DEFAULT '[]',
  facts TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  version INTEGER NOT NULL DEFAULT 1,
  missing_fields TEXT NOT NULL DEFAULT '[]',
  conflicts TEXT NOT NULL DEFAULT '[]',
  creator_id INTEGER NOT NULL,
  reviewer_id INTEGER,
  review_comment TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS hazards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  inspection_id INTEGER NOT NULL,
  location TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  suggested_level TEXT NOT NULL,
  confirmed_level TEXT,
  clause TEXT NOT NULL,
  measure TEXT NOT NULL,
  department TEXT NOT NULL,
  owner TEXT NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  evidence TEXT NOT NULL DEFAULT '[]',
  rectification_note TEXT,
  submitted_recheck_at TEXT,
  review_result TEXT,
  closed_at TEXT,
  closed_by INTEGER,
  rule_id INTEGER,
  source_refs TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  uploaded_by INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS knowledge_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  version TEXT NOT NULL,
  effective_date TEXT NOT NULL,
  document_type TEXT NOT NULL DEFAULT '安全生产管理制度',
  file_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  published_by INTEGER NOT NULL,
  published_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  actor_id INTEGER NOT NULL,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL
);
`;

const seed = `
INSERT OR IGNORE INTO users(id,name,role) VALUES
  (1,'林静','admin'),(2,'陈工','officer'),(3,'周经理','reviewer');
INSERT OR IGNORE INTO projects(id,name,code,location) VALUES
  (1,'滨江科创中心项目','BJ-2026-01','上海市浦东新区');
`;

const defaultRules = [
  {
    title: "建筑施工安全检查标准（示例受控条款）",
    version: "企业受控版 V1.0",
    effectiveDate: "2026-01-01",
    type: "安全检查标准",
    clause: "临边防护 3.13.3",
    keywords: ["临边", "洞口", "防护栏", "盖板"],
    category: "高处作业",
    level: "一般隐患",
    measure: "设置定型化防护栏杆或可靠盖板，完善警示标识，验收合格后恢复作业。",
  },
  {
    title: "施工现场临时用电管理制度",
    version: "QHSE-LD-2026-A",
    effectiveDate: "2026-02-01",
    type: "企业制度",
    clause: "第 4.2 条",
    keywords: ["配电箱", "漏电", "电缆", "接地", "临时用电"],
    category: "临时用电",
    level: "一般隐患",
    measure: "由持证电工停电整改，恢复接地和漏电保护，整理线路并完成绝缘测试。",
  },
  {
    title: "脚手架安全管理制度",
    version: "QHSE-JS-2026-A",
    effectiveDate: "2026-02-01",
    type: "企业制度",
    clause: "第 6.1 条",
    keywords: ["脚手架", "连墙件", "扫地杆", "剪刀撑", "脚手板"],
    category: "脚手架",
    level: "一般隐患",
    measure: "停止相关区域作业，按专项方案补齐构造措施，经项目安全负责人复查后使用。",
  },
  {
    title: "重大事故隐患判定规则（企业版）",
    version: "QHSE-MH-2026-A",
    effectiveDate: "2026-03-01",
    type: "隐患分级规则",
    clause: "第 2.3 条",
    keywords: ["坍塌", "无方案", "未验收", "整体失稳"],
    category: "重大风险作业",
    level: "重大隐患",
    measure: "立即停止作业、隔离危险区域并上报项目负责人，组织专项评估和整改验收。",
  },
];

export function createDb(dbPath = process.env.DB_PATH || path.resolve("data/safety-agent.db")) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(schema);
  db.exec(seed);

  const count = db.prepare("SELECT COUNT(*) AS count FROM rules").get().count;
  if (count === 0) {
    const insert = db.prepare(`INSERT INTO rules
      (title,version,effective_date,type,clause,keywords,category,suggested_level,measure,is_active,published_by,published_at)
      VALUES (?,?,?,?,?,?,?,?,?,1,1,?)`);
    for (const rule of defaultRules) {
      insert.run(rule.title, rule.version, rule.effectiveDate, rule.type, rule.clause,
        JSON.stringify(rule.keywords), rule.category, rule.level, rule.measure, new Date().toISOString());
    }
  }
  return db;
}

export function json(value, fallback = []) {
  try { return JSON.parse(value ?? JSON.stringify(fallback)); } catch { return fallback; }
}

export function audit(db, { entityType, entityId, action, actorId, before = null, after = null }) {
  db.prepare(`INSERT INTO audit_logs(entity_type,entity_id,action,actor_id,before_json,after_json,created_at)
    VALUES (?,?,?,?,?,?,?)`).run(entityType, entityId, action, actorId,
      before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, new Date().toISOString());
}
