import { json } from "./db.js";

const requiredInspectionFields = [
  ["inspection_date", "检查日期"],
  ["location", "检查部位"],
  ["participants", "参加人员"],
  ["facts", "检查事实"],
];

export function validateInspection(input) {
  return requiredInspectionFields
    .filter(([key]) => !String(input[key] || "").trim())
    .map(([, label]) => label);
}

export function enrichHazard(db, hazard, inspection) {
  const text = `${hazard.description || ""} ${hazard.location || ""}`.toLowerCase();
  const rules = db.prepare("SELECT * FROM rules WHERE is_active = 1 ORDER BY id").all();
  const matches = rules
    .map((rule) => ({ rule, hits: json(rule.keywords).filter((word) => text.includes(word.toLowerCase())) }))
    .filter(({ hits }) => hits.length)
    .sort((a, b) => b.hits.length - a.hits.length);

  const match = matches[0];
  if (!match) {
    return {
      ...hazard,
      category: hazard.category || "待人工确认",
      suggested_level: "待人工确认",
      clause: "待人工确认",
      measure: hazard.measure || "依据不足，请责任部门补充适用规则后人工确认整改措施。",
      rule_id: null,
      source_refs: [`检查记录:${inspection.record_no}`, "输入字段:隐患描述"],
    };
  }

  return {
    ...hazard,
    category: hazard.category || match.rule.category,
    suggested_level: match.rule.suggested_level,
    clause: `${match.rule.title} ${match.rule.version} ${match.rule.clause}`,
    measure: hazard.measure || match.rule.measure,
    rule_id: match.rule.id,
    source_refs: [
      `检查记录:${inspection.record_no}`,
      "输入字段:隐患描述",
      `规则:${match.rule.title}/${match.rule.version}/${match.rule.clause}`,
    ],
  };
}

export function hazardTiming(hazard, today = new Date()) {
  if (hazard.status === "closed") return "closed";
  const due = new Date(`${hazard.due_date}T23:59:59`);
  const remaining = Math.ceil((due - today) / 86400000);
  if (remaining < 0) return "overdue";
  if (remaining <= 3) return "due-soon";
  return "normal";
}
