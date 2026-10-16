import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { createApp } from "../server/app.js";

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "safety-agent-"));
  const app = createApp({ dbPath: path.join(dir, "test.db") });
  t.after(() => { app.locals.db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return app;
}

const officer = { "x-user-id": "2" };
const reviewer = { "x-user-id": "3" };
const admin = { "x-user-id": "1" };

function completeInspection() {
  return {
    type: "专项检查",
    inspection_date: "2026-10-16",
    location: "2#楼三层东侧",
    participants: "陈工、王班组长",
    facts: "现场检查发现临边防护栏杆缺失。",
    hazards: [{
      location: "2#楼三层东侧临边",
      description: "临边防护栏杆缺失，存在坠落风险",
      confirmed_level: "一般隐患",
      department: "施工管理部",
      owner: "王班组长",
      due_date: "2026-10-20",
    }],
  };
}

test("缺失事实的草稿允许创建但不能送审", async (t) => {
  const app = setup(t);
  const created = await request(app).post("/api/inspections").set(officer).send({ type: "日常检查" }).expect(201);
  assert.ok(created.body.missing_fields.includes("检查日期"));
  const submitted = await request(app).post(`/api/inspections/${created.body.id}/submit`).set(officer).send({}).expect(422);
  assert.match(submitted.body.error, /不能送审/);
});

test("受控规则生成可追溯建议并完成检查审核", async (t) => {
  const app = setup(t);
  const created = await request(app).post("/api/inspections").set(officer).send(completeInspection()).expect(201);
  assert.equal(created.body.hazards[0].suggested_level, "一般隐患");
  assert.match(created.body.hazards[0].clause, /临边防护/);
  assert.ok(created.body.hazards[0].source_refs.some((item) => item.startsWith("规则:")));

  await request(app).post(`/api/inspections/${created.body.id}/submit`).set(officer).send({}).expect(200);
  const approved = await request(app).post(`/api/inspections/${created.body.id}/review`).set(reviewer).send({ decision: "approve" }).expect(200);
  assert.equal(approved.body.status, "approved");

  const exported = await request(app).get(`/api/inspections/${created.body.id}/export`).set(officer).expect(200);
  assert.match(exported.headers["content-type"], /officedocument/);
  assert.ok(Number(exported.headers["content-length"]) > 1000);
});

test("隐患只能由负责人在复查状态关闭", async (t) => {
  const app = setup(t);
  const created = await request(app).post("/api/inspections").set(officer).send(completeInspection()).expect(201);
  const hazard = created.body.hazards[0];

  await request(app).post(`/api/hazards/${hazard.id}/review`).set(reviewer).send({ decision: "close", result: "合格" }).expect(409);
  await request(app).patch(`/api/hazards/${hazard.id}`).set(officer).send({ status: "rectifying", rectification_note: "防护栏杆已恢复并验收" }).expect(200);
  await request(app).post(`/api/hazards/${hazard.id}/submit-recheck`).set(officer).send({ rectificationNote: "防护栏杆已恢复并验收", evidence: ["整改照片-01"] }).expect(200);
  await request(app).post(`/api/hazards/${hazard.id}/review`).set(officer).send({ decision: "close", result: "合格" }).expect(403);
  const closed = await request(app).post(`/api/hazards/${hazard.id}/review`).set(reviewer).send({ decision: "close", result: "现场复查合格" }).expect(200);
  assert.equal(closed.body.status, "closed");
  assert.equal(closed.body.closed_by, 3);
});

test("未经批准的检查记录不能导出正式 Word", async (t) => {
  const app = setup(t);
  const created = await request(app).post("/api/inspections").set(officer).send(completeInspection()).expect(201);
  await request(app).get(`/api/inspections/${created.body.id}/export`).set(officer).expect(409);
});

test("安全员可以归档附件且负责人只能查看", async (t) => {
  const app = setup(t);
  const created = await request(app).post("/api/inspections").set(officer).send(completeInspection()).expect(201);
  await request(app).post("/api/attachments").set(officer)
    .field("entityType", "inspection").field("entityId", String(created.body.id))
    .attach("file", Buffer.from("inspection evidence"), { filename: "检查记录.pdf", contentType: "application/pdf" }).expect(201);
  const listed = await request(app).get(`/api/attachments?entityType=inspection&entityId=${created.body.id}`).set(reviewer).expect(200);
  assert.equal(listed.body.length, 1);
  assert.equal(listed.body[0].file_name, "检查记录.pdf");
  await request(app).post("/api/attachments").set(reviewer)
    .field("entityType", "inspection").field("entityId", String(created.body.id))
    .attach("file", Buffer.from("x"), { filename: "unauthorized.pdf", contentType: "application/pdf" }).expect(403);
});

test("仅责任部门管理员可以上传并发布安全生产管理制度", async (t) => {
  const app = setup(t);
  await request(app).post("/api/knowledge-documents").set(reviewer)
    .field("title", "项目安全生产管理制度").field("version", "QHSE-2026-A").field("effectiveDate", "2026-10-16")
    .attach("file", Buffer.from("policy"), { filename: "管理制度.pdf", contentType: "application/pdf" }).expect(403);
  const uploaded = await request(app).post("/api/knowledge-documents").set(admin)
    .field("title", "项目安全生产管理制度").field("version", "QHSE-2026-A").field("effectiveDate", "2026-10-16")
    .attach("file", Buffer.from("policy"), { filename: "管理制度.pdf", contentType: "application/pdf" }).expect(201);
  assert.equal(uploaded.body.file_name, "管理制度.pdf");
  assert.equal(uploaded.body.is_active, 1);
  const listed = await request(app).get("/api/knowledge-documents").set(officer).expect(200);
  assert.equal(listed.body.length, 1);
  await request(app).get(`/api/knowledge-documents/${uploaded.body.id}/download`).set(officer).expect(200);
});

test("可以选择指定隐患导出台账并记录导出范围", async (t) => {
  const app = setup(t);
  const payload = completeInspection();
  payload.hazards.push({
    location: "1#配电箱",
    description: "配电箱接地连接松动",
    confirmed_level: "一般隐患",
    department: "机电管理部",
    owner: "李电工",
    due_date: "2026-10-18",
  });
  const created = await request(app).post("/api/inspections").set(officer).send(payload).expect(201);
  assert.equal(created.body.hazards.length, 2);
  const selectedId = created.body.hazards[0].id;
  const exported = await request(app).get(`/api/hazards/export?ids=${selectedId}`).set(officer).expect(200);
  assert.match(exported.headers["content-type"], /spreadsheetml/);
  const auditLog = await request(app).get("/api/audit").set(officer).expect(200);
  const exportEntry = auditLog.body.find((item) => item.action === "选择导出隐患台账");
  assert.equal(exportEntry.after.count, 1);
  assert.deepEqual(exportEntry.after.hazardIds, [selectedId]);
});
