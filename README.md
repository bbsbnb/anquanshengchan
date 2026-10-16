# 安策 · 安全生产记录辅助

单项目内网试点版，覆盖安全检查草稿生成、受控规则匹配、人工审核、隐患整改闭环、审计追溯以及 Word/Excel 导出。

## 运行

```powershell
npm install
npm run dev
```

网页默认地址：`http://localhost:5173`。生产构建后执行 `npm run build` 和 `npm start`，服务地址为 `http://localhost:3001`。

试点版内置三种演示身份，可在右上角切换：

- 林静：责任部门管理员
- 陈工：项目安全员
- 周经理：项目安全负责人

## 数据与边界

- SQLite 数据保存在 `data/safety-agent.db`。
- 上传文件保存在 `work/uploads/`，导出文件保存在 `outputs/`。
- 内置规则和导出样式仅用于试点。接入真实项目时，应替换为责任部门发布的规范、分级规则及企业 Word/Excel 模板。
- 当前生成器采用受控关键词规则，不联网、不分析照片，也不会补写未提供的现场事实。

## 验证

```powershell
npm test
npm run build
```
