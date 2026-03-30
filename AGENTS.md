# AGENTS.md — Geocoding-China-Pro

## 发布流程

### 每日发版（如果当天有代码修改）
```bash
npm run release
```
这会自动：版本号+1 → 更新 CHANGELOG.md → git commit → git tag → push

### 预览模式（不实际发布）
```bash
npm run release:dry
```

### commit 规范（影响 changelog 分类）
| 前缀 | 显示章节 |
|------|---------|
| `feat:` | Features |
| `fix:` | Bug Fixes |
| `refactor:` | Technical Architecture |
| `docs:` | Documentation |
| `perf:` | Performance |

## 技术栈
- Node: ~/bin/node/bin/node（系统 node 的 npm 损坏）
- 坐标转换: gcoord
- 地图瓦片: leaflet.chinatmsproviders
- CI/CD: release-it v18
