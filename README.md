# my-dsh-plugins

DeepSeek Harness 的插件集合 · A collection of DSH plugins.

同一个工作区里维护多个插件：每个插件占一个目录，各自独立安装、独立发版，互不共享依赖。
现在只有一个。

## 插件

| 插件 | 一句话 | 版本 |
|---|---|---|
| [dsh-session-insights](plugins/dsh-session-insights) | 错误博物馆：把最近 N 天的失败做成展品，按模型的处置分馆陈列 | 0.2.0 |

## 安装

插件都以本地目录方式链进 DSH profile（`link:` 依赖）。以 `dsh-session-insights` 为例：

```powershell
# 1. 在要装它的 profile 里加一条 link 依赖
#    ~/.dsh/profiles/<profile>/package.json
"dsh-session-insights": "link:C:/path/to/my-dsh-plugins/plugins/dsh-session-insights"

# 2. 装一次依赖，再把它加进该 profile 的 dsh.profile.bundles
```

各插件的具体入口、面板位置与配置项写在自己的 README 里。

## 开发

每个插件目录自带 `package.json`、`index.js`（host 侧）与 `client.js`（Web 侧）。仓库根目录的 `_probe/`、`_preview/`
是开发期的校验脚本与离线预览页，不进版本库（见 `.gitignore`）。

## 许可

MIT，见 [LICENSE](LICENSE)。
