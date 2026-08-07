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

| 配置项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `mapMonitorEnabled` | `boolean` | `false` | 是否启用地图检测定时任务 |
| `mapMonitorGroups` | `string[]` | `[]` | 地图检测广播的群组 ID 列表 |
| `mapMonitorMapIds` | `number[]` | `[]` | 需要检测的地图 ID 列表 |
| `mapMonitorApiUrl` | `string` | `https://server.dreamprotocol.info:13085/mapmonitor/maps` | 地图检测 API 地址 |

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
| `签到` | — | — | 每日签到，获取奖励并发放签到券/补签券等 |
| `兑换 <name>` | — | — | 使用兑换券兑换指定物品。消耗兑换券数量随物品品质而定（T3皮肤=3、T2=4、T1=5、T3宠物=3、T2=4、T1=5、T0宠物=6、入场特效=5、角色冠名权=10、赎罪券=2） |
| `抽奖` | — | — | 抽奖。选项：`-p <poolId>` 奖池ID，`-c <count>` 抽奖次数。各池消耗：金币池=100金币/次、普通池=1咕咕币/次、皮肤池/宠物池=3兑换券/次 |
| `背包` | — | — | 查看自己的物品背包 |
| `个人信息` | — | — | 查看自己的签到统计与个人信息 |
| `给予 <targetId> <itemId> <count>` | — | 3 | 给予指定用户物品（管理指令） |
| `抽奖概率` | — | — | 查看各奖池的抽奖概率与保底说明 |
| `签到奖励` | — | — | 查看签到奖励规则说明 |
| `兑换列表` | 兑换表 | — | 查看可兑换物品列表（含皮肤、宠物、入场特效、角色冠名权、赎罪券及各自兑换券消耗；限定物品不可兑换） |
| `创建活动` | — | 3 | 创建活动。选项：`-n 名称 -d 描述 -r 奖励物品ID -a 数量 -s 开始时间 -e 结束时间 -m 领取上限 -g 限制群聊ID` |
| `领取活动 [activityId]` | — | — | 领取指定（或最新）活动奖励 |
| `活动列表` | — | — | 查看当前所有活动 |
| `补签` | — | — | 使用补签券补签漏签的日期 |
| `使用 <name>` | — | — | 使用指定物品（如赎罪券等） |

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

## 更新日志

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
