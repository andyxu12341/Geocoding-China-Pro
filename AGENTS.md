# AGENTS.md — Geocoding-China-Pro

## 发布规则

**每次 push 代码时，直接发布一个版本。**

### 发版命令
```bash
# 1. 修改代码
# 2. 提交 commit（带 feat/fix/refactor/docs 等前缀）
# 3. 立即执行：
npm run release
# 等价于：版本号+1 → CHANGELOG.md 更新 → git commit → git tag → push → GitHub Release 自动生成
```

### commit 规范（影响 changelog 分类）
| 前缀 | 显示章节 |
|------|---------|
| `feat:` | Features |
| `fix:` | Bug Fixes |
| `refactor:` | Technical Architecture |
| `docs:` | Documentation |
| `perf:` | Performance |
| `chore:` | Maintenance |

## 技术栈
- Node: ~/bin/node/bin/node（系统 node 的 npm 损坏）
- 坐标转换: gcoord
- 地图瓦片: leaflet.chinatmsproviders
- 自动化发布: release-it v18 + @release-it/conventional-changelog v8
