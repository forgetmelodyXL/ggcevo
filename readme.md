# koishi-plugin-ggcevo

[![npm](https://img.shields.io/npm/v/koishi-plugin-ggcevo?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-ggcevo)

GGCEVO 综合插件，包含两大功能模块：

- **星际争霸2 句柄管理**（sc2arcade 部分）：绑定、查询、切换、解绑游戏句柄。
- **签到 / 虚拟物品玩法**（ggcevo 部分）：每日签到、抽奖、物品兑换、背包、活动系统等。

## 安装

在 Koishi 控制台中搜索 `ggcevo` 并安装，或使用命令行：

```bash
npm install koishi-plugin-ggcevo
```

> 需要依赖 `koishi` 核心及一个数据库驱动（如 `@koishijs/plugin-database-sqlite`）。

## 配置项

### 地图检测

| 配置项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `mapMonitorEnabled` | `boolean` | `false` | 是否启用地图检测定时任务 |
| `mapMonitorGroups` | `string[]` | `[]` | 地图检测广播的群组 ID 列表 |
| `mapMonitorMapIds` | `number[]` | `[]` | 需要检测的地图 ID 列表 |
| `mapMonitorApiUrl` | `string` | `https://server.dreamprotocol.info:13085/mapmonitor/maps` | 地图检测 API 地址 |

### 腾讯文档（封禁记录查询）

支持两种授权模式，二选一即可：

| 配置项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `tencentDocsEnabled` | `boolean` | `false` | 是否启用腾讯文档功能 |
| `tencentDocsClientId` | `string` | `''` | 应用 Client ID（应用ID） |
| `tencentDocsClientSecret` | `string` | `''` | 应用 Client Secret（**应用级模式必填**，用户级模式留空） |
| `tencentDocsAccessToken` | `string` | `''` | Access Token（**用户级模式必填**，通过扫码授权获取） |
| `tencentDocsOpenId` | `string` | `''` | Open ID（**用户级模式必填**，与 Access Token 同时获取） |
| `tencentDocsBanListFileId` | `string` | `DTVdYZVBDdFhEUkp6` | 封禁记录在线表格文件ID（短ID或完整ID） |
| `tencentDocsBanListSheetId` | `string` | `BB08J2` | 封禁记录工作表ID（表格URL中 `tab` 参数） |
| `tencentDocsAdminWelfareFileId` | `string` | `DVGRhUUpXUVRJVVJs` | 管理员福利在线表格文件ID（短ID或完整ID，A列QQ号/B列句柄） |
| `tencentDocsAdminWelfareSheetId` | `string` | `BB08J2` | 管理员福利工作表ID（表格URL中 `tab` 参数） |

**授权模式说明：**
- **用户级模式**（推荐用于无 `Client Secret` 的场景）：填写 `tencentDocsClientId` + `tencentDocsAccessToken` + `tencentDocsOpenId`，三者均通过腾讯文档开放平台扫码授权流程获取。Token 过期后需重新获取并在控制台更新。
- **应用级模式**：填写 `tencentDocsClientId` + `tencentDocsClientSecret`，插件自动获取并刷新 Token，无需手动维护。需应用已开通 `scope.auth.account` 权限。

## 指令列表

### 星际争霸2 句柄（sc2arcade）

| 指令 | 别名 | 说明 |
| --- | --- | --- |
| `绑定 [handle]` | 绑定句柄 | 绑定星际争霸2游戏句柄。句柄格式：`[区域ID]-S2-[服务器ID]-[档案ID]`。**不在线校验句柄是否真实存在**，仅做本地重复校验 |
| `句柄 [user]` | — | 查询已绑定的游戏句柄（`user` 选填，可查他人） |
| `切换 [index]` | — | 切换正在使用的游戏句柄 |
| `查询 [handle]` | — | 查询某游戏句柄是否已被绑定 |
| `解绑 [index]` | 解绑句柄 | 解除绑定某个游戏句柄 |
| `地图检测` | — | 查询已配置地图（`mapMonitorMapIds`）的检测状态：在线状态、最后状态变更时间、24h/30d离线次数、近期事件。需开启 `mapMonitorEnabled` 且配置地图ID |

### 签到与虚拟物品（ggcevo）

| 指令 | 别名 | 权限 | 说明 |
| --- | --- | --- | --- |
| `签到` | — | — | 每日签到，获取奖励并发放签到券/补签券等。每月首次签到时，若签到者QQ号与句柄同时匹配管理员福利文档记录，额外发放 50 咕咕币津贴 |
| `兑换 <name>` | — | — | 使用兑换券兑换指定物品。消耗兑换券数量随物品品质而定（T3皮肤=3、T2=4、T1=5、T3宠物=3、T2=4、T1=5、T0宠物=6、入场特效=5、角色冠名权=10、赎罪券=2） |
| `抽奖` | — | — | 抽奖。选项：`-p <poolId>` 奖池ID，`-c <count>` 抽奖次数。各池消耗：金币池=100金币/次、普通池=1咕咕币/次、皮肤池/宠物池=3兑换券/次 |
| `背包` | — | — | 查看自己的物品背包 |
| `个人信息` | — | — | 查看自己的签到统计与个人信息 |
| `给予 <targetId> <itemId> <count>` | — | 3 | 给予指定用户物品（管理指令） |
| `抽奖概率` | — | — | 查看各奖池的抽奖概率与保底说明 |
| `签到奖励` | — | — | 查看签到奖励规则说明 |
| `兑换列表` | 兑换表 | — | 查看可兑换物品列表（含皮肤、宠物、入场特效、角色冠名权、赎罪券及各自兑换券消耗） |
| `创建活动` | — | 3 | 创建活动。选项：`-n 名称 -d 描述 -r 奖励物品ID -a 数量 -s 开始时间 -e 结束时间 -m 领取上限 -g 限制群聊ID` |
| `领取活动 [activityId]` | — | — | 领取指定（或最新）活动奖励 |
| `活动列表 [showAll]` | — | — | 查看活动列表。默认只显示进行中与未开始的活动，携带参数（如"全部"）显示含已过期在内的全部活动 |
| `补签` | — | — | 使用补签券补签漏签的日期 |
| `使用 <name>` | — | — | 使用指定物品（如赎罪券等） |
| `封禁记录 [user]` | — | — | 查询封禁记录。不带参数查询自己，携带 @用户 查询对方句柄的封禁记录。每页显示 1 条，支持翻页（回复"下一页/上一页/页码/退出"） |
| `同步封禁记录` | — | 3 | 立即从腾讯文档拉取全量数据并写入数据库（管理员指令） |
| `同步管理员福利` | — | 3 | 立即从腾讯文档拉取管理员福利表（A列QQ号/B列句柄）全量数据并写入数据库（管理员指令） |

### 腾讯文档

| 指令 | 说明 |
| --- | --- |
| `腾讯文档/状态` | 查看腾讯文档授权状态（授权模式、Open ID、令牌过期时间等） |

## 物品与奖池

### 物品（ItemConfig）

| ID | 名称 |
| --- | --- |
| 1 | 金币 |
| 2 | 咕咕币 |
| 3 | 兑换券 |
| 9 | 补签券 |
| 23 | 赎罪券 |

### 奖池（LotteryPoolConfig）

| ID | 名称 |
| --- | --- |
| 1 | 金币池 |
| 2 | 普通池 |
| 3 | 皮肤池 |
| 4 | 宠物池 |

## 数据库表

插件使用前缀 `sc2arcade_`（句柄部分）与 `ggcevo_`（签到/物品部分）：

- `sc2arcade_player` — 用户句柄绑定记录（主键 `id`）
- `sc2arcade_map_monitor` — 地图检测状态
- `ggcevo_backpack` — 背包（主键 `user_id` + `item_id`）
- `ggcevo_signin_summary` — 签到汇总（主键 `user_id`）
- `ggcevo_signin_log` — 签到日志
- `ggcevo_lottery_log` — 抽奖记录
- `ggcevo_lottery_status` — 抽奖状态/保底（主键 `user_id` + `lottery_id`）
- `ggcevo_exchange_log` — 兑换记录
- `ggcevo_activity` — 活动配置
- `ggcevo_activity_claim_log` — 活动领取记录（主键 `activity_id` + `user_id`）
- `ggcevo_docs_token` — 腾讯文档令牌缓存（应用级模式使用，主键 `user_id`，应用级账号固定为 `app_account`）
- `ggcevo_ban_record` — 封禁记录（主键 `id` 自增，对应文档行号 `id+1`，每小时全量同步）
- `ggcevo_admin_welfare` — 管理员福利（主键 `id` 自增，对应文档行号 `id+1`，每小时全量同步；A列QQ号/B列句柄）

## 更新日志

### v1.0.9

优化指令交互体验与活动列表过滤。

- **活动列表**：新增可选参数 `[showAll]`，默认（不带参数）只显示进行中与未开始的活动，隐藏已过期活动；输入 `活动列表 全部` 可查看含已过期在内的全部活动
- **封禁记录**：新增可选参数 `[user]`，支持 `@用户` 查询对方句柄的封禁记录；无参数时查询自己当前使用中的句柄
- **引用消息**：为 `签到`、`背包`、`个人信息`、`领取活动` 指令的所有返回消息添加引用消息效果
- **兑换列表**：删除"限定物品不可兑换"提示，合并兑换开放时间与实装时间为一条提示

### v1.0.8

修复腾讯文档单选项下拉框单元格读取为空的问题。

- **修复**：`extractCellText` 新增 `select` 数据类型处理。腾讯文档 V3 API 中，单选/多选下拉框单元格的值不在 `cellValue.text`，而在 `cellValue.select`，其中 `select.value` 存储的是已选项 ID（非文本），需在 `select.options` 中按 `id` 反查才能得到可读文本
- 影响字段：封禁记录表 C 列「封禁等级」（单选下拉框，选项 A/B/C/D/仅记录）。修复前同步入库为空字符串，修复后可正确读取选项文本
- 多选下拉框同样兼容，多个已选项以 `、` 连接

### v1.0.7

新增**管理员福利**功能，签到每月津贴改为基于管理员福利文档数据库匹配。

**新增功能：**
- **管理员福利同步**：每小时自动从腾讯文档在线表格全量拉取管理员福利数据写入数据库（启动后延迟 5 秒首次同步），采用全量替换策略保证 `id` 与文档行号严格对应
- **手动同步**：`同步管理员福利` 指令（管理员权限 3）立即触发同步
- **签到每月津贴改写**：原通过 QQ 群管理员身份判断发放 50 咕咕币津贴，现改为从管理员福利数据库读取——签到者 **QQ号与游戏句柄必须同时匹配** 文档记录，且每月首次签到才发放 50 咕咕币津贴

**新增配置项：**
- `tencentDocsAdminWelfareFileId`（默认 `DVGRhUUpXUVRJVVJs`）
- `tencentDocsAdminWelfareSheetId`（默认 `BB08J2`）

**新增数据库表：**
- `ggcevo_admin_welfare` — 管理员福利（主键自增 `id`，对应文档行号 `id+1`；字段：`qq`、`handle`、`update_time`）

**表格结构要求：**
- A列：QQ号 / B列：游戏句柄

### v1.0.6

修复封禁记录同步时长文本写入失败的问题。

- **修复**：`ggcevo_ban_record` 表 `reason`（处罚原因）字段类型由 `string`（VARCHAR(255)）改为 `text`（TEXT，最大 65535 字符），避免处罚原因过长时触发 `ER_DATA_TOO_LONG` 错误
- 类型变更由 minato 自动执行 `ALTER TABLE`，已有数据不受影响，直接重启即可生效

### v1.0.5

新增**腾讯文档封禁记录查询**功能，基于腾讯文档开放平台 V3 在线表格接口实现。

**新增功能：**
- **腾讯文档授权**：支持「用户级 Token」与「应用级账号」双授权模式自动识别
  - 用户级模式：填写 `Client ID` + `Access Token` + `Open ID`（适用于无 Client Secret 的场景）
  - 应用级模式：填写 `Client ID` + `Client Secret`（自动获取并刷新 Token，需 `scope.auth.account` 权限）
- **封禁记录同步**：每小时自动从腾讯文档在线表格全量拉取数据写入数据库（启动后延迟 5 秒首次同步），采用全量替换策略保证 `id` 与文档行号严格对应
- **封禁记录查询**：`封禁记录` 指令查询当前绑定句柄的全部封禁记录，每页 1 条支持翻页（下一页/上一页/页码/退出），显示文档行号便于定位原文档
- **手动同步**：`同步封禁记录` 指令（管理员权限 3）立即触发同步
- **授权状态查询**：`腾讯文档/状态` 指令查看当前授权模式与令牌信息

**新增配置项：**
- `tencentDocsEnabled`、`tencentDocsClientId`、`tencentDocsClientSecret`
- `tencentDocsAccessToken`、`tencentDocsOpenId`
- `tencentDocsBanListFileId`（默认 `DTVdYZVBDdFhEUkp6`）、`tencentDocsBanListSheetId`（默认 `BB08J2`）

**新增数据库表：**
- `ggcevo_docs_token` — 令牌缓存（应用级模式）
- `ggcevo_ban_record` — 封禁记录（主键自增 `id`，对应文档行号 `id+1`）

**表格结构要求：**
- A列：句柄 / C列：封禁等级 / D列：处罚原因 / E列：处罚次数 / F列：审核员 / G列：审核时间

### v1.0.4

- 新增配置项 `mapMonitorApiUrl`，可将地图检测的 API 地址通过配置项填写，默认值为 `https://server.dreamprotocol.info:13085/mapmonitor/maps`。
- 移除定时任务与「地图检测」指令中硬编码的 API 地址，改为读取 `mapMonitorApiUrl` 配置。

### v1.0.3

- 复原「地图检测」指令（命名空间 `sc2arcade/地图检测`），查询已配置地图的检测状态（在线状态、最后状态变更时间、24h/30d 离线次数、近期事件）。原被删除的是「地图检测调试」指令，本次仅复原正常地图检测指令。
- 清理未使用的工具函数：`profilesMatches`、`profilesMostPlayed`、`mapsplayerbase`、`lobbiesActive`、`lobbiesHistory`、`convertDateTimeFormat`、`makeHttpRequest`。

### v1.0.2

- 移除未使用的 `sc2arcade_map` 数据库模型及相关代码（该表无任何调用）。

### v1.0.1

- 移除绑定句柄时的在线检测判定（不再调用 `api.sc2arcade.com` 校验句柄是否存在），仅保留本地重复绑定校验。
- 数据库主键调整（修复并发重复插入风险）：
  - `ggcevo_backpack`：主键由自增 `id` 改为复合主键 `(user_id, item_id)`
  - `ggcevo_lottery_status`：主键由自增 `id` 改为复合主键 `(user_id, lottery_id)`
  - `ggcevo_activity_claim_log`：主键由自增 `id` 改为复合主键 `(activity_id, user_id)`
- 因 SQLite 不支持直接修改主键，从旧版本升级时**需先迁移数据**：停止 Koishi 进程，对 `data/koishi.db` 执行「重命名旧表 → 按新复合主键建表 → 聚合去重导入 → 删除旧表」的 SQL，再部署新版。全新安装无需迁移。

## 许可证

MIT
