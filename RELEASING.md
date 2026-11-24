# 发布

发布走 npm 的 [trusted publishing](https://docs.npmjs.com/trusted-publishers)（GitHub Actions OIDC）：
仓库里不存 npm token，每个版本都带 provenance，能追到发布它的提交。

## 日常发版

打一个 `v` + `package.json` 版本的标签即可：

```powershell
npm version minor --no-git-tag-version   # 改 package.json 里的版本号
git commit -am "chore: release v0.4.0"
git tag v0.4.0
git push origin main --tags
```

`release.yml` 会先核对标签与 `package.json` 的版本号，不一致直接失败、不碰 registry，然后
`npm publish --access public --provenance`。`workflow_dispatch` 用来重跑一次失败的发布，
不会改版本号。

## 首次发布（一次性）

npm 只允许给**已存在**的包配置 trusted publisher，所以新包的第一个版本必须带凭据发布一次：

```powershell
npm login
npm publish --access public
npm trust github dsh-error-museum --file release.yml --repo Calvin-Xia/dsh-error-museum --allow-publish
```

之后打标签就会自动发布；`npm logout` 或到 npmjs.com 吊销 token 后，本机不再留可用的凭据。

注意：npm 对全新包的首版会走 staged publish——先出现一个 `0.0.0-stage` 占位版本，真实版本要等你完成 2FA 批准才落库。**批准完成前不要推 tag**，否则 Actions 会撞上
`409 Cannot publish over previously staged version`。占位版本可以在 72 小时内清掉：

```powershell
npm unpublish dsh-error-museum@0.0.0-stage --force
```

## 上架市场

市场（[dshmarket](https://dshmarket.com) 与 [awesome-dsh-plugin](https://awesome-dsh-plugin.com)）
不是爬虫收录，而是由精选列表
[awesome-dsh-plugin/awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
的 PR 决定。发布 npm 版之后，往那份列表加一条：

- `name`: `dsh-error-museum`
- `url`: `https://github.com/Calvin-Xia/dsh-error-museum`
- `npm`: `dsh-error-museum`
- `install`: `dsh plugin --profile web add dsh-error-museum`
- 中英文各一句简介（对应你的 `meta.description`）

条目进列表后，站点和市场会自动收录（通常一天内），版本号与下载量由 CI 刷新。
