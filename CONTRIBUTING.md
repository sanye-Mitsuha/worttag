# Contributing to Worttag

感谢你帮助改进 Worttag。

## 提交问题

提交错误报告时，请尽量包含：

- 使用的设备、浏览器和系统版本
- 出现问题的页面或学习阶段
- 可以重复问题的操作步骤
- 预期结果与实际结果
- 不包含个人账户或学习数据的截图

功能建议请先描述学习场景和希望解决的问题，再说明建议的交互方式。

## 本地开发

```bash
npm install
npm run dev
```

提交代码前请运行：

```bash
npm run lint
npm test
```

## Pull Request

- 每个 Pull Request 尽量只处理一个问题。
- 保持现有羊皮纸视觉语言，并检查浅色、深色与窄屏布局。
- 修改学习算法时，请同步补充测试。
- 修改词书时，请注明数据来源、许可和具体校正内容。
- 不要提交 `.env`、账户信息、生产数据库内容或其他敏感资料。

贡献者提交代码即表示同意将该代码按仓库根目录的 MIT License 发布。
词书数据仍需遵循 `public/wordbooks/ATTRIBUTION.txt` 中列出的许可证。
