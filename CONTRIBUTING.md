# 贡献指南

感谢你对 Gargantua 3D 的关注 ✨

## 本地开发

```bash
git clone https://github.com/s48401203a/gargantua-3d.git
cd gargantua-3d
bun install         # 或 npm install
bun run dev         # http://127.0.0.1:5180/
```

## 提交流程

1. Fork 本仓库到你的账号
2. 从 `main` 创建新分支：`git checkout -b feat/your-feature`
3. 提交修改：`git commit -m "feat(scene): add Kerr black hole"`
4. 推送：`git push origin feat/your-feature`
5. 在 GitHub 上发起 Pull Request

## Commit 消息规范

遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/v1.0.0/)：

```
<type>(<scope>): <description>
```

| type | 用途 |
|------|------|
| `feat` | 新功能 |
| `fix` | bug 修复 |
| `docs` | 文档变更 |
| `style` | 样式变更（不影响功能） |
| `refactor` | 重构 |
| `perf` | 性能优化 |
| `test` | 测试相关 |
| `chore` | 构建脚本、依赖等 |

scope 建议：`scene`、`hud`、`shader`、`controls`、`build`、`docs`。

示例：
- `feat(shader): add Kerr frame-dragging to accretion`
- `fix(scene): correct Verlet energy drift in ThreeBody`
- `perf(shader): reduce ray-march steps to 180`

## 代码规范

- TypeScript strict 模式必须通过
- 使用 2 空格缩进
- 单引号优先
- 文件末尾保留空行
- 中文注释欢迎，但变量名、函数名用英文

提交前请确保：

```bash
bun run build      # 必须无错
```

## 物理实现要求

新增场景或修改物理模型时：
- 必须在 PR 描述中给出参考文献（论文 / 教科书 / 数值方法名）
- 不要为了"好看"牺牲物理可信度。如果做艺术化简化，请在代码注释里说明
- 优先用稳定的辛积分器（Verlet / Yoshida），慎用普通 Euler

## Issue

报告 bug 时，请包含：
- 浏览器版本 + OS
- 显卡型号（黑洞场景特别敏感）
- 复现步骤
- 控制台 / WebGL 报错（如有）

提议新功能前，先在 Issue 里讨论可行性，避免做了 PR 才发现方向不对。

## 行为准则

- 互相尊重，对事不对人
- 接受不同意见，技术讨论保持开放
- 不歧视，不骚扰

---

谢谢你的贡献 🌠
