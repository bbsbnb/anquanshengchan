import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

const outputDir = path.resolve("outputs");
fs.mkdirSync(outputDir, { recursive: true });

const borders = {
  top: { style: BorderStyle.SINGLE, size: 1, color: "B8C0CC" },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: "B8C0CC" },
  left: { style: BorderStyle.SINGLE, size: 1, color: "B8C0CC" },
  right: { style: BorderStyle.SINGLE, size: 1, color: "B8C0CC" },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "D8DDE5" },
  insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "D8DDE5" },
};

function cell(text, { bold = false, shade } = {}) {
  return new TableCell({
    shading: shade ? { fill: shade } : undefined,
    children: [new Paragraph({ children: [new TextRun({ text: String(text ?? ""), bold, font: "Microsoft YaHei" })] })],
  });
}

export async function createInspectionDoc({ inspection, project, hazards, creator, reviewer }) {
  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: "安全检查记录", bold: true, font: "Microsoft YaHei", size: 32 })],
    }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `记录编号：${inspection.record_no}  版本：V${inspection.version}`, font: "Microsoft YaHei" })] }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE }, borders,
      rows: [
        new TableRow({ children: [cell("项目名称", { bold: true, shade: "E8EDF3" }), cell(project.name), cell("检查类型", { bold: true, shade: "E8EDF3" }), cell(inspection.type)] }),
        new TableRow({ children: [cell("检查日期", { bold: true, shade: "E8EDF3" }), cell(inspection.inspection_date), cell("检查部位", { bold: true, shade: "E8EDF3" }), cell(inspection.location)] }),
        new TableRow({ children: [cell("参加人员", { bold: true, shade: "E8EDF3" }), cell(inspection.participants), cell("记录状态", { bold: true, shade: "E8EDF3" }), cell("已批准")] }),
      ],
    }),
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "检查事实", font: "Microsoft YaHei", bold: true })] }),
    new Paragraph({ children: [new TextRun({ text: inspection.facts, font: "Microsoft YaHei" })] }),
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "隐患及整改措施", font: "Microsoft YaHei", bold: true })] }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE }, borders,
      rows: [
        new TableRow({ tableHeader: true, children: ["编号", "隐患描述", "级别", "依据", "整改措施", "责任/期限"].map((v) => cell(v, { bold: true, shade: "DCE6F1" })) }),
        ...(hazards.length ? hazards.map((hazard) => new TableRow({ children: [
          cell(hazard.code), cell(hazard.description), cell(hazard.confirmed_level || hazard.suggested_level),
          cell(hazard.clause), cell(hazard.measure), cell(`${hazard.department}/${hazard.owner}\n${hazard.due_date}`),
        ] })) : [new TableRow({ children: [cell("无"), cell("本次检查未记录隐患"), cell("-"), cell("-"), cell("-"), cell("-")] })]),
      ],
    }),
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "编制与审核", font: "Microsoft YaHei", bold: true })] }),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders, rows: [
      new TableRow({ children: [cell("编制人", { bold: true, shade: "E8EDF3" }), cell(creator.name), cell("审核人", { bold: true, shade: "E8EDF3" }), cell(reviewer?.name || "")] }),
      new TableRow({ children: [cell("审核时间", { bold: true, shade: "E8EDF3" }), cell(inspection.approved_at || ""), cell("线下签字", { bold: true, shade: "E8EDF3" }), cell("________________")] }),
    ] }),
    new Paragraph({ children: [new TextRun({ text: "追溯说明：详细输入材料、规则版本及处理日志请在系统内按记录编号查询。", color: "5E6B7A", italics: true, font: "Microsoft YaHei" })] }),
  ];

  const doc = new Document({ sections: [{ properties: {}, children }] });
  const fileName = `${inspection.record_no}-安全检查记录.docx`;
  const filePath = path.join(outputDir, fileName);
  fs.writeFileSync(filePath, await Packer.toBuffer(doc));
  return { fileName, filePath };
}

export async function createLedgerWorkbook({ hazards, project }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "安全 Agent";
  const sheet = workbook.addWorksheet("隐患整改台账", { views: [{ state: "frozen", ySplit: 2 }] });
  sheet.mergeCells("A1:U1");
  sheet.getCell("A1").value = `${project.name} 隐患整改台账`;
  sheet.getCell("A1").font = { name: "Microsoft YaHei", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4B43" } };
  sheet.getRow(1).height = 30;

  const headers = ["隐患编号", "来源检查", "发现日期", "位置", "隐患描述", "类别", "建议级别", "确认级别", "依据条款", "整改措施", "责任部门", "责任人", "整改期限", "状态", "时限标记", "整改说明", "整改证据", "复查结果", "关闭时间", "规则编号", "来源追溯"];
  sheet.addRow(headers);
  sheet.getRow(2).font = { name: "Microsoft YaHei", bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF315E55" } };
  sheet.getRow(2).alignment = { horizontal: "center", vertical: "middle", wrapText: true };

  for (const hazard of hazards) {
    sheet.addRow([
      hazard.code, hazard.record_no, hazard.inspection_date, hazard.location, hazard.description,
      hazard.category, hazard.suggested_level, hazard.confirmed_level || "待确认", hazard.clause,
      hazard.measure, hazard.department, hazard.owner, hazard.due_date, hazard.status_label,
      hazard.timing_label, hazard.rectification_note || "", hazard.evidence_text, hazard.review_result || "",
      hazard.closed_at || "", hazard.rule_id || "待确认", hazard.source_text,
    ]);
  }
  sheet.columns = [14,16,12,18,32,14,12,12,34,38,16,12,12,12,12,28,26,22,20,12,38].map((width) => ({ width }));
  sheet.eachRow((row, number) => {
    if (number > 2) {
      row.alignment = { vertical: "top", wrapText: true };
      row.font = { name: "Microsoft YaHei", size: 10 };
    }
    row.eachCell((c) => { c.border = { top: { style: "thin", color: { argb: "FFD8DDE5" } }, left: { style: "thin", color: { argb: "FFD8DDE5" } }, bottom: { style: "thin", color: { argb: "FFD8DDE5" } }, right: { style: "thin", color: { argb: "FFD8DDE5" } } }; });
  });
  sheet.autoFilter = { from: "A2", to: "U2" };

  const fileName = `${project.code}-隐患整改台账.xlsx`;
  const filePath = path.join(outputDir, fileName);
  await workbook.xlsx.writeFile(filePath);
  return { fileName, filePath };
}
