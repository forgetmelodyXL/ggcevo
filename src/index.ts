import { Context, Schema, h, Session } from 'koishi'
import type {} from 'koishi-plugin-puppeteer'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises'

export const name = 'ggcevo'

export interface Config {
  mapMonitorEnabled: boolean
  mapMonitorGroups: string[]
  mapMonitorMapIds: number[]
  mapMonitorApiUrl: string
  mapMonitorRecommendMapName: string
  curfewEnabled: boolean
  tencentDocsEnabled: boolean
  tencentDocsClientId: string
  tencentDocsClientSecret: string
  tencentDocsAccessToken: string
  tencentDocsOpenId: string
  tencentDocsBanListFileId: string
  tencentDocsBanListSheetId: string
  tencentDocsAdminWelfareFileId: string
  tencentDocsAdminWelfareSheetId: string
  banNotifyGroups: string[]
  handleInactiveUnbindEnabled: boolean
  handleInactiveUnbindDays: number
  /** 活动兑换管理员名字, 填写后兑换成功及兑换列表会提示向该管理员登记; 不填则不提醒 */
  exchangeAdminName: string
  /** 咕咕之战菜单渲染方式: text=文字菜单(默认, 无需额外服务), image=图片菜单(需启用 puppeteer 服务) */
  menuStyle: 'text' | 'image'
  debugEnabled: boolean
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    mapMonitorEnabled: Schema.boolean().description('是否启用地图检测定时任务').default(false),
    mapMonitorGroups: Schema.array(Schema.string()).description('地图检测广播的群组ID列表').default([]),
    mapMonitorMapIds: Schema.array(Schema.number()).description('需要检测的地图ID列表').default([]),
    mapMonitorApiUrl: Schema.string().description('地图检测API地址').default('https://server.dreamprotocol.info:13085/mapmonitor/maps'),
    mapMonitorRecommendMapName: Schema.string().description('当所有配置地图均离线时, 推荐玩家游玩的地图名称').default(''),
  }).description('地图检测'),

  Schema.object({
    curfewEnabled: Schema.boolean().description('是否启用宵禁(启用后每晚17点-24点禁止抽奖、挖矿和探索, 签到不受限制)').default(false),
  }).description('宵禁设置'),

  Schema.object({
    exchangeAdminName: Schema.string().description('活动兑换管理员名字(填写后, 兑换成功及兑换列表会提示向该管理员私聊登记, 不填则不提醒)').default(''),
  }).description('活动兑换'),

  Schema.object({
    tencentDocsEnabled: Schema.boolean().description('是否启用腾讯文档功能').default(false),
    tencentDocsClientId: Schema.string().description('腾讯文档开放平台应用 Client ID(应用ID)').default(''),
    tencentDocsClientSecret: Schema.string().description('腾讯文档应用 Client Secret(应用级账号模式需要, 用户级模式留空)').role('secret').default(''),
    tencentDocsAccessToken: Schema.string().description('腾讯文档 Access Token(用户级模式必填, 通过扫码授权获取)').role('secret').default(''),
    tencentDocsOpenId: Schema.string().description('腾讯文档 Open ID(用户级模式必填, 与 Access Token 同时获取)').default(''),
    tencentDocsBanListFileId: Schema.string().description('封禁记录在线表格的文件ID(短ID或完整ID)').default(''),
    tencentDocsBanListSheetId: Schema.string().description('封禁记录工作表ID(表格URL中tab参数)').default(''),
    tencentDocsAdminWelfareFileId: Schema.string().description('管理员福利在线表格的文件ID(短ID或完整ID, A列QQ号/B列句柄)').default(''),
    tencentDocsAdminWelfareSheetId: Schema.string().description('管理员福利工作表ID(表格URL中tab参数)').default(''),
    banNotifyGroups: Schema.array(Schema.string()).description('封禁提醒广播的群组ID列表(同步检测到新增封禁记录时在此提醒)').default([]),
  }).description('腾讯文档'),

  Schema.object({
    handleInactiveUnbindEnabled: Schema.boolean().description('是否启用句柄长时间未使用自动解绑').default(false),
    handleInactiveUnbindDays: Schema.number().description('句柄超过该天数未使用将自动解绑(仅对非当前使用的句柄生效)').default(90).min(1),
  }).description('句柄自动解绑'),

  Schema.object({
    menuStyle: Schema.union([
      Schema.const('text').description('文字菜单(默认, 无需额外服务)'),
      Schema.const('image').description('图片菜单(需安装并启用 koishi-plugin-puppeteer 或 @shangxueink/puppeteer-without-canvas)'),
    ]).description('咕咕之战菜单渲染方式').default('text'),
  }).description('菜单设置'),

  Schema.object({
    debugEnabled: Schema.boolean().description('是否启用调试模式(启用后, ggcevo 所有指令的触发/参数/执行结果/错误信息会输出到 Koishi 日志)').default(false),
  }).description('调试模式'),
])

export const inject = {
  required: ['database'],
  optional: ['puppeteer'],
}

export const ItemConfig: Record<number, string> = {
  1: '金币',
  2: '咕咕币',
  3: '兑换券',
  9: '补签券',
  23: '赎罪券',
}

export const LotteryPoolConfig: Record<number, string> = {
  1: '金币池',
  2: '普通池',
  3: '皮肤池',
  4: '宠物池',
}

export type ItemQuality = 't0' | 't1' | 't2' | 't3' | '限定'
export type ItemType = '皮肤' | '入场特效' | '物品' | '宠物' | '角色名称' | '道具'

export interface ExchangeItem {
  name: string
  quality: ItemQuality
  type: ItemType
  cost?: number
}

export const ExchangeConfig: Record<number, ExchangeItem> = {
  1: { name: '拾荒者', quality: 't3', type: '皮肤' },
  2: { name: '劳工', quality: 't3', type: '皮肤' },
  3: { name: '老兵', quality: 't2', type: '皮肤' },
  4: { name: '合成人', quality: 't2', type: '皮肤' },
  5: { name: '阿斯塔特', quality: 't1', type: '皮肤' },
  6: { name: '皇家指挥官', quality: 't1', type: '皮肤' },
  7: { name: '个性开场白', quality: 't1', type: '入场特效' },
  8: { name: '史蒂夫', quality: '限定', type: '皮肤' },
  9: { name: 'ep4', quality: 't0', type: '物品' },
  10: { name: '小狗', quality: 't3', type: '宠物' },
  11: { name: '小猫', quality: 't3', type: '宠物' },
  12: { name: '小黄鸭', quality: 't3', type: '宠物' },
  13: { name: '萌萌熊', quality: 't2', type: '宠物' },
  14: { name: '荆棘蜥蜴', quality: 't2', type: '宠物' },
  15: { name: '萌宠小狗', quality: 't1', type: '宠物' },
  16: { name: '熔岩虫', quality: 't1', type: '宠物' },
  17: { name: '尸甲虫', quality: 't1', type: '宠物' },
  18: { name: '绿毛虫', quality: 't0', type: '宠物' },
  19: { name: '妙蛙种子', quality: 't0', type: '宠物' },
  20: { name: '皮卡丘', quality: 't0', type: '宠物' },
  21: { name: '哆啦A梦', quality: 't0', type: '宠物' },
  22: { name: '角色冠名权', quality: 't0', type: '角色名称', cost: 10 },
  23: { name: '赎罪券', quality: 't0', type: '道具', cost: 2 },
}

declare module 'koishi' {
  interface Tables {
    sc2arcade_player: GgcEvoPlayer
    sc2arcade_map_monitor: GgcEvoMapMonitorState
    ggcevo_backpack: Backpack
    ggcevo_signin_summary: SigninSummary
    ggcevo_signin_log: SigninLog
    ggcevo_lottery_log: LotteryLog
    ggcevo_lottery_status: LotteryStatus
    ggcevo_exchange_log: ExchangeLog
    ggcevo_activity: Activity
    ggcevo_activity_claim_log: ActivityClaimLog
    ggcevo_docs_token: GgcEvoDocsToken
    ggcevo_ban_record: GgcEvoBanRecord
    ggcevo_admin_welfare: GgcEvoAdminWelfare
    ggcevo_mining: GgcEvoMiningState
    ggcevo_explore: GgcEvoExploreState
    ggcevo_explore_stats: GgcEvoExploreStat
  }
}

export interface GgcEvoPlayer {
  id: number
  userId: string
  regionId: number
  realmId: number
  profileId: number
  createdAt: Date
  isActive: boolean
  /** 最后使用时间(绑定时记录, 切换时更新切换前后两个句柄), 功能上线前的旧记录可能为 null */
  lastUsedAt: Date
}

export interface GgcEvoMapMonitorState {
  mapId: number
  lastState: string
  lastCheckedAt: Date
}

export interface GgcEvoDocsToken {
  /** 账号标识, 应用级账号固定为 'app_account' */
  user_id: string
  /** 应用级账号 Open ID */
  docs_user_id: string
  access_token: string
  refresh_token: string
  expires_at: Date
  update_time: Date
}

export interface GgcEvoBanRecord {
  /** 自增ID, 对应文档行号(行号 = id + 1, 跳过表头) */
  id: number
  /** A列: 游戏句柄 */
  handle: string
  /** C列: 封禁等级 */
  ban_level: string
  /** D列: 处罚原因 (text 类型, 支持长文本) */
  reason: string
  /** E列: 处罚次数 */
  count: string
  /** F列: 审核员 */
  auditor: string
  /** G列: 审核时间 */
  audit_time: string
  /** 最近一次同步时间 */
  update_time: Date
}

export interface GgcEvoAdminWelfare {
  /** 自增ID, 对应文档行号(行号 = id + 1, 跳过表头) */
  id: number
  /** A列: QQ号 */
  qq: string
  /** B列: 游戏句柄 */
  handle: string
  /** 最近一次同步时间 */
  update_time: Date
}

export interface GgcEvoMiningState {
  /** 挖矿身份标识, 复用游戏句柄字符串 */
  user_id: string
  /** 本轮挖矿开始时间(领取后重置为领取时刻, 立即进入下一轮) */
  start_time: Date
  /** 累计挖矿总时长(分钟) */
  total_minutes: number
  /** 累计挖矿收益金币总数 */
  total_coins: number
  /** 最近一次更新/领取时间 */
  update_time: Date
}

export interface GgcEvoExploreState {
  /** 探索身份标识, 复用游戏句柄字符串 */
  user_id: string
  /** 当前进行中的探索星系ID */
  galaxy_id: number
  /** 本轮探索开始时间 */
  start_time: Date
  /** 最近一次更新/领取时间 */
  update_time: Date
}

export interface GgcEvoExploreStat {
  /** 探索身份标识, 复用游戏句柄字符串 */
  user_id: string
  /** 星系ID */
  galaxy_id: number
  /** 累计探索次数 */
  total_count: number
  /** 累计成功次数 */
  success_count: number
  /** 累计失败次数 */
  fail_count: number
  /** 累计获得金币数(含失败安慰奖) */
  total_coins: number
  /** 最近一次更新/领取时间 */
  update_time: Date
}

export interface Backpack {
  id: number
  user_id: string
  item_id: number
  count: number
}

export interface SigninSummary {
  user_id: string
  total_days: number
  month_days: number
  current_month: number
  continuous_days: number
  last_signin_date: Date
  update_time: Date
  last_allowance_month: number
}

export interface SigninLog {
  id: number
  user_id: string
  signin_date: Date
  signin_type: number
  reward_config: string
  create_time: Date
}

export interface LotteryLog {
  id: number
  user_id: string
  lottery_id: number
  prize_id: number
  cost_type: number
  cost_num: number
  draw_time: Date
}

export interface LotteryStatus {
  id: number
  user_id: string
  lottery_id: number
  pity_counter: number
  total_draw_count: number
  pity_triggered_count: number
  rare_hit_count: number
  update_time: Date
}

export interface ExchangeLog {
  id: number
  user_id: string
  exchange_id: number
  cost_type: number
  create_time: Date
}

export interface Activity {
  id: number
  name: string
  description: string
  reward_item: number
  reward_amount: number
  start_time: Date
  end_time: Date
  max_claims: number
  required_group: string
  created_at: Date
}

export interface ActivityClaimLog {
  id: number
  activity_id: number
  user_id: string
  claimed_at: Date
}

export function apply(ctx: Context, config: Config) {
  // ========== 引用回复 ==========

  // 除咕咕之战指令外, 其余指令的回复统一添加引用回复(quote)
  // 1) command/before-execute 阶段给本插件的会话打标记
  // 2) before-send 阶段给带标记会话的回复前置 <quote> 引用原消息
  ctx.root.on('command/before-execute', (argv) => {
    if (argv.command?.ctx === ctx && argv.command.name !== '咕咕之战') {
      ;(argv.session as any)['ggcevoQuote'] = true
    }
  })
  ctx.root.before('send', (session, options) => {
    const source = options.session as any
    // 回复已自带 <quote> 的指令(如句柄绑定/切换)不再叠加引用, 避免双引用
    if (source?.['ggcevoQuote'] && !session.elements?.some((el) => el.type === 'quote')) {
      session.elements?.unshift(h('quote', { id: source.messageId }))
    }
  })

  // ========== 调试模式 ==========

  // 调试日志辅助: 仅配置启用 debugEnabled 时输出到 Koishi 日志
  const debug = (...args: unknown[]) => {
    if (config.debugEnabled) {
      ctx.logger.info('[ggcevo:debug]', ...args);
    }
  };

  // 仅统计 ggcevo 命名空间下的指令, 避免干扰其他插件的日志
  // 注意: command.name 只是叶名称(如 '签到'), 需沿 parent 拼出完整路径(如 'ggcevo/签到')
  const getFullCommandName = (command: { name: string; parent?: { name: string; parent?: unknown } | null }): string => {
    const parts: string[] = [];
    let cur: { name: string; parent?: unknown } | null | undefined = command;
    while (cur) {
      parts.unshift(cur.name);
      cur = (cur as { parent?: unknown }).parent as { name: string; parent?: unknown } | null | undefined;
    }
    return parts.join('/');
  };
  const isGgcEvoCommand = (command: { name: string; parent?: { name: string; parent?: unknown } | null }): boolean => {
    const full = getFullCommandName(command);
    return full === 'ggcevo' || full.startsWith('ggcevo/');
  };

  // 监听器始终注册(避免控制台修改配置后未重载插件导致监听器未注册), 输出与否由 debug() 内部开关控制
  ctx.on('command/before-execute', (argv) => {
    if (!config.debugEnabled) return;
    const { command, session, args, options } = argv;
    if (!isGgcEvoCommand(command)) return;
    const optionStr = Object.keys(options).length ? ` | 选项: ${JSON.stringify(options)}` : '';
    debug(`指令触发: ${getFullCommandName(command)} | 用户: ${session.userId} | 平台: ${session.platform} | 参数: ${JSON.stringify(args)}${optionStr}`);
  });

  ctx.on('command-error', (argv, error) => {
    if (!config.debugEnabled) return;
    const { command, session } = argv;
    if (!isGgcEvoCommand(command)) return;
    debug(`指令出错: ${getFullCommandName(command)} | 用户: ${session.userId} | 错误: ${error?.message ?? error}`);
  });

  // 启动探针: 便于确认调试模式是否生效
  if (config.debugEnabled) {
    debug('调试模式已启用(ggcevo 指令触发/错误日志将输出到 Koishi 日志)');
  }
  // ========== 数据库模型扩展 (sc2arcade 部分, 前缀改为 ggcevo_) ==========

  ctx.model.extend('sc2arcade_player', {
    id: 'unsigned',
    userId: 'string',
    regionId: 'unsigned',
    realmId: 'unsigned',
    profileId: 'unsigned',
    createdAt: 'timestamp',
    isActive: 'boolean',
    lastUsedAt: { type: 'timestamp', nullable: true },
  }, {
    autoInc: true,
    primary: 'id'
  })

  ctx.model.extend('sc2arcade_map_monitor', {
    mapId: 'unsigned',
    lastState: 'text',
    lastCheckedAt: 'timestamp',
  }, {
    primary: 'mapId'
  })

  // ========== 数据库模型扩展 (ggcevo-sign 部分) ==========

  ctx.model.extend('ggcevo_backpack', {
    user_id: 'string',
    item_id: 'unsigned',
    count: 'unsigned',
  }, {
    primary: ['user_id', 'item_id']
  })

  ctx.model.extend('ggcevo_signin_summary', {
    user_id: 'string',
    total_days: 'unsigned',
    month_days: 'unsigned',
    current_month: 'unsigned',
    continuous_days: 'unsigned',
    last_signin_date: 'timestamp',
    update_time: 'timestamp',
    last_allowance_month: 'unsigned',
  }, {
    primary: 'user_id',
  })

  ctx.model.extend('ggcevo_signin_log', {
    id: 'unsigned',
    user_id: 'string',
    signin_date: 'timestamp',
    signin_type: 'unsigned',
    reward_config: 'string',
    create_time: 'timestamp',
  }, {
    primary: 'id',
    autoInc: true
  })

  ctx.model.extend('ggcevo_lottery_log', {
    id: 'unsigned',
    user_id: 'string',
    lottery_id: 'unsigned',
    prize_id: 'unsigned',
    cost_type: 'unsigned',
    cost_num: 'unsigned',
    draw_time: 'timestamp',
  }, {
    primary: 'id',
    autoInc: true
  })

  ctx.model.extend('ggcevo_lottery_status', {
    user_id: 'string',
    lottery_id: 'unsigned',
    pity_counter: 'unsigned',
    total_draw_count: 'unsigned',
    pity_triggered_count: 'unsigned',
    rare_hit_count: 'unsigned',
    update_time: 'timestamp',
  }, {
    primary: ['user_id', 'lottery_id']
  })

  ctx.model.extend('ggcevo_exchange_log', {
    id: 'unsigned',
    user_id: 'string',
    exchange_id: 'unsigned',
    cost_type: 'unsigned',
    create_time: 'timestamp',
  }, {
    primary: 'id',
    autoInc: true
  })

  ctx.model.extend('ggcevo_activity', {
    id: 'unsigned',
    name: 'string',
    description: 'string',
    reward_item: 'unsigned',
    reward_amount: 'unsigned',
    start_time: 'timestamp',
    end_time: 'timestamp',
    max_claims: 'unsigned',
    required_group: 'string',
    created_at: 'timestamp',
  }, {
    primary: 'id',
    autoInc: true
  })

  ctx.model.extend('ggcevo_activity_claim_log', {
    activity_id: 'unsigned',
    user_id: 'string',
    claimed_at: 'timestamp',
  }, {
    primary: ['activity_id', 'user_id']
  })

  ctx.model.extend('ggcevo_docs_token', {
    user_id: 'string',
    docs_user_id: 'string',
    access_token: 'string',
    refresh_token: 'string',
    expires_at: 'timestamp',
    update_time: 'timestamp',
  }, {
    primary: 'user_id',
  })

  ctx.model.extend('ggcevo_ban_record', {
    id: 'unsigned',
    handle: 'string',
    ban_level: 'string',
    reason: 'text',
    count: 'string',
    auditor: 'string',
    audit_time: 'string',
    update_time: 'timestamp',
  }, {
    primary: 'id',
    autoInc: true,
  })

  ctx.model.extend('ggcevo_admin_welfare', {
    id: 'unsigned',
    qq: 'string',
    handle: 'string',
    update_time: 'timestamp',
  }, {
    primary: 'id',
    autoInc: true,
  })

  // ========== 数据库模型扩展 (挖矿) ==========

  ctx.model.extend('ggcevo_mining', {
    user_id: 'string',
    start_time: 'timestamp',
    total_minutes: 'unsigned',
    total_coins: 'unsigned',
    update_time: 'timestamp',
  }, {
    primary: 'user_id',
  })

  // ========== 数据库模型扩展 (探索) ==========

  ctx.model.extend('ggcevo_explore', {
    user_id: 'string',
    galaxy_id: 'unsigned',
    start_time: 'timestamp',
    update_time: 'timestamp',
  }, {
    primary: 'user_id',
  })

  ctx.model.extend('ggcevo_explore_stats', {
    user_id: 'string',
    galaxy_id: 'unsigned',
    total_count: 'unsigned',
    success_count: 'unsigned',
    fail_count: 'unsigned',
    total_coins: 'unsigned',
    update_time: 'timestamp',
  }, {
    primary: ['user_id', 'galaxy_id'],
  })

  // ========== 地图检测定时任务 ==========

  if (config.mapMonitorEnabled && config.mapMonitorGroups.length > 0 && config.mapMonitorMapIds.length > 0) {
    ctx.setInterval(async () => {
      try {
        const response = await ctx.http.get(config.mapMonitorApiUrl);
        const maps: any[] = response.maps || [];

        for (const mapId of config.mapMonitorMapIds) {
          const mapData = maps.find((m: any) => m.mapId === mapId);
          if (!mapData) continue;

          const currentState = JSON.stringify(mapData);
          const [previousRecord] = await ctx.database.get('sc2arcade_map_monitor', { mapId });

          if (!previousRecord) {
            await ctx.database.create('sc2arcade_map_monitor', {
              mapId,
              lastState: currentState,
              lastCheckedAt: new Date(),
            });
            continue;
          }

          const prevData = JSON.parse(previousRecord.lastState);

          if (prevData.isOnline !== mapData.isOnline) {
            const message = formatMapMonitorMessage(mapData, previousRecord);

            for (const groupId of config.mapMonitorGroups) {
              let sent = false;
              for (const bot of ctx.bots) {
                try {
                  await bot.sendMessage(groupId, message);
                  sent = true;
                  break;
                } catch (e) {
                  // 此 bot 可能不在该群，尝试下一个
                }
              }
              if (!sent) {
                console.error(`发送地图检测消息到群组 ${groupId} 失败: 所有 bot 均无法发送`);
              }
            }
          }

          await ctx.database.set('sc2arcade_map_monitor', { mapId }, {
            lastState: currentState,
            lastCheckedAt: new Date(),
          });
        }
      } catch (error) {
        console.error('地图检测任务执行失败:', error);
      }
    }, 60000);
  }

  // ========== 辅助函数 ==========

  function getRegionName(regionId: number): string {
    const regionMap = {
      1: '[US]',
      2: '[EU]',
      3: '[KR]',
      5: '[CN]'
    }
    return regionMap[regionId] || `[${regionId}]`
  }

  function formatHandle(handle: GgcEvoPlayer, isActive = false): string {
    const region = getRegionName(handle.regionId)
    const activeMark = isActive ? ' (当前使用)' : ''
    return `${region} ${handle.regionId}-S2-${handle.realmId}-${handle.profileId}${activeMark}`
  }

  const getHandle = async (session: any): Promise<string | null> => {
    const [profile] = await ctx.database.get('sc2arcade_player', { userId: session.userId, isActive: true });
    if (!profile) {
      return null;
    }
    const { regionId, realmId, profileId } = profile;
    return `${regionId}-S2-${realmId}-${profileId}`;
  };

  // ========== 宵禁检查 ==========

  /**
   * 宵禁检查
   * @param type 'lottery' | 'mining' | 'explore' (签到不受宵禁限制)
   * @returns 拦截时返回提示消息字符串, 允许时返回 null
   */
  const checkCurfew = (type: 'lottery' | 'mining' | 'explore'): string | null => {
    if (!config.curfewEnabled) return null;
    const hour = new Date().getHours(); // 0-23
    // 宵禁为每晚 17:00-24:00, 仅限制抽奖/挖矿/探索等咕咕之战玩法指令
    if (hour >= 17) {
      if (type === 'lottery') {
        return `🌙 宵禁时段（17:00-24:00），暂不能抽奖。`;
      } else if (type === 'mining') {
        return `🌙 宵禁时段（17:00-24:00），暂不能挖矿。`;
      } else {
        return `🌙 宵禁时段（17:00-24:00），暂不能探索。`;
      }
    }
    return null;
  };

  // ========== 命令注册 (sc2arcade 部分, 前缀改为 ggcevo_) ==========

  // 绑定
  ctx.command('sc2arcade/绑定 [handle]', '绑定星际争霸2游戏句柄')
    .alias('绑定句柄')
    .usage('游戏句柄格式为: [区域ID]-S2-[服务器ID]-[档案ID]')
    .action(async (argv, handle) => {
      const session = argv.session;
      if (!handle) {
        await session.send(`<quote id="${session.messageId}"/>请在30秒内输入游戏句柄:\n(游戏句柄格式为: [区域ID]-S2-[服务器ID]-[档案ID])\n例如：5-S2-1-1234567`)
        handle = await session.prompt(30000)
        if (!handle) return `<quote id="${session.messageId}"/>已取消操作, 请重新输入。`
      }

      const handleRegex = /^([1235])-s2-([12])-(\d+)$/i;
      if (!handleRegex.test(handle)) {
        return `<quote id="${session.messageId}"/>❌ 游戏句柄格式错误, 请重新输入。\n(游戏句柄格式为: [区域ID]-S2-[服务器ID]-[档案ID])\n例如：5-S2-1-1234567`;
      }

      const standardizedHandle = handle.replace(/-s2-/i, '-S2-');
      const [, regionId, realmId, profileId] = standardizedHandle.match(handleRegex)!.map(Number);

      const existingHandle = await ctx.database.get('sc2arcade_player', {
        regionId,
        realmId,
        profileId
      });

      if (existingHandle.length > 0) {
        return `<quote id="${session.messageId}"/>❌ 绑定失败, 该游戏句柄已被其他用户绑定。`;
      }

      const userHandles = await ctx.database.get('sc2arcade_player', { userId: session.userId });
      const alreadyBound = userHandles.some(h =>
        h.regionId === regionId &&
        h.realmId === realmId &&
        h.profileId === profileId
      );

      if (alreadyBound) {
        return `<quote id="${session.messageId}"/>❌ 您已绑定过该游戏句柄。`;
      }

      const isFirstHandle = userHandles.length === 0;

      await ctx.database.create('sc2arcade_player', {
        userId: session.userId,
        regionId,
        realmId,
        profileId,
        isActive: isFirstHandle,
        createdAt: new Date(),
        lastUsedAt: new Date()
      });

      return `<quote id="${session.messageId}"/>✅ 您已成功绑定游戏句柄${isFirstHandle ? '并设为当前使用' : ''}。`;
    });

  // 句柄查询
  ctx.command('sc2arcade/句柄 [user]', '查询已经绑定的星际争霸2游戏句柄')
    .usage('user 参数为选填项')
    .example('/句柄, 查询自己绑定的游戏句柄\n    /句柄 @用户, 查询其他用户绑定的游戏句柄')
    .action(async (argv, user) => {
      const session = argv.session;
      try {
        if (!user) {
          const handles = await ctx.database.get('sc2arcade_player', { userId: session.userId });

          if (!handles || handles.length === 0) {
            return `<quote id="${session.messageId}"/>您暂未绑定游戏句柄。`;
          }

          const message = handles.map((h, index) =>
            `${index + 1}. ${formatHandle(h, h.isActive)}`
          ).join('\n');

          return `<quote id="${session.messageId}"/>您绑定的游戏句柄：\n${message}`;
        } else {
          const parsedUser = h.parse(user)[0];
          if (!parsedUser || parsedUser.type !== 'at' || !parsedUser.attrs.id) {
            return `<quote id="${session.messageId}"/>❌ 参数错误, 请输入"句柄 @用户"查询其他用户绑定的游戏句柄。`
          }
          const targetUserId = parsedUser.attrs.id;
          const handles = await ctx.database.get('sc2arcade_player', { userId: targetUserId });

          if (!handles || handles.length === 0) {
            return `<quote id="${session.messageId}"/>对方暂未绑定游戏句柄。`;
          }

          const message = handles.map((h, index) =>
            `${index + 1}. ${formatHandle(h, h.isActive)}`
          ).join('\n');

          return `<quote id="${session.messageId}"/>对方绑定的游戏句柄：\n${message}`;
        }
      } catch (error) {
        console.error('查询句柄信息时发生错误:', error);
        return '⚠️ 服务器繁忙, 请稍后尝试。';
      }
    });

  // 切换句柄
  ctx.command('sc2arcade/切换 [index]', '切换正在使用的游戏句柄')
    .action(async (argv, indexParam) => {
      const session = argv.session;
      try {
        const handles = await ctx.database.get('sc2arcade_player', { userId: session.userId });

        if (!handles || handles.length === 0) {
          return `<quote id="${session.messageId}"/>您暂未绑定游戏句柄。`;
        }

        let index: number | null = null;

        if (!indexParam) {
          const message = handles.map((h, i) =>
            `${i + 1}. ${formatHandle(h, h.isActive)}`
          ).join('\n');

          await session.send(`<quote id="${session.messageId}"/>请选择要切换的句柄：\n${message}\n\n回复序号进行切换`);

          const choice = await session.prompt(30000);
          if (!choice) return `<quote id="${session.messageId}"/>已取消操作。`;

          index = parseInt(choice);
        } else {
          index = parseInt(indexParam);
        }

        if (isNaN(index) || index < 1 || index > handles.length) {
          return `<quote id="${session.messageId}"/>❌ 序号无效，请输入1-${handles.length}之间的数字。`;
        }

        const selectedHandle = handles[index - 1];
        const prevActiveHandle = handles.find(h => h.isActive && h.id !== selectedHandle.id);

        await Promise.all(handles.map(handle =>
          ctx.database.set('sc2arcade_player', { id: handle.id }, { isActive: handle.id === selectedHandle.id })
        ));

        // 切换前后的两个句柄均视为已使用, 更新最后使用时间至当前时间
        const now = new Date();
        const touchedIds = prevActiveHandle ? [selectedHandle.id, prevActiveHandle.id] : [selectedHandle.id];
        await Promise.all(touchedIds.map(id =>
          ctx.database.set('sc2arcade_player', { id }, { lastUsedAt: now })
        ));

        return `<quote id="${session.messageId}"/>✅ 已切换到句柄：${formatHandle(selectedHandle)}`;
      } catch (error) {
        console.error('切换句柄时发生错误:', error);
        return '⚠️ 切换失败，请稍后尝试。';
      }
    });

  // 查询句柄
  ctx.command('sc2arcade/查询 [handle]', '查询星际争霸2游戏句柄是否被绑定')
    .action(async (argv, handle) => {
      const session = argv.session;
      try {
        if (!handle) {
          await session.send(`<quote id="${session.messageId}"/>请在30秒内输入游戏句柄:\n(游戏句柄格式为: [区域ID]-S2-[服务器ID]-[档案ID])`)

          handle = await session.prompt(30000)
          if (!handle) return `<quote id="${session.messageId}"/>已取消操作, 请重新输入。`
        }

        const handleRegex = /^([1235])-S2-([12])-(\d+)$/;
        if (!handleRegex.test(handle)) {
          return `<quote id="${session.messageId}"/>❌ 游戏句柄格式错误, 请重新输入。\n(游戏句柄格式为: [区域ID]-S2-[服务器ID]-[档案ID])`;
        }

        const [, regionId, realmId, profileId] = handle.match(handleRegex)!.map(Number);

        const existingHandle = await ctx.database.get('sc2arcade_player', {
          regionId,
          realmId,
          profileId
        });
        if (existingHandle.length > 0) {
          return `<quote id="${session.messageId}"/>该游戏句柄已被 ${existingHandle[0].userId} 绑定。`;
        }
        else {
          return `<quote id="${session.messageId}"/>该游戏句柄暂未被其他用户绑定。`
        }

      } catch (error) {
        console.error('查询句柄信息时发生错误:', error);
        return '⚠️ 服务器繁忙, 请稍后尝试。';
      }
    });

  // 解绑
  ctx.command('sc2arcade/解绑 [index]', '解除绑定星际争霸2游戏句柄')
    .alias('解绑句柄')
    .action(async (argv, indexParam) => {
      const session = argv.session;
      try {
        const handles = await ctx.database.get('sc2arcade_player', { userId: session.userId });

        if (handles.length === 0) {
          return `<quote id="${session.messageId}"/>您暂未绑定游戏句柄。`;
        }

        let index: number | null = null;

        if (!indexParam) {
          const message = handles.map((h, i) =>
            `${i + 1}. ${formatHandle(h, h.isActive)}`
          ).join('\n');

          await session.send(`<quote id="${session.messageId}"/>请选择要解绑的句柄：\n${message}\n\n回复序号进行解绑`);

          const choice = await session.prompt(30000);
          if (!choice) return `<quote id="${session.messageId}"/>已取消操作。`;

          index = parseInt(choice);
        } else {
          index = parseInt(indexParam);
        }

        if (isNaN(index) || index < 1 || index > handles.length) {
          return `<quote id="${session.messageId}"/>❌ 序号无效，请输入1-${handles.length}之间的数字。`;
        }

        const handleToRemove = handles[index - 1];
        const wasActive = handleToRemove.isActive;

        await ctx.database.remove('sc2arcade_player', { id: handleToRemove.id });

        if (wasActive && handles.length > 1) {
          const nextHandle = handles.find(h => h.id !== handleToRemove.id);
          if (nextHandle) {
            await ctx.database.set('sc2arcade_player', { id: nextHandle.id }, { isActive: true });
            return `<quote id="${session.messageId}"/>✅ 已解绑句柄，并自动切换到：${formatHandle(nextHandle)}`;
          }
        }

        return `<quote id="${session.messageId}"/>✅ 已成功解绑句柄。`;
      } catch (error) {
        console.error('解绑失败:', error);
        return '⚠️ 服务器繁忙, 请稍后尝试。';
      }
    });

  // 迁移绑定句柄 (onebot QQ号 -> QQ官方机器人 openid)
  ctx.command('sc2arcade/迁移 <qq>', '将指定QQ号绑定的游戏句柄迁移到当前账号')
    .usage('用于从onebot机器人迁移至QQ官方机器人: /迁移 123456789')
    .action(async (argv, qq) => {
      const session = argv.session;
      try {
        const qqNumber = String(qq).trim();
        if (!/^\d{5,15}$/.test(qqNumber)) {
          return `<quote id="${session.messageId}"/>❌ 参数错误, 请输入正确的QQ号, 例如: /迁移 123456789`;
        }

        const records = await ctx.database.get('sc2arcade_player', { userId: qqNumber });
        if (records.length === 0) {
          return `<quote id="${session.messageId}"/>❌ 未找到QQ号 ${qqNumber} 绑定的游戏句柄, 无法迁移。`;
        }

        const currentUserId = session.userId;
        const currentUserHandles = await ctx.database.get('sc2arcade_player', { userId: currentUserId });
        const keepOriginalActive = currentUserHandles.length === 0;

        await Promise.all(records.map(record =>
          ctx.database.set('sc2arcade_player', { id: record.id }, {
            userId: currentUserId,
            isActive: keepOriginalActive ? record.isActive : false
          })
        ));

        const message = records.map((h, i) =>
          `${i + 1}. ${formatHandle(h, keepOriginalActive ? h.isActive : false)}`
        ).join('\n');

        return `<quote id="${session.messageId}"/>✅ 已将QQ号 ${qqNumber} 绑定的 ${records.length} 个游戏句柄迁移至当前账号:\n${message}`;
      } catch (error) {
        console.error('迁移句柄时发生错误:', error);
        return '⚠️ 服务器繁忙, 请稍后尝试。';
      }
    });

  // ========== 句柄长时间未使用自动解绑定时任务 ==========

  if (config.handleInactiveUnbindEnabled) {
    const checkInactiveHandles = async () => {
      try {
        const handles = await ctx.database.get('sc2arcade_player', {});
        const now = new Date();

        // 功能上线前绑定的句柄没有时间记录, 首次检查时将当前时间作为绑定时间
        const legacyIds = handles.filter(h => !h.lastUsedAt).map(h => h.id);
        if (legacyIds.length > 0) {
          await ctx.database.set('sc2arcade_player', { id: { $in: legacyIds } }, { lastUsedAt: now });
        }

        // 统计每个用户绑定的句柄数, 仅针对拥有多个句柄的用户的非正在使用句柄
        const handleCountByUser = new Map<string, number>();
        for (const h of handles) {
          handleCountByUser.set(h.userId, (handleCountByUser.get(h.userId) || 0) + 1);
        }

        const thresholdMs = config.handleInactiveUnbindDays * 24 * 60 * 60 * 1000;
        const expiredIds = handles
          .filter(h => h.lastUsedAt
            && !h.isActive
            && (handleCountByUser.get(h.userId) || 0) > 1
            && now.getTime() - new Date(h.lastUsedAt).getTime() > thresholdMs)
          .map(h => h.id);

        if (expiredIds.length > 0) {
          await ctx.database.remove('sc2arcade_player', { id: { $in: expiredIds } });
          ctx.logger('ggcevo').info('已自动解绑 %d 个长时间未使用的句柄', expiredIds.length);
        }
      } catch (e) {
        ctx.logger('ggcevo').warn('句柄长时间未使用自动解绑任务执行失败: %o', e);
      }
    };

    // 启动后延迟 5 秒首次检查(为旧数据补记绑定时间), 之后每天检查一次
    ctx.setTimeout(checkInactiveHandles, 5000);
    ctx.setInterval(checkInactiveHandles, 24 * 60 * 60 * 1000);
  }

  // 地图检测查询
  ctx.command('sc2arcade/地图检测', '查询已配置的地图详细信息')
    .action(async (argv) => {
      if (!config.mapMonitorEnabled || config.mapMonitorMapIds.length === 0) {
        return `<quote id="${argv.session.messageId}"/>⚠️ 地图检测功能未开启或未配置地图ID。`;
      }

      try {
        const response = await ctx.http.get(config.mapMonitorApiUrl);
        const maps: any[] = response.maps || [];

        const targetMaps = maps.filter((m: any) => config.mapMonitorMapIds.includes(m.mapId));

        if (targetMaps.length === 0) {
          return `<quote id="${argv.session.messageId}"/>📭 未找到已配置的地图信息。`;
        }

        const fieldLabels: Record<string, string> = {
          mapName: '地图名称',
          isOnline: '在线状态',
          lastStatusChangeTime: '最后状态变更时间',
          offlineCountLast24h: '24h内离线次数',
          offlineCountLast30d: '30d内离线次数',
          recentEvents: '近期事件',
        };

        const timeFields = ['lastStatusChangeTime'];

        const messages = targetMaps.map((mapData: any) => {
          const lines: string[] = [];
          lines.push('━━━━━━━━━━━━━━━━');
          lines.push(`📋 ${mapData.mapName || '未知地图'} (ID: ${mapData.mapId})`);
          for (const key of Object.keys(mapData)) {
            if (key === 'mapId' || key === 'mapName') continue;
            if (key === 'lastCheckTime' || key === 'firstSeenTime' || key === 'popularityRank') continue;
            const value = mapData[key];
            if (value !== null && value !== undefined && value !== '') {
              const label = fieldLabels[key] || key;
              let displayValue: string;
              if (key === 'isOnline') {
                displayValue = value ? '🟢 在线' : '🔴 离线';
              } else if (key === 'recentEvents') {
                displayValue = formatRecentEvents(value);
              } else if (timeFields.includes(key)) {
                displayValue = toBeijingTime(value);
              } else if (typeof value === 'object') {
                displayValue = JSON.stringify(value);
              } else {
                displayValue = String(value);
              }
              lines.push(`  ${label}: ${displayValue}`);
            }
          }
          return lines.join('\n');
        });

        // 当所有配置地图均离线时, 在消息底部添加推荐提示
        const allOffline = targetMaps.length > 0 && targetMaps.every((m: any) => !m.isOnline);
        if (allOffline && config.mapMonitorRecommendMapName) {
          messages.push(`━━━━━━━━━━━━━━━━\n💡 当前所有地图均处于离线状态，推荐游玩「${config.mapMonitorRecommendMapName}」`);
        }

        return `<quote id="${argv.session.messageId}"/>${messages.join('\n')}`;
      } catch (error) {
        console.error('查询地图检测信息失败:', error);
        return '⚠️ 服务器繁忙, 请稍后尝试。';
      }
    });

  // ========== 命令注册 (ggcevo-sign 部分) ==========

  ctx.command('ggcevo/签到')
    .action(async (argv) => {
      const session = argv.session;
      const handle = await getHandle(session);
      if (!handle) {
        return `<quote id="${session.messageId}"/>🔒 需要先绑定游戏句柄。\n💡 使用 \`绑定句柄\` 命令进行绑定。`;
      }

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const [existingLog] = await ctx.database.get('ggcevo_signin_log', {
        user_id: handle,
        signin_type: 0,
        signin_date: { $gte: today },
      });

      if (existingLog) {
        return `<quote id="${session.messageId}"/>📅 今日已签到，明天再来吧！`;
      }

      const goldReward = Math.floor(Math.random() * 11) + 10;
      let gugubReward = 3;
      let extraGugubReward = 0;
      let monthlyAllowance = 0;

      const [summary] = await ctx.database.get('ggcevo_signin_summary', { user_id: handle });

      const currentMonth = now.getFullYear() * 100 + (now.getMonth() + 1);
      let newTotalDays = 1;
      let newMonthDays = 1;
      let newContinuousDays = 1;
      let lastAllowanceMonth = 0;

      if (summary) {
        newTotalDays = summary.total_days + 1;

        if (summary.current_month === currentMonth) {
          newMonthDays = summary.month_days + 1;
        } else {
          newMonthDays = 1;
        }

        const lastSignin = new Date(summary.last_signin_date);
        const lastSigninDate = new Date(lastSignin.getFullYear(), lastSignin.getMonth(), lastSignin.getDate());
        const dayDiff = Math.floor((today.getTime() - lastSigninDate.getTime()) / (1000 * 60 * 60 * 24));

        if (dayDiff === 1) {
          newContinuousDays = summary.continuous_days + 1;
        } else {
          newContinuousDays = 1;
        }

        lastAllowanceMonth = summary.last_allowance_month || 0;
      }

      // 管理员福利: 从管理员福利数据库读取, 仅校验签到句柄与文档记录匹配即可
      const normalizedHandle = normalizeHandle(handle)
      const welfareRecords = await ctx.database.get('ggcevo_admin_welfare', {})
      const isWelfareMember = welfareRecords.some(r =>
        r.handle && normalizeHandle(r.handle) === normalizedHandle
      )

      if (isWelfareMember && lastAllowanceMonth !== currentMonth) {
        monthlyAllowance = 50;
        gugubReward += monthlyAllowance;
        lastAllowanceMonth = currentMonth;
      }

      const monthRewardConfig: Record<number, number> = {
        7: 1,
        14: 2,
        21: 3,
        28: 4,
      };

      if (monthRewardConfig[newMonthDays]) {
        extraGugubReward = monthRewardConfig[newMonthDays];
        gugubReward += extraGugubReward;
      }

      await ctx.database.upsert('ggcevo_signin_summary', [{
        user_id: handle,
        total_days: newTotalDays,
        month_days: newMonthDays,
        current_month: currentMonth,
        continuous_days: newContinuousDays,
        last_signin_date: now,
        update_time: now,
        last_allowance_month: lastAllowanceMonth,
      }]);

      await ctx.database.create('ggcevo_signin_log', {
        user_id: handle,
        signin_date: now,
        signin_type: 0,
        reward_config: 'daily',
        create_time: now,
      });

      const updateBackpackItem = async (itemId: number, count: number) => {
        const [existing] = await ctx.database.get('ggcevo_backpack', { user_id: handle, item_id: itemId });
        const newCount = (existing?.count || 0) + count;
        if (existing) {
          await ctx.database.upsert('ggcevo_backpack', [{
            user_id: handle, item_id: itemId, count: newCount
          }]);
        } else {
          await ctx.database.create('ggcevo_backpack', {
            user_id: handle, item_id: itemId, count: newCount
          });
        }
      };

      await updateBackpackItem(1, goldReward);
      await updateBackpackItem(2, gugubReward);

      let message = `🎁 签到成功！\n获得 ${goldReward} 金币\n获得 3 咕咕币\n累计签到 ${newTotalDays} 天\n连续签到 ${newContinuousDays} 天`;
      if (extraGugubReward > 0) {
        message += `\n⭐ 本月第${newMonthDays}次签到额外奖励：${extraGugubReward} 咕咕币`;
      }
      if (monthlyAllowance > 0) {
        message += `\n💰 每月津贴：+${monthlyAllowance} 咕咕币`;
      }
      return `<quote id="${session.messageId}"/>${message}`;
    });

  // ========== 挖矿 (挂机收益) ==========
  // 每半小时产生 4 金币, 单次存储领取上限 24 小时, 领取后立即进入下一轮挖矿

  const MINING_HALF_HOUR_MIN = 30                // 每半小时
  const MINING_COINS_PER_HALF_HOUR = 4         // 每半小时收益 4 金币
  const MINING_MAX_MINUTES = 24 * 60           // 单次存储领取上限 24 小时

  ctx.command('ggcevo/挖矿', '领取挂机挖矿收益(每半小时4金币, 上限24小时)')
    .action(async (argv) => {
      const session = argv.session;
      const curfewMsg = checkCurfew('mining');
      if (curfewMsg) return `<quote id="${session.messageId}"/>${curfewMsg}`;
      const handle = await getHandle(session);
      if (!handle) {
        return `<quote id="${session.messageId}"/>🔒 需要先绑定游戏句柄。\n💡 使用 \`绑定句柄\` 命令进行绑定。`;
      }

      const now = new Date();
      const [mining] = await ctx.database.get('ggcevo_mining', { user_id: handle });

      // 首次挖矿: 初始化记录并开始本轮
      if (!mining) {
        await ctx.database.create('ggcevo_mining', {
          user_id: handle,
          start_time: now,
          total_minutes: 0,
          total_coins: 0,
          update_time: now,
        });
        return `<quote id="${session.messageId}"/>⛏️ 开始挂机挖矿！每半小时收益 4 金币，单次存储上限 24 小时，使用 挖矿 命令领取。`;
      }

      // 计算本轮已挖矿时长并封顶到 24 小时
      const elapsedMinutes = Math.floor((now.getTime() - new Date(mining.start_time).getTime()) / 60000);
      const cappedMinutes = Math.max(0, Math.min(elapsedMinutes, MINING_MAX_MINUTES));
      const earned = Math.floor(cappedMinutes / MINING_HALF_HOUR_MIN) * MINING_COINS_PER_HALF_HOUR;

      if (earned <= 0) {
        const restMinutes = MINING_HALF_HOUR_MIN - elapsedMinutes;
        return `<quote id="${session.messageId}"/>⛏️ 挖矿进行中，已累计挖矿 ${cappedMinutes} 分钟，还需 ${restMinutes} 分钟即可获得 ${MINING_COINS_PER_HALF_HOUR} 金币。`;
      }

      // 发放金币到背包
      const [existingGold] = await ctx.database.get('ggcevo_backpack', { user_id: handle, item_id: 1 });
      const newGoldCount = (existingGold?.count || 0) + earned;
      if (existingGold) {
        await ctx.database.upsert('ggcevo_backpack', [{
          user_id: handle, item_id: 1, count: newGoldCount
        }]);
      } else {
        await ctx.database.create('ggcevo_backpack', {
          user_id: handle, item_id: 1, count: newGoldCount
        });
      }

      // 更新累计统计并重置本轮挖矿时间 (立即进入下一轮)
      const newTotalMinutes = (mining.total_minutes || 0) + cappedMinutes;
      const newTotalCoins = (mining.total_coins || 0) + earned;
      await ctx.database.set('ggcevo_mining', { user_id: handle }, {
        start_time: now,
        total_minutes: newTotalMinutes,
        total_coins: newTotalCoins,
        update_time: now,
      });

      return `<quote id="${session.messageId}"/>⛏️ 挖矿结算！\n💰 获得 ${earned} 金币\n⏱️ 本轮挖矿 ${formatMiningDuration(cappedMinutes)}\n📊 累计挖矿 ${formatMiningDuration(newTotalMinutes)}，累计收益 ${newTotalCoins} 金币\n🌱 已自动进入下一轮挖矿。`;
    });

  // ========== 探索 (咕咕之战) ==========
  // 选择星系进行 12 小时探索, 结束后领取收益; 不同星系成功率/奖励不同

  const EXPLORE_DURATION_MIN = 12 * 60 // 探索时长 12 小时

  interface ExploreGalaxyConfig {
    id: number
    name: string
    desc: string
    successRate: number // 成功率(0-100)
    successCoins: number // 成功获得金币
    failCoins: number // 失败安慰金币(成功收益的一半)
    items?: { itemId: number; min: number; max: number; rate: number }[] // 成功时独立判定的道具掉落
  }

  const EXPLORE_GALAXIES: ExploreGalaxyConfig[] = [
    { id: 1, name: '天枢星系', desc: '成功率100%，成功获得80金币', successRate: 100, successCoins: 80, failCoins: 0 },
    { id: 2, name: '赤潮星系', desc: '成功率60%，成功获得120金币，失败获得60金币', successRate: 60, successCoins: 120, failCoins: 60 },
    {
      id: 3, name: '千帆星系', desc: '成功率80%，成功获得50金币，失败获得25金币，成功时概率获得补签券/咕咕币',
      successRate: 80, successCoins: 50, failCoins: 25,
      items: [
        { itemId: 9, min: 1, max: 1, rate: 10 }, // 补签券 x1 (10%)
        { itemId: 2, min: 1, max: 3, rate: 50 }, // 咕咕币 1-3 (50%)
      ],
    },
  ]

  ctx.command('ggcevo/探索', '选择星系进行12小时探索, 结束后领取收益')
    .action(async (argv) => {
      const session = argv.session;
      const curfewMsg = checkCurfew('explore');
      if (curfewMsg) return `<quote id="${session.messageId}"/>${curfewMsg}`;
      const handle = await getHandle(session);
      if (!handle) {
        return `<quote id="${session.messageId}"/>🔒 需要先绑定游戏句柄。\n💡 使用 \`绑定句柄\` 命令进行绑定。`;
      }

      const now = new Date();
      const [explore] = await ctx.database.get('ggcevo_explore', { user_id: handle });

      // 无进行中的探索: 先选择星系开始探索
      if (!explore) {
        const galaxyList = EXPLORE_GALAXIES.map(g => `${g.id}. ${g.name}（${g.desc}）`).join('\n');
        await session.send(`<quote id="${session.messageId}"/>🛸 选择一个星系开始探索（探索时长 12 小时）：\n${galaxyList}\n请回复星系编号(1/2/3)选择，回复其他内容取消。`);
        const choice = await session.prompt(30000);
        if (!choice) return `🛸 已取消探索。`;
        const galaxyId = parseInt(choice.trim(), 10);
        const galaxy = EXPLORE_GALAXIES.find(g => g.id === galaxyId);
        if (!galaxy) return `🛸 星系编号无效，已取消探索。`;

        await ctx.database.create('ggcevo_explore', {
          user_id: handle,
          galaxy_id: galaxy.id,
          start_time: now,
          update_time: now,
        });
        return `<quote id="${session.messageId}"/>🛸 探索开始！你选择了「${galaxy.name}」。\n⏱️ 探索将持续 12 小时，届时使用 探索 命令领取收益。`;
      }

      const galaxy = EXPLORE_GALAXIES.find(g => g.id === explore.galaxy_id);
      if (!galaxy) {
        // 星系配置不存在(理论上不会发生), 重置探索状态
        await ctx.database.remove('ggcevo_explore', { user_id: handle });
        return `<quote id="${session.messageId}"/>⚠️ 当前探索的星系不存在，已重置，请重新选择星系开始探索。`;
      }

      // 未满 12 小时: 提示剩余时间
      const elapsedMinutes = Math.floor((now.getTime() - new Date(explore.start_time).getTime()) / 60000);
      if (elapsedMinutes < EXPLORE_DURATION_MIN) {
        const restMinutes = EXPLORE_DURATION_MIN - elapsedMinutes;
        return `<quote id="${session.messageId}"/>🛸 探索进行中：${galaxy.name}\n⏱️ 还需 ${formatMiningDuration(restMinutes)} 完成探索。`;
      }

      // 满 12 小时: 结算探索结果
      const isSuccess = Math.random() * 100 < galaxy.successRate;
      const gold = isSuccess ? galaxy.successCoins : galaxy.failCoins;
      const rewardLines: string[] = [];
      const gainedTexts: string[] = [];

      // 成功时独立判定道具掉落(各道具概率互不影响, 失败无法获得任何道具)
      const droppedItems: { itemId: number; count: number }[] = [];
      if (isSuccess && galaxy.items) {
        for (const item of galaxy.items) {
          if (Math.random() * 100 >= item.rate) continue;
          const count = item.min + Math.floor(Math.random() * (item.max - item.min + 1));
          droppedItems.push({ itemId: item.itemId, count });
        }
      }

      // 发放金币
      if (gold > 0) {
        const [existingGold] = await ctx.database.get('ggcevo_backpack', { user_id: handle, item_id: 1 });
        const newGoldCount = (existingGold?.count || 0) + gold;
        if (existingGold) {
          await ctx.database.upsert('ggcevo_backpack', [{
            user_id: handle, item_id: 1, count: newGoldCount
          }]);
        } else {
          await ctx.database.create('ggcevo_backpack', {
            user_id: handle, item_id: 1, count: newGoldCount
          });
        }
        rewardLines.push(`💰 获得 ${gold} 金币`);
      }

      // 发放道具
      for (const g of droppedItems) {
        const [existing] = await ctx.database.get('ggcevo_backpack', { user_id: handle, item_id: g.itemId });
        const newCount = (existing?.count || 0) + g.count;
        if (existing) {
          await ctx.database.upsert('ggcevo_backpack', [{
            user_id: handle, item_id: g.itemId, count: newCount
          }]);
        } else {
          await ctx.database.create('ggcevo_backpack', {
            user_id: handle, item_id: g.itemId, count: newCount
          });
        }
        gainedTexts.push(`${ItemConfig[g.itemId] || `道具#${g.itemId}`} x${g.count}`);
      }
      if (gainedTexts.length) {
        rewardLines.push(`🎁 获得：${gainedTexts.join('、')}`);
      }

      // 更新探索统计(按星系维度)
      const [stat] = await ctx.database.get('ggcevo_explore_stats', { user_id: handle, galaxy_id: galaxy.id });
      const newStat = {
        user_id: handle,
        galaxy_id: galaxy.id,
        total_count: (stat?.total_count || 0) + 1,
        success_count: (stat?.success_count || 0) + (isSuccess ? 1 : 0),
        fail_count: (stat?.fail_count || 0) + (isSuccess ? 0 : 1),
        total_coins: (stat?.total_coins || 0) + gold,
        update_time: now,
      };
      if (stat) {
        await ctx.database.upsert('ggcevo_explore_stats', [newStat]);
      } else {
        await ctx.database.create('ggcevo_explore_stats', newStat);
      }

      // 清除本轮探索, 便于用户重新选择星系开始下一轮
      await ctx.database.remove('ggcevo_explore', { user_id: handle });

      const resultMsg = isSuccess
        ? `🛸 探索完成！「${galaxy.name}」探索成功！`
        : `🛸 探索完成！「${galaxy.name}」探索失败，获得安慰奖。`;
      const body = rewardLines.length ? `\n${rewardLines.join('\n')}` : '';
      return `<quote id="${session.messageId}"/>${resultMsg}${body}\n📊 该星系累计探索 ${newStat.total_count} 次，成功 ${newStat.success_count} 次，累计获得 ${newStat.total_coins} 金币\n🛸 可再次使用 探索 命令选择星系开启新的探索。`;
    });

  ctx.command('ggcevo/兑换 <name:string>')
    .action(async (argv, name) => {
      const session = argv.session;
      // 兑换成功及列表的登记提醒(仅在配置了活动兑换管理员名字时显示)
      const adminRegistTip = config.exchangeAdminName
        ? `\n📝 请在私聊中联系活动管理员 ${config.exchangeAdminName} 登记本次兑换信息。`
        : '';

      const handle = await getHandle(session);
      if (!handle) {
        return '🔒 需要先绑定游戏句柄。\n💡 使用 `绑定句柄` 命令进行绑定。';
      }

      const now = new Date();
      const dayOfWeek = now.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        return '❌ 兑换功能仅限工作日使用（周一至周五），请在工作日再来兑换！';
      }

      if (!name) {
        return '❌ 请输入兑换物品的名称！\n使用 `兑换列表` 查看可兑换物品。';
      }

      const matchedItems = Object.entries(ExchangeConfig).filter(([_, item]) =>
        item.name.includes(name)
      );

      if (matchedItems.length === 0) {
        return `❌ 不存在名为"${name}"的兑换物品！\n使用 \`兑换列表\` 查看可兑换物品。`;
      }

      if (matchedItems.length > 1) {
        const itemNames = matchedItems.map(([_, item]) => item.name).join('、');
        return `❌ 名称"${name}"匹配多个物品：${itemNames}\n请输入更完整的物品名称。`;
      }

      const [id, exchangeItem] = matchedItems[0];

      if (exchangeItem.quality === '限定') {
        return `❌ ${exchangeItem.name} 为限定物品，不可兑换！`;
      }

      const costMap: Record<string, number> = {
        't3': 3,
        't2': 4,
        't1': 5,
        't0': 6,
      };
      const costCount = exchangeItem.cost ?? costMap[exchangeItem.quality];

      const [couponItem] = await ctx.database.get('ggcevo_backpack', { user_id: handle, item_id: 3 });
      const couponCount = couponItem?.count || 0;

      if (couponCount < costCount) {
        return `❌ 兑换券不足！需要 ${costCount} 张兑换券，当前拥有 ${couponCount} 张。`;
      }

      if (exchangeItem.type === '道具') {
        const itemId = Number(id);

        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        const [thisMonthExchange] = await ctx.database.get('ggcevo_exchange_log', {
          user_id: handle,
          exchange_id: itemId,
          cost_type: 3,
          create_time: { $gte: startOfMonth, $lte: endOfMonth },
        });
        if (thisMonthExchange) {
          return `❌ 本月已兑换过 ${exchangeItem.name}，每月仅限兑换1个！`;
        }

        const [backpackItem] = await ctx.database.get('ggcevo_backpack', { user_id: handle, item_id: itemId });
        if (backpackItem && backpackItem.count >= 1) {
          return `❌ 你已经拥有 ${exchangeItem.name}，使用后才可以再次兑换！`;
        }
      } else if (exchangeItem.type !== '角色名称') {
        const [alreadyOwned] = await ctx.database.get('ggcevo_exchange_log', {
          user_id: handle,
          exchange_id: Number(id),
        });
        if (alreadyOwned) {
          return `❌ 你已经拥有 ${exchangeItem.name}，不可重复兑换！`;
        }
      }

      const newCouponCount = couponCount - costCount;
      if (couponItem) {
        await ctx.database.upsert('ggcevo_backpack', [{
          user_id: handle, item_id: 3, count: newCouponCount
        }]);
      }

      if (exchangeItem.type === '道具') {
        const itemId = Number(id);
        const [existingBackpack] = await ctx.database.get('ggcevo_backpack', { user_id: handle, item_id: itemId });
        if (existingBackpack) {
          await ctx.database.upsert('ggcevo_backpack', [{
            user_id: handle, item_id: itemId, count: 1,
          }]);
        } else {
          await ctx.database.create('ggcevo_backpack', {
            user_id: handle, item_id: itemId, count: 1,
          });
        }

        await ctx.database.create('ggcevo_exchange_log', {
          user_id: handle,
          exchange_id: itemId,
          cost_type: 3,
          create_time: now,
        });

        return `🎁 兑换成功！\n消耗 ${costCount} 张兑换券\n获得 ${exchangeItem.name}\n💡 使用 \`使用 赎罪券\` 来消耗此道具${adminRegistTip}`;
      }

      await ctx.database.create('ggcevo_exchange_log', {
        user_id: handle,
        exchange_id: Number(id),
        cost_type: 1,
        create_time: now,
      });

      return `🎁 兑换成功！\n消耗 ${costCount} 张兑换券\n获得 ${exchangeItem.name}（${exchangeItem.quality} - ${exchangeItem.type}）${adminRegistTip}`;
    });

  ctx.command('ggcevo/抽奖')
    .option('poolId', '-p <poolId:number> 抽奖池ID')
    .option('count', '-c <count:number> 抽奖次数')
    .action(async (argv) => {
      const session = argv.session;
      const curfewMsg = checkCurfew('lottery');
      if (curfewMsg) return curfewMsg;
      const { poolId = 2, count } = argv.options;

      const handle = await getHandle(session);
      if (!handle) {
        return '🔒 需要先绑定游戏句柄。\n💡 使用 `绑定句柄` 命令进行绑定。';
      }

      const poolName = LotteryPoolConfig[poolId] || '未知池';

      if (!LotteryPoolConfig[poolId]) {
        return `❌ 不存在ID为 ${poolId} 的奖池！`;
      }

      const isGoldPool = poolId === 1;
      const isSkinPool = poolId === 3;
      const isPetPool = poolId === 4;
      let costItemId: number;
      let costPerDraw: number;

      if (isGoldPool) {
        costItemId = 1;
        costPerDraw = 100;
      } else if (isSkinPool || isPetPool) {
        costItemId = 3;
        costPerDraw = 3;
      } else {
        costItemId = 2;
        costPerDraw = 1;
      }

      const [costItem] = await ctx.database.get('ggcevo_backpack', { user_id: handle, item_id: costItemId });
      const costItemCount = costItem?.count || 0;

      let drawCount: number;
      const maxDrawCount = Math.floor(costItemCount / costPerDraw);

      if (count !== undefined) {
        if (count <= 0) {
          return '❌ 抽奖次数必须大于0！';
        }
        if (isGoldPool && count % 10 !== 0) {
          return '❌ 金币池仅支持10连抽，抽奖次数必须为10的倍数（如10、20、30...）！';
        }
        if (count > maxDrawCount) {
          let costItemName: string;
          if (isGoldPool) {
            costItemName = '金币';
          } else if (isSkinPool || isPetPool) {
            costItemName = '兑换券';
          } else {
            costItemName = '咕咕币';
          }
          return `❌ ${costItemName}不足，当前拥有 ${costItemCount} ${costItemName}，需要 ${count * costPerDraw} ${costItemName}！`;
        }
        drawCount = count;
      } else {
        if (maxDrawCount <= 0 || (isGoldPool && maxDrawCount < 10)) {
          let costItemName: string;
          let required: number;
          if (isGoldPool) {
            costItemName = '金币';
            required = 10 * costPerDraw;
          } else if (isSkinPool || isPetPool) {
            costItemName = '兑换券';
            required = 1 * costPerDraw;
          } else {
            costItemName = '咕咕币';
            required = 1 * costPerDraw;
          }
          return `❌ ${costItemName}不足，当前拥有 ${costItemCount} ${costItemName}，至少需要 ${required} ${costItemName}！`;
        }
        const isNormalPool = !isGoldPool && !isSkinPool && !isPetPool;
        drawCount = isGoldPool ? 10 : (isNormalPool ? maxDrawCount : 1);
      }

      const now = new Date();

      const [lotteryStatus] = await ctx.database.get('ggcevo_lottery_status', { user_id: handle, lottery_id: poolId });
      let pityCounter = lotteryStatus?.pity_counter || 0;
      let rareHitCount = lotteryStatus?.rare_hit_count || 0;
      let pityTriggered = false;

      const ownedItems = new Set<number>();
      const exchangeLogs = await ctx.database.get('ggcevo_exchange_log', { user_id: handle });
      for (const log of exchangeLogs) {
        ownedItems.add(log.exchange_id);
      }

      if (isSkinPool) {
        const allSkinIds = Object.entries(ExchangeConfig)
          .filter(([_, item]) => item.type === '皮肤' && item.quality !== '限定')
          .map(([id]) => parseInt(id));
        if (allSkinIds.length > 0 && allSkinIds.every(id => ownedItems.has(id))) {
          return '❌ 你已经拥有全部可抽奖的皮肤，无法继续抽奖！';
        }
      } else if (isPetPool) {
        const allPetIds = Object.entries(ExchangeConfig)
          .filter(([_, item]) => item.type === '宠物')
          .map(([id]) => parseInt(id));
        if (allPetIds.length > 0 && allPetIds.every(id => ownedItems.has(id))) {
          return '❌ 你已经拥有全部可抽奖的宠物，无法继续抽奖！';
        }
      }

      const rewards: { itemId: number; count: number }[] = [];
      let totalGold = 0;
      let totalCoupon = 0;
      let totalMakeupCoupon = 0;
      let totalGugub = 0;
      let nothingCount = 0;

      for (let i = 0; i < drawCount; i++) {
        const isNormalPool = !isGoldPool && !isSkinPool;
        if (isNormalPool) {
          pityCounter++;
        }

        let gotSSR = false;

        if (isGoldPool) {
          const rand = Math.random() * 100;

          if (rand < 20) {
            nothingCount++;
          } else if (rand < 70) {
            rewards.push({ itemId: 1, count: 80 });
            totalGold += 80;
          } else if (rand < 85) {
            rewards.push({ itemId: 1, count: 150 });
            totalGold += 150;
          } else if (rand < 95) {
            rewards.push({ itemId: 2, count: 1 });
            totalGugub += 1;
          } else {
            rewards.push({ itemId: 9, count: 1 });
            totalMakeupCoupon += 1;
            gotSSR = true;
            rareHitCount++;
          }
        } else if (isSkinPool) {
          const skinItems = Object.entries(ExchangeConfig).filter(([_, item]) => item.type === '皮肤' && item.quality !== '限定');
          let t3Skins = skinItems.filter(([_, item]) => item.quality === 't3').map(([id]) => parseInt(id));
          let t2Skins = skinItems.filter(([_, item]) => item.quality === 't2').map(([id]) => parseInt(id));
          let t1Skins = skinItems.filter(([_, item]) => item.quality === 't1').map(([id]) => parseInt(id));

          t3Skins = t3Skins.filter(id => !ownedItems.has(id));
          t2Skins = t2Skins.filter(id => !ownedItems.has(id));
          t1Skins = t1Skins.filter(id => !ownedItems.has(id));

          if (t3Skins.length === 0 && t2Skins.length === 0 && t1Skins.length === 0) {
            rewards.push({ itemId: 0, count: 0 });
            nothingCount++;
          } else {
            const rand = Math.random() * 100;

            let prizeId: number;
            if (t3Skins.length > 0 && rand < 70) {
              prizeId = t3Skins[Math.floor(Math.random() * t3Skins.length)];
            } else if (t2Skins.length > 0 && rand < 90) {
              prizeId = t2Skins[Math.floor(Math.random() * t2Skins.length)];
            } else if (t1Skins.length > 0) {
              prizeId = t1Skins[Math.floor(Math.random() * t1Skins.length)];
              gotSSR = true;
              rareHitCount++;
            } else if (t2Skins.length > 0) {
              prizeId = t2Skins[Math.floor(Math.random() * t2Skins.length)];
            } else if (t3Skins.length > 0) {
              prizeId = t3Skins[Math.floor(Math.random() * t3Skins.length)];
            } else {
              prizeId = t1Skins[Math.floor(Math.random() * t1Skins.length)];
              gotSSR = true;
              rareHitCount++;
            }
            rewards.push({ itemId: prizeId, count: 1 });
          }
        } else if (isPetPool) {
          const petItems = Object.entries(ExchangeConfig).filter(([_, item]) => item.type === '宠物');
          let t3Pets = petItems.filter(([_, item]) => item.quality === 't3').map(([id]) => parseInt(id));
          let t2Pets = petItems.filter(([_, item]) => item.quality === 't2').map(([id]) => parseInt(id));
          let t1Pets = petItems.filter(([_, item]) => item.quality === 't1').map(([id]) => parseInt(id));
          let t0Pets = petItems.filter(([_, item]) => item.quality === 't0').map(([id]) => parseInt(id));

          t3Pets = t3Pets.filter(id => !ownedItems.has(id));
          t2Pets = t2Pets.filter(id => !ownedItems.has(id));
          t1Pets = t1Pets.filter(id => !ownedItems.has(id));
          t0Pets = t0Pets.filter(id => !ownedItems.has(id));

          if (t3Pets.length === 0 && t2Pets.length === 0 && t1Pets.length === 0 && t0Pets.length === 0) {
            rewards.push({ itemId: 0, count: 0 });
            nothingCount++;
          } else {
            const rand = Math.random() * 100;

            let prizeId: number;
            if (t3Pets.length > 0 && rand < 65) {
              prizeId = t3Pets[Math.floor(Math.random() * t3Pets.length)];
            } else if (t2Pets.length > 0 && rand < 85) {
              prizeId = t2Pets[Math.floor(Math.random() * t2Pets.length)];
            } else if (t1Pets.length > 0 && rand < 95) {
              prizeId = t1Pets[Math.floor(Math.random() * t1Pets.length)];
            } else if (t0Pets.length > 0) {
              prizeId = t0Pets[Math.floor(Math.random() * t0Pets.length)];
              gotSSR = true;
              rareHitCount++;
            } else if (t1Pets.length > 0) {
              prizeId = t1Pets[Math.floor(Math.random() * t1Pets.length)];
            } else if (t2Pets.length > 0) {
              prizeId = t2Pets[Math.floor(Math.random() * t2Pets.length)];
            } else if (t3Pets.length > 0) {
              prizeId = t3Pets[Math.floor(Math.random() * t3Pets.length)];
            } else {
              prizeId = t0Pets[Math.floor(Math.random() * t0Pets.length)];
              gotSSR = true;
              rareHitCount++;
            }
            rewards.push({ itemId: prizeId, count: 1 });
          }
        } else {
          if (pityCounter >= 90) {
            rewards.push({ itemId: 3, count: 1 });
            totalCoupon += 1;
            gotSSR = true;
            pityCounter = 0;
            rareHitCount++;
            pityTriggered = true;
          } else {
            const rand = Math.random() * 100;

            if (rand < 70) {
              rewards.push({ itemId: 1, count: 10 });
              totalGold += 10;
            } else if (rand < 90) {
              rewards.push({ itemId: 1, count: 20 });
              totalGold += 20;
            } else if (rand < 98) {
              rewards.push({ itemId: 1, count: 50 });
              totalGold += 50;
            } else if (rand < 99.5) {
              rewards.push({ itemId: 1, count: 100 });
              totalGold += 100;
            } else {
              rewards.push({ itemId: 3, count: 1 });
              totalCoupon += 1;
              gotSSR = true;
              pityCounter = 0;
              rareHitCount++;
            }
          }
        }
      }

      const newCostCount = costItemCount - drawCount * costPerDraw;
      if (costItem) {
        await ctx.database.upsert('ggcevo_backpack', [{
          user_id: handle, item_id: costItemId, count: newCostCount
        }]);
      }

      if (totalGold > 0) {
        const [goldItem] = await ctx.database.get('ggcevo_backpack', { user_id: handle, item_id: 1 });
        const newGoldCount = (goldItem?.count || 0) + totalGold;
        if (goldItem) {
          await ctx.database.upsert('ggcevo_backpack', [{
            user_id: handle, item_id: 1, count: newGoldCount
          }]);
        } else {
          await ctx.database.create('ggcevo_backpack', {
            user_id: handle, item_id: 1, count: newGoldCount
          });
        }
      }

      if (totalCoupon > 0) {
        const [couponItem] = await ctx.database.get('ggcevo_backpack', { user_id: handle, item_id: 3 });
        const newCouponCount = (couponItem?.count || 0) + totalCoupon;
        if (couponItem) {
          await ctx.database.upsert('ggcevo_backpack', [{
            user_id: handle, item_id: 3, count: newCouponCount
          }]);
        } else {
          await ctx.database.create('ggcevo_backpack', {
            user_id: handle, item_id: 3, count: newCouponCount
          });
        }
      }

      if (totalGugub > 0) {
        const [gugubItem] = await ctx.database.get('ggcevo_backpack', { user_id: handle, item_id: 2 });
        const newGugubCount = (gugubItem?.count || 0) + totalGugub;
        if (gugubItem) {
          await ctx.database.upsert('ggcevo_backpack', [{
            user_id: handle, item_id: 2, count: newGugubCount
          }]);
        } else {
          await ctx.database.create('ggcevo_backpack', {
            user_id: handle, item_id: 2, count: newGugubCount
          });
        }
      }

      if (totalMakeupCoupon > 0) {
        const [makeupItem] = await ctx.database.get('ggcevo_backpack', { user_id: handle, item_id: 9 });
        const newMakeupCount = (makeupItem?.count || 0) + totalMakeupCoupon;
        if (makeupItem) {
          await ctx.database.upsert('ggcevo_backpack', [{
            user_id: handle, item_id: 9, count: newMakeupCount
          }]);
        } else {
          await ctx.database.create('ggcevo_backpack', {
            user_id: handle, item_id: 9, count: newMakeupCount
          });
        }
      }

      if (isSkinPool || isPetPool) {
        for (const reward of rewards) {
          if (reward.itemId === 0 || reward.count === 0) continue;
          const [existingItem] = await ctx.database.get('ggcevo_backpack', { user_id: handle, item_id: reward.itemId });
          const newCount = (existingItem?.count || 0) + reward.count;
          if (existingItem) {
            await ctx.database.upsert('ggcevo_backpack', [{
              user_id: handle, item_id: reward.itemId, count: newCount
            }]);
          } else {
            await ctx.database.create('ggcevo_backpack', {
              user_id: handle, item_id: reward.itemId, count: newCount
            });
          }

          await ctx.database.create('ggcevo_exchange_log', {
            user_id: handle,
            exchange_id: reward.itemId,
            cost_type: 2,
            create_time: now,
          });
        }
      }

      let costTypeName: number;
      if (isGoldPool) {
        costTypeName = 1;
      } else if (isSkinPool || isPetPool) {
        costTypeName = 1;
      } else {
        costTypeName = 2;
      }
      for (let i = 0; i < drawCount; i++) {
        const reward = rewards[i] || { itemId: 0, count: 0 };
        await ctx.database.create('ggcevo_lottery_log', {
          user_id: handle,
          lottery_id: poolId,
          prize_id: reward.itemId,
          cost_type: costTypeName,
          cost_num: costPerDraw,
          draw_time: now,
        });
      }

      const newTotalDrawCount = (lotteryStatus?.total_draw_count || 0) + drawCount;
      const newPityTriggeredCount = (lotteryStatus?.pity_triggered_count || 0) + (pityTriggered ? 1 : 0);
      if (lotteryStatus) {
        await ctx.database.upsert('ggcevo_lottery_status', [{
          user_id: handle,
          lottery_id: poolId,
          pity_counter: pityCounter,
          total_draw_count: newTotalDrawCount,
          pity_triggered_count: newPityTriggeredCount,
          rare_hit_count: rareHitCount,
          update_time: now,
        }]);
      } else {
        await ctx.database.create('ggcevo_lottery_status', {
          user_id: handle,
          lottery_id: poolId,
          pity_counter: pityCounter,
          total_draw_count: newTotalDrawCount,
          pity_triggered_count: newPityTriggeredCount,
          rare_hit_count: rareHitCount,
          update_time: now,
        });
      }

      let costItemName: string;
      if (isGoldPool) {
        costItemName = '金币';
      } else if (isSkinPool || isPetPool) {
        costItemName = '兑换券';
      } else {
        costItemName = '咕咕币';
      }
      let result = `🎰 使用 ${drawCount * costPerDraw} ${costItemName}进行了 ${drawCount} 次${poolName}抽奖！\n`;

      if (isSkinPool) {
        const skinRewards: { name: string; quality: string }[] = [];
        for (const reward of rewards) {
          const item = ExchangeConfig[reward.itemId];
          if (item) {
            skinRewards.push({ name: item.name, quality: item.quality });
          }
        }
        if (skinRewards.length === 0 && nothingCount > 0) {
          result += `💨 获得的物品均已拥有\n`;
        }
        for (const skin of skinRewards) {
          let qualityEmoji = '';
          switch (skin.quality) {
            case 't1': qualityEmoji = '⭐'; break;
            case 't2': qualityEmoji = '✨'; break;
            case 't3': qualityEmoji = '💫'; break;
          }
          result += `${qualityEmoji} 获得 ${skin.name}（${skin.quality}）\n`;
        }
      } else if (isPetPool) {
        const petRewards: { name: string; quality: string }[] = [];
        for (const reward of rewards) {
          const item = ExchangeConfig[reward.itemId];
          if (item) {
            petRewards.push({ name: item.name, quality: item.quality });
          }
        }
        if (petRewards.length === 0 && nothingCount > 0) {
          result += `💨 获得的物品均已拥有\n`;
        }
        for (const pet of petRewards) {
          let qualityEmoji = '';
          switch (pet.quality) {
            case 't0': qualityEmoji = '👑'; break;
            case 't1': qualityEmoji = '⭐'; break;
            case 't2': qualityEmoji = '✨'; break;
            case 't3': qualityEmoji = '💫'; break;
          }
          result += `${qualityEmoji} 获得 ${pet.name}（${pet.quality}）\n`;
        }
      } else {
        if (totalGold > 0) result += `💰 获得 ${totalGold} 金币\n`;
        if (totalGugub > 0) result += `🪙 获得 ${totalGugub} 咕咕币\n`;
        if (totalCoupon > 0) result += `🎫 获得 ${totalCoupon} 兑换券\n`;
        if (totalMakeupCoupon > 0) result += `🎟️ 获得 ${totalMakeupCoupon} 补签券\n`;
        if (nothingCount > 0) result += `💨 ${nothingCount} 次未获得物品\n`;
      }
      result += `累计抽奖次数：${newTotalDrawCount}`;
      if (!isGoldPool && !isSkinPool && !isPetPool) {
        result += `\n🔮 保底进度：${pityCounter}/90`;
      }

      return result;
    });

  ctx.command('ggcevo/背包')
    .action(async (argv) => {
      const session = argv.session;
      const handle = await getHandle(session);
      if (!handle) {
        return `<quote id="${session.messageId}"/>🔒 需要先绑定游戏句柄。\n💡 使用 \`绑定句柄\` 命令进行绑定。`;
      }

      const backpackItems = await ctx.database.get('ggcevo_backpack', { user_id: handle });

      if (backpackItems.length === 0) {
        return `<quote id="${session.messageId}"/>🎒 背包是空的，快去签到或抽奖获得物品吧！`;
      }

      let message = `🎒 ${session.username}的背包物品：\n`;
      for (const item of backpackItems) {
        const itemName = ItemConfig[item.item_id];
        if (!itemName) continue;
        message += `${itemName} x${item.count}\n`;
      }

      return `<quote id="${session.messageId}"/>${message}`;
    });

  ctx.command('ggcevo/个人信息')
    .action(async (argv) => {
      const session = argv.session;
      const handle = await getHandle(session);
      if (!handle) {
        return `<quote id="${session.messageId}"/>🔒 需要先绑定游戏句柄。\n💡 使用 \`绑定句柄\` 命令进行绑定。`;
      }

      const username = session.username || '未知用户';
      let message = `👤 个人信息\n`;
      message += `─────────────\n`;
      message += `用户名：${username}\n`;
      message += `游戏句柄：${handle}\n`;

      const [signinSummary] = await ctx.database.get('ggcevo_signin_summary', { user_id: handle });
      if (signinSummary) {
        const lastSigninDate = signinSummary.last_signin_date
          ? new Date(signinSummary.last_signin_date).toLocaleDateString('zh-CN')
          : '从未签到';
        message += `─────────────\n`;
        message += `📅 签到信息\n`;
        message += `累计签到：${signinSummary.total_days} 天\n`;
        message += `本月签到：${signinSummary.month_days} 天\n`;
        message += `连续签到：${signinSummary.continuous_days} 天\n`;
        message += `最后签到：${lastSigninDate}\n`;
      } else {
        message += `─────────────\n`;
        message += `📅 签到信息：暂无签到记录\n`;
      }

      const lotteryStatuses = await ctx.database.get('ggcevo_lottery_status', { user_id: handle });
      if (lotteryStatuses.length > 0) {
        message += `─────────────\n`;
        message += `🎰 抽奖信息\n`;
        for (const status of lotteryStatuses) {
          const poolName = LotteryPoolConfig[status.lottery_id] || '未知奖池';
          message += `【${poolName}】\n`;
          message += `  累计抽奖：${status.total_draw_count} 次\n`;
          if (status.lottery_id === 2) {
            message += `  🔮 保底进度：${status.pity_counter}/90\n`;
            message += `  保底触发：${status.pity_triggered_count} 次\n`;
            message += `  稀有命中：${status.rare_hit_count} 次\n`;
          }
        }
      } else {
        message += `─────────────\n`;
        message += `🎰 抽奖信息：暂无抽奖记录\n`;
      }

      const allExchangeLogs = await ctx.database.get('ggcevo_exchange_log', { user_id: handle });
      const exchangeLogs = allExchangeLogs.filter(log => log.cost_type !== 3 && log.cost_type !== 4);
      if (exchangeLogs.length > 0) {
        message += `─────────────\n`;
        message += `🎁 兑换记录\n`;
        const sortedLogs = exchangeLogs.sort((a, b) =>
          new Date(b.create_time).getTime() - new Date(a.create_time).getTime()
        ).slice(0, 10);
        for (const log of sortedLogs) {
          const itemName = ExchangeConfig[log.exchange_id]?.name || '未知物品';
          const costType = log.cost_type === 1 ? '兑换' : log.cost_type === 2 ? '抽奖获得' : '其他';
          const createTime = new Date(log.create_time).toLocaleDateString('zh-CN');
          message += `${createTime} ${itemName}（${costType}）\n`;
        }
      } else {
        message += `─────────────\n`;
        message += `🎁 兑换记录：暂无兑换记录\n`;
      }

      const atonementLogs = allExchangeLogs.filter(log => log.cost_type === 4);
      if (atonementLogs.length > 0) {
        message += `─────────────\n`;
        message += `📿 赎罪券使用记录\n`;
        const sortedAtonementLogs = atonementLogs.sort((a, b) =>
          new Date(b.create_time).getTime() - new Date(a.create_time).getTime()
        ).slice(0, 3);
        for (const log of sortedAtonementLogs) {
          const createTime = new Date(log.create_time).toLocaleString('zh-CN');
          message += `  ${createTime}\n`;
        }
      }

      return `<quote id="${session.messageId}"/>${message}`;
    });

  ctx.command('ggcevo/给予 <targetId> <itemId> <count:number>', { authority: 3 })
    .action(async (argv, targetId, itemId, count) => {
      const session = argv.session;

      let resolvedTargetId = targetId;
      const atElements = session.elements?.filter(e => e.type === 'at');
      if (atElements && atElements.length > 0) {
        const mentionedUserId = atElements[0].attrs.id;
        const [profile] = await ctx.database.get('sc2arcade_player', { userId: mentionedUserId, isActive: true });
        if (profile) {
          resolvedTargetId = `${profile.regionId}-S2-${profile.realmId}-${profile.profileId}`;
        } else {
          return '❌ @提及的用户未绑定游戏句柄！';
        }
      }

      let resolvedItemId: number;
      const parsedId = parseInt(itemId);
      if (!isNaN(parsedId)) {
        resolvedItemId = parsedId;
      } else {
        const itemConfigEntry = Object.entries(ItemConfig).find(([_, name]) => name === itemId);
        if (itemConfigEntry) {
          resolvedItemId = parseInt(itemConfigEntry[0]);
        } else {
          const exchangeConfigEntry = Object.entries(ExchangeConfig).find(([_, item]) => item.name === itemId);
          if (exchangeConfigEntry) {
            resolvedItemId = parseInt(exchangeConfigEntry[0]);
          } else {
            return `❌ 未找到名为 "${itemId}" 的物品！`;
          }
        }
      }

      const itemName = ItemConfig[resolvedItemId] || ExchangeConfig[resolvedItemId]?.name;
      if (!itemName) {
        return `❌ 不存在ID为 ${resolvedItemId} 的物品！`;
      }

      if (count <= 0) {
        return '❌ 数量必须大于0！';
      }

      const [targetItem] = await ctx.database.get('ggcevo_backpack', { user_id: resolvedTargetId, item_id: resolvedItemId });
      const targetCount = (targetItem?.count || 0) + count;
      if (targetItem) {
        await ctx.database.upsert('ggcevo_backpack', [{
          user_id: resolvedTargetId, item_id: resolvedItemId, count: targetCount
        }]);
      } else {
        await ctx.database.create('ggcevo_backpack', {
          user_id: resolvedTargetId, item_id: resolvedItemId, count: targetCount
        });
      }

      return `✅ 成功给予 ${resolvedTargetId} ${count} 个${itemName}！`;
    });

  ctx.command('ggcevo/抽奖概率')
    .action(async () => {
      let message = `🎰 抽奖概率说明\n`;
      message += `─────────────\n`;
      message += `【使用方法】\n`;
      message += `  抽奖 [-p 奖池ID] [-c 次数]\n`;
      message += `  -p 指定奖池（默认普通池）：1=金币池，2=普通池，3=皮肤池，4=宠物池\n`;
      message += `  -c 指定抽奖次数（金币池默认10连抽，普通池默认全抽，皮肤/宠物池默认单抽）\n`;
      message += `─────────────\n`;
      message += `【金币池】ID:1 消耗：100金币/次\n`;
      message += `  20% 空手而归\n`;
      message += `  50% 获得 80 金币\n`;
      message += `  15% 获得 150 金币\n`;
      message += `  10% 获得 咕咕币 x1\n`;
      message += `  5% 获得 补签券 x1\n`;
      message += `─────────────\n`;
      message += `【普通池】ID:2 消耗：1咕咕币/次\n`;
      message += `  保底：90次必出 兑换券\n`;
      message += `  70% 获得 10 金币\n`;
      message += `  20% 获得 20 金币\n`;
      message += `  8% 获得 50 金币\n`;
      message += `  1.5% 获得 100 金币\n`;
      message += `  0.5% 获得 兑换券\n`;
      message += `─────────────\n`;
      message += `【皮肤池】ID:3 消耗：3兑换券/次\n`;
      message += `  70% 获得 T3 皮肤\n`;
      message += `  20% 获得 T2 皮肤\n`;
      message += `  10% 获得 T1 皮肤\n`;
      message += `  不会抽到已拥有的物品\n`;
      message += `─────────────\n`;
      message += `【宠物池】ID:4 消耗：3兑换券/次\n`;
      message += `  65% 获得 T3 宠物\n`;
      message += `  20% 获得 T2 宠物\n`;
      message += `  10% 获得 T1 宠物\n`;
      message += `  5% 获得 T0 宠物\n`;
      message += `  不会抽到已拥有的物品\n`;
      return message;
    });

  ctx.command('ggcevo/签到奖励')
    .action(async () => {
      let message = `📅 签到奖励说明\n`;
      message += `─────────────\n`;
      message += `【每日基础奖励】\n`;
      message += `  金币：10~20（随机）\n`;
      message += `  咕咕币：3\n`;
      message += `─────────────\n`;
      message += `【本月累计签到额外奖励】\n`;
      message += `  本月第7天：+1 咕咕币\n`;
      message += `  本月第14天：+2 咕咕币\n`;
      message += `  本月第21天：+3 咕咕币\n`;
      message += `  本月第28天：+4 咕咕币\n`;
      message += `─────────────\n`;
      message += `【每月津贴】\n`;
      message += `  仅管理员/群主可领取\n`;
      message += `  每月首次签到额外奖励：+50 咕咕币\n`;
      return message;
    });

  ctx.command('ggcevo/兑换列表')
    .alias('兑换表')
    .action(async () => {
      let message = `🎁 可兑换物品列表\n`;
      message += `─────────────\n`;
      message += `【T3 皮肤】消耗：3 兑换券\n`;
      const t3Skins = Object.entries(ExchangeConfig).filter(([_, item]) => item.type === '皮肤' && item.quality === 't3');
      for (const [id, item] of t3Skins) {
        message += `  ${item.name}\n`;
      }
      message += `─────────────\n`;
      message += `【T2 皮肤】消耗：4 兑换券\n`;
      const t2Skins = Object.entries(ExchangeConfig).filter(([_, item]) => item.type === '皮肤' && item.quality === 't2');
      for (const [id, item] of t2Skins) {
        message += `  ${item.name}\n`;
      }
      message += `─────────────\n`;
      message += `【T1 皮肤】消耗：5 兑换券\n`;
      const t1Skins = Object.entries(ExchangeConfig).filter(([_, item]) => item.type === '皮肤' && item.quality === 't1');
      for (const [id, item] of t1Skins) {
        message += `  ${item.name}\n`;
      }
      message += `─────────────\n`;
      message += `【T3 宠物】消耗：3 兑换券\n`;
      const t3Pets = Object.entries(ExchangeConfig).filter(([_, item]) => item.type === '宠物' && item.quality === 't3');
      for (const [id, item] of t3Pets) {
        message += `  ${item.name}\n`;
      }
      message += `─────────────\n`;
      message += `【T2 宠物】消耗：4 兑换券\n`;
      const t2Pets = Object.entries(ExchangeConfig).filter(([_, item]) => item.type === '宠物' && item.quality === 't2');
      for (const [id, item] of t2Pets) {
        message += `  ${item.name}\n`;
      }
      message += `─────────────\n`;
      message += `【T1 宠物】消耗：5 兑换券\n`;
      const t1Pets = Object.entries(ExchangeConfig).filter(([_, item]) => item.type === '宠物' && item.quality === 't1');
      for (const [id, item] of t1Pets) {
        message += `  ${item.name}\n`;
      }
      message += `─────────────\n`;
      message += `【T0 宠物】消耗：6 兑换券\n`;
      const t0Pets = Object.entries(ExchangeConfig).filter(([_, item]) => item.type === '宠物' && item.quality === 't0');
      for (const [id, item] of t0Pets) {
        message += `  ${item.name}\n`;
      }
      message += `─────────────\n`;
      message += `【入场特效】消耗：5 兑换券\n`;
      const effects = Object.entries(ExchangeConfig).filter(([_, item]) => item.type === '入场特效');
      for (const [id, item] of effects) {
        message += `  ${item.name}\n`;
      }
      message += `─────────────\n`;
      message += `【角色名称】\n`;
      const costMap: Record<string, number> = { 't3': 3, 't2': 4, 't1': 5, 't0': 6 };
      const roleNames = Object.entries(ExchangeConfig).filter(([_, item]) => item.type === '角色名称');
      for (const [id, item] of roleNames) {
        const cost = item.cost ?? costMap[item.quality];
        message += `  ${item.name}（消耗：${cost} 兑换券）\n`;
      }
      message += `─────────────\n`;
      message += `【物品】\n`;
      const items = Object.entries(ExchangeConfig).filter(([_, item]) => item.type === '物品');
      for (const [id, item] of items) {
        const cost = item.cost ?? costMap[item.quality];
        message += `  ${item.name}（消耗：${cost} 兑换券）\n`;
      }
      message += `─────────────\n`;
      message += `【道具】\n`;
      const props = Object.entries(ExchangeConfig).filter(([_, item]) => item.type === '道具');
      for (const [id, item] of props) {
        const cost = item.cost ?? costMap[item.quality];
        message += `  ${item.name}（消耗：${cost} 兑换券）\n`;
      }
      message += `─────────────\n`;
      message += `⚠️ 兑换功能仅限工作日使用（周一至周五兑换，周六/周日实装进咕咕虫）\n`;
      if (config.exchangeAdminName) {
        message += `⚠️ 兑换完成后请在私聊中联系活动管理员 ${config.exchangeAdminName} 登记\n`;
      }
      return message;
    });

  ctx.command('ggcevo/创建活动', { authority: 3 })
    .option('name', '-n <name:string> 活动名称')
    .option('description', '-d <description:string> 活动描述')
    .option('rewardItem', '-r <rewardItem:number> 奖励物品ID')
    .option('rewardAmount', '-a <rewardAmount:number> 奖励数量')
    .option('startTime', '-s <startTime:string> 开始时间 (格式: YYYY-MM-DD)')
    .option('endTime', '-e <endTime:string> 结束时间 (格式: YYYY-MM-DD)')
    .option('maxClaims', '-m <maxClaims:number> 总领取上限 (0=无限制)')
    .option('requiredGroup', '-g <requiredGroup:string> 限制领取的群聊ID (空=无限制)')
    .action(async (argv) => {
      const { options } = argv;

      if (!options.name || !options.description || options.rewardItem === undefined || options.rewardAmount === undefined) {
        return `❌ 参数不足！\n格式：创建活动 -n <活动名称> -d <活动描述> -r <奖励物品ID> -a <奖励数量> [-s <开始时间>] [-e <结束时间>] [-m <领取上限>] [-g <限制群聊ID>]\n示例：创建活动 -n 每日签到 -d 签到领取奖励 -r 1 -a 100\n（开始时间默认当天，结束时间默认7天后，领取上限默认0次=无限制，群聊ID为空则无限制）`;
      }

      const rewardItemId = options.rewardItem;
      const itemName = ItemConfig[rewardItemId];
      if (!itemName) {
        return `❌ 不存在ID为 ${rewardItemId} 的物品！`;
      }

      const rewardAmount = options.rewardAmount;
      if (rewardAmount <= 0) {
        return `❌ 奖励数量必须大于0！`;
      }

      const maxClaims = options.maxClaims !== undefined ? options.maxClaims : 0;
      const requiredGroup = options.requiredGroup || '';

      let startTime: Date;
      let endTime: Date;
      try {
        if (options.startTime) {
          const startParts = options.startTime.split('-');
          if (startParts.length !== 3) throw new Error('Invalid start time');
          startTime = new Date(parseInt(startParts[0]), parseInt(startParts[1]) - 1, parseInt(startParts[2]), 0, 0, 0);
          if (isNaN(startTime.getTime())) throw new Error('Invalid start time');
        } else {
          const now = new Date();
          startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        }

        if (options.endTime) {
          const endParts = options.endTime.split('-');
          if (endParts.length !== 3) throw new Error('Invalid end time');
          endTime = new Date(parseInt(endParts[0]), parseInt(endParts[1]) - 1, parseInt(endParts[2]), 23, 59, 59);
          if (isNaN(endTime.getTime())) throw new Error('Invalid end time');
        } else {
          endTime = new Date(startTime);
          endTime.setDate(endTime.getDate() + 7);
          endTime.setHours(23, 59, 59);
        }

        if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
          throw new Error('Invalid date');
        }
      } catch {
        return `❌ 时间格式错误！请使用格式：YYYY-MM-DD`;
      }

      if (startTime >= endTime) {
        return `❌ 开始时间必须早于结束时间！`;
      }

      const now = new Date();
      await ctx.database.create('ggcevo_activity', {
        name: options.name,
        description: options.description,
        reward_item: rewardItemId,
        reward_amount: rewardAmount,
        start_time: startTime,
        end_time: endTime,
        max_claims: maxClaims,
        required_group: requiredGroup,
        created_at: now,
      });

      const maxClaimsText = maxClaims === 0 ? '无限制' : `${maxClaims}次`;
      const requiredGroupText = requiredGroup === '' ? '无限制' : requiredGroup;
      return `✅ 活动创建成功！\n─────────────\n📛 活动名称：${options.name}\n📝 活动描述：${options.description}\n🎁 奖励物品：${itemName} x${rewardAmount}\n⏰ 开始时间：${startTime.toLocaleString('zh-CN')}\n⏰ 结束时间：${endTime.toLocaleString('zh-CN')}\n📊 总领取上限：${maxClaimsText}\n👥 限制群聊：${requiredGroupText}`;
    });

  ctx.command('ggcevo/领取活动 [activityId:number]')
    .action(async (argv, activityId) => {
      const session = argv.session;
      const handle = await getHandle(session);
      if (!handle) {
        return `<quote id="${session.messageId}"/>🔒 需要先绑定游戏句柄。\n💡 使用 \`绑定句柄\` 命令进行绑定。`;
      }

      if (activityId === undefined || activityId === null) {
        return `<quote id="${session.messageId}"/>❌ 请输入活动ID！\n使用 活动列表 查询可领取的活动`;
      }

      const [activity] = await ctx.database.get('ggcevo_activity', { id: activityId });
      if (!activity) {
        return `<quote id="${session.messageId}"/>❌ 不存在ID为 ${activityId} 的活动！`;
      }

      const now = new Date();
      const startTime = new Date(activity.start_time);
      const endTime = new Date(activity.end_time);

      if (now < startTime) {
        return `<quote id="${session.messageId}"/>⏰ 活动尚未开始，开始时间：${startTime.toLocaleString('zh-CN')}`;
      }

      if (now > endTime) {
        return `<quote id="${session.messageId}"/>⏱️ 活动已结束，结束时间：${endTime.toLocaleString('zh-CN')}`;
      }

      if (activity.required_group && activity.required_group !== '') {
        const currentChannelId = session.channelId || (session.event?.channel?.id as string);
        if (!currentChannelId) {
          return `<quote id="${session.messageId}"/>❌ 无法获取当前群聊信息！`;
        }
        if (currentChannelId !== activity.required_group) {
          return `<quote id="${session.messageId}"/>❌ 该活动仅限在指定群聊内领取！\n请前往群聊ID: ${activity.required_group} 领取`;
        }
      }

      if (activity.max_claims > 0) {
        const totalClaims = await ctx.database.get('ggcevo_activity_claim_log', { activity_id: activityId });
        if (totalClaims.length >= activity.max_claims) {
          return `<quote id="${session.messageId}"/>❌ 该活动领取次数已用尽！`;
        }
      }

      const [existingClaim] = await ctx.database.get('ggcevo_activity_claim_log', {
        activity_id: activityId,
        user_id: handle,
      });

      if (existingClaim) {
        return `<quote id="${session.messageId}"/>❌ 您已经领取过该活动了！`;
      }

      await ctx.database.create('ggcevo_activity_claim_log', {
        activity_id: activityId,
        user_id: handle,
        claimed_at: now,
      });

      const rewardItemName = ItemConfig[activity.reward_item] || '未知物品';
      const updateBackpackItem = async (itemId: number, count: number) => {
        const [existing] = await ctx.database.get('ggcevo_backpack', { user_id: handle, item_id: itemId });
        const newCount = (existing?.count || 0) + count;
        if (existing) {
          await ctx.database.upsert('ggcevo_backpack', [{
            user_id: handle, item_id: itemId, count: newCount
          }]);
        } else {
          await ctx.database.create('ggcevo_backpack', {
            user_id: handle, item_id: itemId, count: newCount
          });
        }
      };

      await updateBackpackItem(activity.reward_item, activity.reward_amount);

      return `<quote id="${session.messageId}"/>🎉 领取成功！\n─────────────\n📛 活动：${activity.name}\n🎁 获得：${rewardItemName} x${activity.reward_amount}`;
    });

  ctx.command('ggcevo/活动列表 [showAll]')
    .action(async (argv, showAll) => {
      const activities = await ctx.database.get('ggcevo_activity', {});
      if (activities.length === 0) {
        return `📋 暂无活动`;
      }

      const now = new Date();
      // 默认(不带参数)只显示进行中与未开始的活动, 不显示已过期活动
      // 带任意参数(如 all/全部)则显示全部活动
      const showExpired = !!showAll;
      const visibleActivities = activities.filter(activity => {
        const endTime = new Date(activity.end_time);
        if (now > endTime && !showExpired) return false;  // 过滤已过期
        return true;
      });

      if (visibleActivities.length === 0) {
        return `📋 暂无进行中或未开始的活动\n💡 输入 "活动列表 全部" 可查看包含已过期在内的全部活动`;
      }

      let message = `📋 活动列表\n`;
      message += `─────────────\n`;

      for (const activity of visibleActivities) {
        const startTime = new Date(activity.start_time);
        const endTime = new Date(activity.end_time);
        const rewardItemName = ItemConfig[activity.reward_item] || '未知物品';

        let status = '';
        if (now < startTime) {
          status = '🔘 未开始';
        } else if (now > endTime) {
          status = '⏱️ 已结束';
        } else {
          status = '✅ 进行中';
        }

        let claimsInfo = '';
        if (activity.max_claims > 0) {
          const claimLogs = await ctx.database.get('ggcevo_activity_claim_log', { activity_id: activity.id });
          const claimCount = claimLogs.length;
          const remainingCount = activity.max_claims - claimCount;
          claimsInfo = `${remainingCount}/${activity.max_claims}`;
        }

        const requiredGroupText = (activity.required_group && activity.required_group !== '') ? activity.required_group : '无限制';

        message += `【${activity.id}】${activity.name} ${status}\n`;
        message += `  描述：${activity.description}\n`;
        message += `  奖励：${rewardItemName} x${activity.reward_amount}\n`;
        message += `  时间：${startTime.toLocaleDateString('zh-CN')} ~ ${endTime.toLocaleDateString('zh-CN')}\n`;
        if (claimsInfo) {
          message += `  剩余：${claimsInfo}\n`;
        }
        message += `  限制群聊：${requiredGroupText}\n`;
        message += `─────────────\n`;
      }

      return message;
    });

  ctx.command('ggcevo/补签')
    .action(async (argv) => {
      const session = argv.session;
      const handle = await getHandle(session);
      if (!handle) {
        return '🔒 需要先绑定游戏句柄。\n💡 使用 `绑定句柄` 命令进行绑定。';
      }

      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      const currentMonthNum = currentYear * 100 + (currentMonth + 1);

      const [makeupCoupon] = await ctx.database.get('ggcevo_backpack', { user_id: handle, item_id: 9 });
      const couponCount = makeupCoupon?.count || 0;
      if (couponCount <= 0) {
        return '❌ 补签券不足！需要1张补签券进行补签。';
      }

      const startOfMonth = new Date(currentYear, currentMonth, 1);
      const endOfMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);

      const existingLogs = await ctx.database.get('ggcevo_signin_log', {
        user_id: handle,
        signin_date: { $gte: startOfMonth, $lte: endOfMonth },
      });

      const signedDates = new Set<string>();
      for (const log of existingLogs) {
        const date = new Date(log.signin_date);
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        signedDates.add(dateStr);
      }

      const today = new Date(currentYear, currentMonth, now.getDate());
      const missedDates: Date[] = [];
      for (let d = new Date(startOfMonth); d < today; d.setDate(d.getDate() + 1)) {
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (!signedDates.has(dateStr)) {
          missedDates.push(new Date(d));
        }
      }

      if (missedDates.length === 0) {
        return '📅 本月没有可补签的日期！';
      }

      const earliestMissedDate = missedDates[0];

      const [summary] = await ctx.database.get('ggcevo_signin_summary', { user_id: handle });
      let currentMonthDays = 0;
      if (summary && summary.current_month === currentMonthNum) {
        currentMonthDays = summary.month_days;
      }
      const newMonthDaysAfterMakeup = currentMonthDays + 1;

      const monthRewardConfig: Record<number, number> = {
        7: 1,
        14: 2,
        21: 3,
        28: 4,
      };

      let gugubReward = 3;
      let extraGugubReward = 0;
      if (monthRewardConfig[newMonthDaysAfterMakeup]) {
        extraGugubReward = monthRewardConfig[newMonthDaysAfterMakeup];
        gugubReward += extraGugubReward;
      }

      await ctx.database.upsert('ggcevo_backpack', [{
        user_id: handle,
        item_id: 9,
        count: couponCount - 1,
      }]);

      await ctx.database.create('ggcevo_signin_log', {
        user_id: handle,
        signin_date: earliestMissedDate,
        signin_type: 1,
        reward_config: 'makeup',
        create_time: now,
      });

      const [gugubItem] = await ctx.database.get('ggcevo_backpack', { user_id: handle, item_id: 2 });
      const newGugubCount = (gugubItem?.count || 0) + gugubReward;
      if (gugubItem) {
        await ctx.database.upsert('ggcevo_backpack', [{
          user_id: handle,
          item_id: 2,
          count: newGugubCount,
        }]);
      } else {
        await ctx.database.create('ggcevo_backpack', {
          user_id: handle,
          item_id: 2,
          count: newGugubCount,
        });
      }

      let newMonthDays = newMonthDaysAfterMakeup;
      let newTotalDays = 1;
      if (summary) {
        newTotalDays = summary.total_days + 1;
      }

      await ctx.database.upsert('ggcevo_signin_summary', [{
        user_id: handle,
        total_days: newTotalDays,
        month_days: newMonthDays,
        current_month: currentMonthNum,
        continuous_days: summary?.continuous_days || 0,
        last_signin_date: summary?.last_signin_date || now,
        update_time: now,
        last_allowance_month: summary?.last_allowance_month || 0,
      }]);

      const dateStr = earliestMissedDate.toLocaleDateString('zh-CN');
      let message = `🎁 补签成功！\n补签日期：${dateStr}\n消耗：1 补签券\n获得：3 咕咕币\n本月签到：${newMonthDays} 天\n累计签到：${newTotalDays} 天`;
      if (extraGugubReward > 0) {
        message += `\n⭐ 本月第${newMonthDays}次签到额外奖励：${extraGugubReward} 咕咕币`;
      }
      return message;
    });

  ctx.command('ggcevo/使用 <name:string>')
    .action(async (argv, name) => {
      const session = argv.session;

      const handle = await getHandle(session);
      if (!handle) {
        return '🔒 需要先绑定游戏句柄。\n💡 使用 `绑定句柄` 命令进行绑定。';
      }

      if (!name || name !== '赎罪券') {
        return '❌ 仅支持使用赎罪券！\n💡 输入 `使用 赎罪券` 来消耗此道具。';
      }

      const itemId = 23;
      const [backpackItem] = await ctx.database.get('ggcevo_backpack', { user_id: handle, item_id: itemId });
      const itemCount = backpackItem?.count || 0;
      if (itemCount <= 0) {
        return '❌ 你没有赎罪券！请先通过兑换获取。';
      }

      await session.send('⚠️ 使用赎罪券后，请在 2 小时内联系活动管理员，否则视为作废使用！\n💬 输入 "确认" 继续使用，输入其他内容取消。');
      const confirm = await session.prompt(120000);
      if (!confirm || confirm.trim() !== '确认') {
        return '❌ 已取消使用赎罪券。';
      }

      const now = new Date();
      const newCount = itemCount - 1;
      if (newCount <= 0) {
        await ctx.database.remove('ggcevo_backpack', { user_id: handle, item_id: itemId });
      } else {
        await ctx.database.upsert('ggcevo_backpack', [{
          user_id: handle, item_id: itemId, count: newCount,
        }]);
      }

      await ctx.database.create('ggcevo_exchange_log', {
        user_id: handle,
        exchange_id: itemId,
        cost_type: 4,
        create_time: now,
      });

      return `✅ 赎罪券使用成功！`;
    });

  // ========== 腾讯文档 API (用户级/应用级账号双模式) ==========
  // 用户级模式: 配置 client_id + access_token + open_id (通过扫码授权获取, 无需 client_secret)
  // 应用级模式: 配置 client_id + client_secret (自动获取并刷新 token, 无需手动填 access_token)

  /** 应用级账号在令牌表中的固定标识 */
  const DOCS_APP_ACCOUNT_KEY = 'app_account'

  /** 是否为用户级 Token 模式 (已手动配置 access_token + open_id) */
  const isUserTokenMode = () => !!config.tencentDocsAccessToken && !!config.tencentDocsOpenId

  const isDocsConfigured = () => config.tencentDocsEnabled
    && !!config.tencentDocsClientId
    && (isUserTokenMode() || !!config.tencentDocsClientSecret)

  /**
   * 应用级账号 Token 接口封装 (仅在应用级模式下使用)
   * - 获取应用级 Token: GET /oauth/v2/app-account-token
   * - 刷新 Token: GET /oauth/v2/token (grant_type=refresh_token)
   */
  const docsOAuth = {
    /** 获取应用级账号 Access Token / Refresh Token (应用级账号为应用全局唯一, 无需用户授权) */
    async getAppAccountToken() {
      return ctx.http.get('https://docs.qq.com/oauth/v2/app-account-token', {
        params: {
          client_id: config.tencentDocsClientId,
          client_secret: config.tencentDocsClientSecret,
        },
      })
    },

    /** 使用 Refresh Token 刷新 Access Token (Refresh Token 有效期 1 年, 回包不含新 Refresh Token) */
    async refreshToken(refreshToken: string) {
      return ctx.http.get('https://docs.qq.com/oauth/v2/token', {
        params: {
          client_id: config.tencentDocsClientId,
          client_secret: config.tencentDocsClientSecret,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        },
      })
    },
  }

  /**
   * 获取有效的腾讯文档令牌
   * - 用户级模式: 直接返回配置的 access_token + open_id (无法自动刷新, 过期需手动更新)
   * - 应用级模式: 过期前 5 分钟自动使用 Refresh Token 刷新并落库; 无记录时自动获取
   * @returns 令牌记录 (含 docs_user_id / access_token), 未配置或获取失败返回 null
   */
  const getValidDocsToken = async (): Promise<GgcEvoDocsToken | null> => {
    // 用户级模式: 直接使用配置项中的 access_token / open_id
    if (isUserTokenMode()) {
      return {
        user_id: DOCS_APP_ACCOUNT_KEY,
        docs_user_id: config.tencentDocsOpenId,
        access_token: config.tencentDocsAccessToken,
        refresh_token: '',
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),  // 用户级模式无法自动判断过期, 设为1年后
        update_time: new Date(),
      }
    }

    // 应用级模式: 从数据库读取并自动刷新
    const [record] = await ctx.database.get('ggcevo_docs_token', { user_id: DOCS_APP_ACCOUNT_KEY })
    if (record && record.expires_at.getTime() > Date.now() + 5 * 60 * 1000) return record

    /** 将 HTTP 错误对象转为可读字符串, 暴露腾讯文档返回的错误码/错误消息 */
    const formatHttpError = (e: any): string => {
      const parts: string[] = []
      if (e?.name) parts.push(e.name)
      if (e?.message) parts.push(e.message)
      if (e?.response) {
        parts.push(`HTTP ${e.response.status}`)
        const body = e.response.data
        if (body != null) parts.push(typeof body === 'string' ? body : JSON.stringify(body))
      } else if (e?.code) {
        parts.push(`code=${e.code}`)
      }
      return parts.join(' | ') || String(e)
    }

    try {
      let resp: any
      if (record) {
        // 优先使用 Refresh Token 刷新, 失败则回退为重新获取应用级 Token (记录失败原因便于排查)
        resp = await docsOAuth.refreshToken(record.refresh_token).catch((refreshErr) => {
          ctx.logger('ggcevo').warn('刷新 Token 失败, 回退到重新获取应用级 Token: %s', formatHttpError(refreshErr))
          return docsOAuth.getAppAccountToken()
        })
      } else {
        resp = await docsOAuth.getAppAccountToken()
      }
      if (!resp?.access_token) {
        ctx.logger('ggcevo').warn('应用级 Token 回包缺少 access_token: %o', resp)
        return record || null
      }
      await ctx.database.upsert('ggcevo_docs_token', [{
        user_id: DOCS_APP_ACCOUNT_KEY,
        docs_user_id: resp.user_id || record?.docs_user_id || '',
        access_token: resp.access_token,
        refresh_token: resp.refresh_token || record?.refresh_token || '',
        expires_at: new Date(Date.now() + (resp.expires_in || 0) * 1000),
        update_time: new Date(),
      }])
      const [updated] = await ctx.database.get('ggcevo_docs_token', { user_id: DOCS_APP_ACCOUNT_KEY })
      return updated || null
    } catch (e) {
      ctx.logger('ggcevo').warn('获取/刷新腾讯文档应用级 Token 失败: %s', formatHttpError(e))
      return record || null
    }
  }

  /**
   * 调用腾讯文档 OpenAPI 通用请求 (鉴权参数位于请求头: Access-Token / Client-Id / Open-Id)
   * @param method 请求方式
   * @param path   接口路径, 如 '/drive/v2/files'
   * @param data   GET 时作为查询参数, 其他方式作为表单参数
   * @example docsApiRequest('POST', '/drive/v2/files', { title: 'Hello', type: 'doc' })
   */
  const docsApiRequest = async <T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    data?: Record<string, any>,
  ): Promise<T> => {
    const token = await getValidDocsToken()
    if (!token) throw new Error('腾讯文档应用级账号不可用, 请检查插件配置(Client ID / Client Secret)')
    const url = `https://docs.qq.com/openapi${path}`
    const headers: Record<string, string> = {
      'Access-Token': token.access_token,
      'Client-Id': config.tencentDocsClientId,
      'Open-Id': token.docs_user_id,
    }
    if (method === 'GET' || method === 'DELETE') {
      return ctx.http.get<T>(url, { headers, params: data })
    }
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    const form = new URLSearchParams(data || {})
    if (method === 'PUT') return ctx.http.put<T>(url, form, { headers })
    return ctx.http.post<T>(url, form, { headers })
  }

  // 查看腾讯文档状态 (显示当前模式与令牌信息)
  ctx.command('腾讯文档/授权状态', '查看腾讯文档授权状态', { authority: 3 })
    .action(async () => {
      if (!isDocsConfigured()) return '❌ 腾讯文档功能未启用或配置不完整。'
      const token = await getValidDocsToken()
      if (!token) {
        return isUserTokenMode()
          ? '❌ 用户级 Token 模式: 请检查 Access Token / Open ID 配置。'
          : '❌ 应用级账号 Token 获取失败, 请检查 Client ID / Client Secret 配置。'
      }
      const mode = isUserTokenMode() ? '用户级(扫码授权)' : '应用级账号(自动刷新)'
      return [
        '📄 腾讯文档授权状态',
        `授权模式: ${mode}`,
        `Client ID: ${config.tencentDocsClientId}`,
        `Open ID: ${token.docs_user_id}`,
        `令牌过期时间: ${toBeijingTime(token.expires_at.toISOString())}`,
        `最近更新: ${toBeijingTime(token.update_time.toISOString())}`,
      ].join('\n')
    })

  // ========== 封禁记录查询 (基于腾讯文档在线表格 V3 接口) ==========
  // 表格结构: A句柄 / C封禁等级 / D处罚原因 / E处罚次数 / F审核员 / G审核时间

  /** 提取单元格可读文本 (支持 text/number/time/link/location 等 CellValue 类型) */
  const extractCellText = (cell: any): string => {
    if (!cell?.cellValue) return ''
    const v = cell.cellValue
    if (v.text != null) return String(v.text)
    if (v.number != null) return String(v.number)
    if (v.time) {
      const t = v.time
      const pad = (n: number) => String(n ?? 0).padStart(2, '0')
      const date = `${t.year ?? ''}-${pad(t.month)}-${pad(t.day)}`.replace(/^-+/, '')
      const time = `${pad(t.hour)}:${pad(t.minute)}:${pad(t.second)}`
      return t.hour != null ? `${date} ${time}` : date
    }
    if (v.link) return v.link.text || v.link.url || ''
    if (v.location) return v.location.name || ''
    if (v.select) {
      // 单选/多选下拉框: cellValue.select.value 为已选选项ID数组,
      // cellValue.select.options 为全部选项(含 id/text), 按 id 匹配取 text
      const sel = v.select
      const ids: string[] = Array.isArray(sel.value) ? sel.value.map(String) : []
      const opts: any[] = Array.isArray(sel.options) ? sel.options : []
      const texts = ids.map(id => opts.find(o => String(o.id) === String(id))?.text || '')
      return texts.filter(Boolean).join('、')
    }
    return ''
  }

  /** 标准化句柄为 5-S2-1-1234567 格式以便比较, 无法识别时返回 trim 后小写原值 */
  const normalizeHandle = (raw: string): string => {
    const s = (raw || '').trim()
    const m = s.match(/^([1235])-s2-([12])-(\d+)$/i)
    if (m) return `${m[1]}-S2-${m[2]}-${m[3]}`
    return s.toLowerCase()
  }

  /** 提取日期部分(仅年月日), 兼容 YYYY-MM-DD HH:mm:ss / YYYY/M/D 等格式 */
  const dateOnly = (s: string): string => {
    const m = (s || '').match(/(\d{4})[-\/年.](\d{1,2})[-\/月.](\d{1,2})/)
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
    return (s || '').trim()
  }

  /**
   * 计算封禁记录身份指纹(标准化句柄 + 审核日期), 用于识别新增记录
   * 不含封禁等级/处罚原因等复审可修改的字段, 避免旧记录被复审修改后误判为新增
   */
  const banRecordIdentity = (r: { handle: string; audit_time: string }): string =>
    `${normalizeHandle(r.handle)}|${dateOnly(r.audit_time)}`

  /** 向配置的群组广播新增封禁提醒 (不再@用户, 仅提醒句柄信息) */
  const notifyNewBanRecords = async (records: Array<{ handle: string; ban_level: string; reason: string; count: string; auditor: string; audit_time: string }>) => {
    const groups = config.banNotifyGroups || []
    if (groups.length === 0 || records.length === 0) return

    for (const r of records) {
      const lines = [
        '🚫 封禁提醒',
        `句柄 ${r.handle} 有新的封禁记录`,
        `封禁等级: ${r.ban_level || '-'}`,
        `审核员: ${r.auditor || '-'}`,
        `审核时间: ${dateOnly(r.audit_time) || '-'}`,
        '处罚原因详情见封禁文档',
      ]
      const message = lines.join('\n')
      for (const groupId of groups) {
        let sent = false
        for (const bot of ctx.bots) {
          try {
            await bot.sendMessage(groupId, message)
            sent = true
            break
          } catch {
            // 此 bot 可能不在该群, 尝试下一个
          }
        }
        if (!sent) {
          ctx.logger('ggcevo').warn('发送封禁提醒到群组 %s 失败: 所有 bot 均无法发送', groupId)
        }
      }
    }
  }

  /** 从腾讯文档拉取封禁记录表 A:G 列全部数据 (自动按 1000 行分批, 跳过表头) */
  const fetchBanRecordsFromDocs = async (): Promise<string[][]> => {
    const fileId = config.tencentDocsBanListFileId
    const sheetId = config.tencentDocsBanListSheetId

    // 1. 查询工作表元数据获取已使用行数 (GET /openapi/spreadsheet/v3/files/{fileId}?concise=1)
    const meta: any = await docsApiRequest('GET', `/spreadsheet/v3/files/${fileId}`, { concise: 1 })
    const metaOk = meta?.code === 0 || meta?.ret === 0
    if (metaOk === false && meta?.code != null) {
      throw new Error(`查询工作表信息失败: ${meta.message || '未知错误'}(code=${meta.code})`)
    }
    const props = meta?.data?.properties || meta?.properties || []
    const sheetInfo = props.find((s: any) => s.sheetId === sheetId)
    const rowTotal: number = Number(sheetInfo?.rowTotal) || 0
    if (rowTotal <= 1) return []

    // 2. 分批范围查询 (GET /openapi/spreadsheet/v3/files/{fileId}/{sheetId}/{range}, 单次行数 <=1000)
    const allRows: string[][] = []
    const batchSize = 1000
    for (let start = 2; start <= rowTotal; start += batchSize) {
      const end = Math.min(start + batchSize - 1, rowTotal)
      const resp: any = await docsApiRequest('GET', `/spreadsheet/v3/files/${fileId}/${sheetId}/A${start}:G${end}`)
      const respOk = resp?.code === 0 || resp?.ret === 0
      if (respOk === false && resp?.code != null) {
        throw new Error(`查询范围 A${start}:G${end} 失败: ${resp.message || '未知错误'}(code=${resp.code})`)
      }
      const rows = resp?.data?.gridData?.rows || resp?.gridData?.rows || []
      for (const row of rows) {
        const cells = row.values || []
        allRows.push([
          extractCellText(cells[0]),  // A: 句柄
          extractCellText(cells[1]),  // B: (未使用)
          extractCellText(cells[2]),  // C: 封禁等级
          extractCellText(cells[3]),  // D: 处罚原因
          extractCellText(cells[4]),  // E: 处罚次数
          extractCellText(cells[5]),  // F: 审核员
          extractCellText(cells[6]),  // G: 审核时间
        ])
      }
    }
    return allRows
  }

  /**
   * 同步封禁记录到数据库: 全量拉取文档数据 → 清空旧数据 → 写入新数据
   * 自增 id 从 1 开始, 对应文档第 2 行(首条数据), id=N 对应文档第 N+1 行
   * 每次同步为全量替换: 文档新增/修改/删除的行均会被同步到数据库
   * 同步时按内容指纹对比新旧记录, 检测到新增封禁记录时向配置群组发送提醒
   * @returns 同步的记录条数
   */
  const syncBanRecords = async (): Promise<number> => {
    const rows = await fetchBanRecordsFromDocs()
    const now = new Date()
    const records = rows.map((r, i) => ({
      id: i + 1,  // 自增 id, 对应文档行号 (id=1 → 文档第2行)
      handle: r[0] || '',
      ban_level: r[2] || '',
      reason: r[3] || '',
      count: r[4] || '',
      auditor: r[5] || '',
      audit_time: r[6] || '',
      update_time: now,
    }))

    // 读取旧记录, 用于统计同步变化与识别新增封禁记录
    const oldRecords = await ctx.database.get('ggcevo_ban_record', {})
    const oldCount = oldRecords.length

    // 按标准化句柄分组, 组内对比记录数量识别新增:
    // - 复审修改旧记录(封禁等级/处罚原因等)不改变数量, 不会触发提醒
    // - 数量增加时按身份指纹(句柄+审核日期)挑选新增记录, 复审连带修改审核日期的边缘情况下仅取多出的数量
    const groupByHandle = (recs: Array<{ handle: string }>): Map<string, any[]> => {
      const map = new Map<string, any[]>()
      for (const r of recs) {
        const key = normalizeHandle(r.handle)
        if (!key) continue  // 跳过空句柄行
        if (!map.has(key)) map.set(key, [])
        map.get(key).push(r)
      }
      return map
    }
    const newBanRecords: typeof records = []
    if (oldCount > 0) {  // 数据库为空(首次同步)时仅建立基线, 不提醒
      const oldGroups = groupByHandle(oldRecords)
      const newGroups = groupByHandle(records)
      for (const [key, newGroup] of newGroups) {
        const oldGroup = oldGroups.get(key) || []
        const diff = newGroup.length - oldGroup.length
        if (diff <= 0) continue  // 数量未增加: 属于旧记录修改或删除, 不提醒
        const oldIdentities = new Set(oldGroup.map(banRecordIdentity))
        let candidates = newGroup.filter(r => !oldIdentities.has(banRecordIdentity(r)))
        if (candidates.length > diff) candidates = candidates.slice(candidates.length - diff)
        newBanRecords.push(...candidates)
      }
    }

    // 全量替换: 清空旧数据后写入新数据, 保证 id 与文档行号严格对应
    await ctx.database.remove('ggcevo_ban_record', {})
    if (records.length > 0) {
      await ctx.database.upsert('ggcevo_ban_record', records)
    }

    // 广播新增封禁提醒 (提醒失败不影响同步流程)
    if (newBanRecords.length > 0) {
      try {
        await notifyNewBanRecords(newBanRecords)
        ctx.logger('ggcevo').info('检测到 %d 条新增封禁记录, 已发送提醒', newBanRecords.length)
      } catch (e) {
        ctx.logger('ggcevo').warn('发送封禁提醒失败: %o', e)
      }
    }

    const diff = records.length - oldCount
    ctx.logger('ggcevo').info(
      '封禁记录全量同步完成: 旧 %d 条 → 新 %d 条 (%s%d)',
      oldCount, records.length, diff >= 0 ? '+' : '', diff,
    )
    return records.length
  }

  // ========== 管理员福利记录同步 (基于腾讯文档在线表格 V3 接口) ==========
  // 表格结构: A列QQ号 / B列游戏句柄

  /** 从腾讯文档拉取管理员福利表 A:B 列全部数据 (自动按 1000 行分批, 跳过表头) */
  const fetchAdminWelfareFromDocs = async (): Promise<string[][]> => {
    const fileId = config.tencentDocsAdminWelfareFileId
    const sheetId = config.tencentDocsAdminWelfareSheetId

    const meta: any = await docsApiRequest('GET', `/spreadsheet/v3/files/${fileId}`, { concise: 1 })
    const metaOk = meta?.code === 0 || meta?.ret === 0
    if (metaOk === false && meta?.code != null) {
      throw new Error(`查询工作表信息失败: ${meta.message || '未知错误'}(code=${meta.code})`)
    }
    const props = meta?.data?.properties || meta?.properties || []
    const sheetInfo = props.find((s: any) => s.sheetId === sheetId)
    const rowTotal: number = Number(sheetInfo?.rowTotal) || 0
    if (rowTotal <= 1) return []

    const allRows: string[][] = []
    const batchSize = 1000
    for (let start = 2; start <= rowTotal; start += batchSize) {
      const end = Math.min(start + batchSize - 1, rowTotal)
      const resp: any = await docsApiRequest('GET', `/spreadsheet/v3/files/${fileId}/${sheetId}/A${start}:B${end}`)
      const respOk = resp?.code === 0 || resp?.ret === 0
      if (respOk === false && resp?.code != null) {
        throw new Error(`查询范围 A${start}:B${end} 失败: ${resp.message || '未知错误'}(code=${resp.code})`)
      }
      const rows = resp?.data?.gridData?.rows || resp?.gridData?.rows || []
      for (const row of rows) {
        const cells = row.values || []
        allRows.push([
          extractCellText(cells[0]),  // A: QQ号
          extractCellText(cells[1]),  // B: 游戏句柄
        ])
      }
    }
    return allRows
  }

  /**
   * 同步管理员福利记录到数据库: 全量拉取文档数据 → 清空旧数据 → 写入新数据
   * 自增 id 从 1 开始, 对应文档第 2 行(首条数据), id=N 对应文档第 N+1 行
   * 每次同步为全量替换: 文档新增/修改/删除的行均会被同步到数据库
   * @returns 同步的记录条数
   */
  const syncAdminWelfare = async (): Promise<number> => {
    const rows = await fetchAdminWelfareFromDocs()
    const now = new Date()
    const records = rows.map((r, i) => ({
      id: i + 1,  // 自增 id, 对应文档行号 (id=1 → 文档第2行)
      qq: r[0] || '',
      handle: r[1] || '',
      update_time: now,
    }))

    const oldRecords = await ctx.database.get('ggcevo_admin_welfare', {}, { fields: ['id'] })
    const oldCount = oldRecords.length

    await ctx.database.remove('ggcevo_admin_welfare', {})
    if (records.length > 0) {
      await ctx.database.upsert('ggcevo_admin_welfare', records)
    }

    const diff = records.length - oldCount
    ctx.logger('ggcevo').info(
      '管理员福利全量同步完成: 旧 %d 条 → 新 %d 条 (%s%d)',
      oldCount, records.length, diff >= 0 ? '+' : '', diff,
    )
    return records.length
  }

  // 每小时定时同步管理员福利记录 (启动后延迟 5 秒首次同步)
  if (isDocsConfigured() && config.tencentDocsAdminWelfareFileId && config.tencentDocsAdminWelfareSheetId) {
    const syncTask = async () => {
      try {
        const count = await syncAdminWelfare()
        ctx.logger('ggcevo').info('管理员福利记录同步完成, 共 %d 条', count)
      } catch (e) {
        ctx.logger('ggcevo').warn('管理员福利记录定时同步失败: %o', e)
      }
    }
    ctx.setTimeout(syncTask, 5000)
    ctx.setInterval(syncTask, 60 * 60 * 1000)
  }

  // 每小时定时同步封禁记录 (启动后延迟 5 秒首次同步)
  if (isDocsConfigured() && config.tencentDocsBanListFileId && config.tencentDocsBanListSheetId) {
    const syncTask = async () => {
      try {
        const count = await syncBanRecords()
        ctx.logger('ggcevo').info('封禁记录同步完成, 共 %d 条', count)
      } catch (e) {
        ctx.logger('ggcevo').warn('封禁记录定时同步失败: %o', e)
      }
    }
    ctx.setTimeout(syncTask, 5000)
    ctx.setInterval(syncTask, 60 * 60 * 1000)
  }

  // 立即从腾讯文档同步封禁记录到数据库
  ctx.command('ggcevo/同步封禁记录', { authority: 3 })
    .action(async () => {
      if (!isDocsConfigured()) return '❌ 腾讯文档功能未启用或配置不完整。'
      try {
        const count = await syncBanRecords()
        return `✅ 封禁记录同步完成, 共 ${count} 条。`
      } catch (e: any) {
        ctx.logger('ggcevo').warn('手动同步封禁记录失败: %o', e)
        return `❌ 同步失败: ${e?.message || e}`
      }
    })

  // 立即从腾讯文档同步管理员福利记录到数据库
  ctx.command('ggcevo/同步管理员福利', { authority: 3 })
    .action(async () => {
      if (!isDocsConfigured()) return '❌ 腾讯文档功能未启用或配置不完整。'
      try {
        const count = await syncAdminWelfare()
        return `✅ 管理员福利同步完成, 共 ${count} 条。`
      } catch (e: any) {
        ctx.logger('ggcevo').warn('手动同步管理员福利失败: %o', e)
        return `❌ 同步失败: ${e?.message || e}`
      }
    })

  // 查询当前绑定句柄的封禁记录 (从数据库读取, 每页1条, 支持翻页)
  ctx.command('ggcevo/封禁记录 [user]')
    .usage('不带参数查询自己的封禁记录, 携带 @用户 可查询对方句柄的封禁记录')
    .example('封禁记录, 查询自己的封禁记录\n    封禁记录 @用户, 查询对方句柄的封禁记录')
    .action(async (argv, user) => {
      if (!isDocsConfigured()) return '❌ 腾讯文档功能未启用或配置不完整。'
      const session = argv.session

      // 解析目标句柄: 无参数时查自己, 带 @ 时查对方当前使用中的句柄
      let targetHandle: string | null
      let isOther = false
      if (!user) {
        targetHandle = await getHandle(session)
      } else {
        const parsedUser = h.parse(user)[0]
        if (!parsedUser || parsedUser.type !== 'at' || !parsedUser.attrs.id) {
          return `❌ 参数错误, 请输入"封禁记录 @用户"查询对方的封禁记录。`
        }
        const targetUserId = parsedUser.attrs.id
        const [profile] = await ctx.database.get('sc2arcade_player', { userId: targetUserId, isActive: true })
        if (!profile) {
          return `❌ 对方暂未绑定游戏句柄。`
        }
        targetHandle = `${profile.regionId}-S2-${profile.realmId}-${profile.profileId}`
        isOther = true
      }

      if (!targetHandle) {
        return `🔒 需要先绑定游戏句柄。\n💡 使用 \`绑定句柄\` 命令进行绑定。`
      }

      const handle = targetHandle

      const [lastSync] = await ctx.database.get('ggcevo_ban_record', {}, { limit: 1 })
      if (!lastSync) {
        return `⚠️ 封禁记录尚未同步, 请稍后再试或联系管理员。`
      }
      const syncTime = lastSync.update_time

      // 从数据库查询并按句柄标准化匹配 (按 id 升序, 即文档行号顺序)
      const allRecords = await ctx.database.get('ggcevo_ban_record', {}, { sort: { id: 'asc' } })
      const target = normalizeHandle(handle)
      const records = allRecords.filter(r => r.handle && normalizeHandle(r.handle) === target)

      const ownerLabel = isOther ? '对方句柄' : '句柄'

      if (records.length === 0) {
        return [
          `✅ ${ownerLabel} ${handle} 暂无封禁记录。`,
          `📊 数据最近同步: ${toBeijingTime(syncTime.toISOString())}`,
        ].join('\n')
      }

      const formatRecord = (idx: number): string => {
        const r = records[idx]
        return [
          `📋 ${ownerLabel}封禁记录 (${idx + 1}/${records.length})`,
          `文档行号: ${r.id + 1} 行`,  // id 对应文档行号 (跳过表头)
          `句柄: ${r.handle}`,
          `封禁等级: ${r.ban_level || '-'}`,
          `处罚原因: ${r.reason || '-'}`,
          `处罚次数: ${r.count || '-'}`,
          `审核员: ${r.auditor || '-'}`,
          `审核时间: ${dateOnly(r.audit_time) || '-'}`,
          '',
          '💡 回复 "下一页"/"上一页"/页码数字 翻页, 回复其他任意内容退出',
        ].join('\n')
      }

      let page = 0
      const sendPage = async (idx: number, withSync: boolean): Promise<void> => {
        const lines = [formatRecord(idx)]
        if (withSync) lines.push(`📊 数据最近同步: ${toBeijingTime(syncTime.toISOString())}`)
        await session.send(lines.join('\n'))
      }

      await sendPage(page, true)

      while (true) {
        const input = await session.prompt(60000)
        if (!input) break
        const cmd = input.trim()
        if (/^(下一页|下页|next|n)$/i.test(cmd)) {
          if (page < records.length - 1) {
            page++
            await sendPage(page, false)
          }
          else await session.send('已是最后一页。回复 "上一页" 或其他任意内容退出。')
        } else if (/^(上一页|上页|prev|p|上一个)$/i.test(cmd)) {
          if (page > 0) {
            page--
            await sendPage(page, false)
          }
          else await session.send('已是第一页。回复 "下一页" 或其他任意内容退出。')
        } else {
          const n = parseInt(cmd, 10)
          if (!isNaN(n) && n >= 1 && n <= records.length) {
            page = n - 1
            await sendPage(page, false)
          } else {
            break  // 输入其他内容(含"退出")直接退出查询
          }
        }
      }
      return '已退出封禁记录查询。'
    })

  // ========== 咕咕之战菜单 (文字/图片) ==========

  interface MenuItem {
    key: string
    icon: string    // 图片菜单中的单字徽章
    label: string
    desc: string
  }

  interface MenuCategory {
    key: string
    label: string
    emoji: string   // 文字菜单中的分类图标
    items: MenuItem[]
  }

  // 菜单分类数据 (仅收录普通用户可用的指令)
  const menuCategories: MenuCategory[] = [
    {
      key: 'daily', label: '每日玩法', emoji: '📅',
      items: [
        { key: 'sign', icon: '签', label: '签到', desc: '每日签到, 获取金币与咕咕币' },
        { key: 'mine', icon: '挖', label: '挖矿', desc: '领取挂机挖矿收益(每半小时4金币)' },
        { key: 'explore', icon: '探', label: '探索', desc: '选择星系进行12小时探索' },
        { key: 'makeup', icon: '补', label: '补签', desc: '使用补签券补签漏签日期' },
      ],
    },
    {
      key: 'bag', label: '物品背包', emoji: '🎒',
      items: [
        { key: 'inv', icon: '包', label: '背包', desc: '查看自己的物品背包' },
        { key: 'profile', icon: '信', label: '个人信息', desc: '查看签到统计与个人信息' },
        { key: 'use', icon: '用', label: '使用 <名称>', desc: '使用指定物品(如赎罪券等)' },
      ],
    },
    {
      key: 'lottery', label: '抽奖兑换', emoji: '🎲',
      items: [
        { key: 'lottery', icon: '抽', label: '抽奖', desc: '抽奖, 可加选项 -p 奖池ID -c 次数' },
        { key: 'odds', icon: '率', label: '抽奖概率', desc: '查看各奖池抽奖概率与保底说明' },
        { key: 'exchange', icon: '兑', label: '兑换 <名称>', desc: '使用兑换券兑换物品' },
        { key: 'exchangeList', icon: '表', label: '兑换列表', desc: '查看可兑换物品列表' },
      ],
    },
    {
      key: 'activity', label: '活动', emoji: '🎉',
      items: [
        { key: 'actList', icon: '活', label: '活动列表', desc: '查看进行中的活动(参数"全部"查看全部)' },
        { key: 'actClaim', icon: '领', label: '领取活动', desc: '领取指定(或最新)活动奖励' },
      ],
    },
    {
      key: 'handle', label: '句柄绑定', emoji: '🔗',
      items: [
        { key: 'bind', icon: '绑', label: '绑定 <句柄>', desc: '绑定星际争霸2游戏句柄' },
        { key: 'list', icon: '句', label: '句柄', desc: '查询已绑定的游戏句柄' },
        { key: 'switch', icon: '切', label: '切换', desc: '切换正在使用的游戏句柄' },
        { key: 'check', icon: '查', label: '查询', desc: '查询某句柄是否已被绑定' },
        { key: 'unbind', icon: '解', label: '解绑', desc: '解除绑定某个游戏句柄' },
        { key: 'migrate', icon: '迁', label: '迁移 <QQ>', desc: '将指定QQ号绑定的句柄迁移到当前账号' },
      ],
    },
    {
      key: 'query', label: '查询信息', emoji: '📊',
      items: [
        { key: 'map', icon: '图', label: '地图检测', desc: '查询已配置地图的检测状态' },
        { key: 'ban', icon: '封', label: '封禁记录', desc: '查询句柄的封禁记录' },
        { key: 'reward', icon: '奖', label: '签到奖励', desc: '查看签到奖励规则说明' },
      ],
    },
  ]

  // 文字菜单 (默认, 无需额外服务)
  const buildTextMenu = () => [
    '🐤 咕咕之战菜单',
    '',
    ...menuCategories.map(cat => `${cat.emoji} ${cat.label}\n  ${cat.items.map(item => item.label).join(' / ')}`),
    '',
    '提示: 直接输入上方指令名即可使用对应功能。',
  ].join('\n')

  // 图片菜单 HTML 模板 (puppeteer 渲染, 分类徽章使用中文单字避免服务器缺少 emoji 字体)
  const buildMenuHtml = (title: string, subtitle: string): string => {
    const palette = ['#4a7dff', '#9b59b6', '#e67e22', '#27ae60', '#e74c3c', '#16a085', '#f39c12', '#8e44ad', '#2980b9', '#d35400', '#2ecc71', '#c0392b']
    const groupHtml = menuCategories.map((group) => {
      const itemRows = group.items.map((item, i) => {
        const color = palette[i % palette.length]
        return `
        <div class="item">
          <div class="icon" style="background: ${color}">${item.icon}</div>
          <div class="info">
            <div class="name">${item.label}</div>
            <div class="desc">${item.desc}</div>
          </div>
        </div>`
      }).join('')
      return `
      <div class="group">
        <div class="group-title">${group.label}</div>
        <div class="list">${itemRows}</div>
      </div>`
    }).join('')
    return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<style>
  body { margin: 0; padding: 24px 28px; background:
    repeating-linear-gradient(45deg, rgba(255,255,255,0.02) 0 1px, transparent 1px 2px),
    linear-gradient(135deg, #1b2a4a 0%, #0f1a33 100%);
    font-family: "Microsoft YaHei", "PingFang SC", sans-serif; color: #e8eefc; }
  .header { text-align: center; padding-bottom: 18px; border-bottom: 2px solid rgba(120,160,255,0.35); }
  .title { font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #8fc0ff; text-shadow: 0 0 18px rgba(90,140,255,0.45); }
  .subtitle { margin-top: 8px; font-size: 14px; color: #93a6c8; }
  .group { margin-top: 22px; }
  .group-title { font-size: 15px; font-weight: bold; color: #ffd98a; letter-spacing: 3px; margin-bottom: 10px; padding-left: 10px; border-left: 3px solid #ffd98a; }
  .list { display: flex; flex-direction: column; gap: 12px; }
  .item { display: flex; align-items: center; gap: 14px; background: rgba(255,255,255,0.07); border: 1px solid rgba(140,170,255,0.22); border-radius: 12px; padding: 12px 16px; }
  .icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 19px; font-weight: bold; color: #fff; flex-shrink: 0; }
  .info { flex: 1; }
  .name { font-size: 20px; font-weight: bold; color: #ffffff; }
  .desc { margin-top: 4px; font-size: 13px; color: #9db1d8; line-height: 1.5; }
  .footer { margin-top: 24px; text-align: center; font-size: 12px; color: #6b7ea6; }
</style>
</head>
<body>
  <div class="header">
    <div class="title">${title}</div>
    <div class="subtitle">${subtitle}</div>
  </div>
  ${groupHtml}
  <div class="footer">输入上方指令名即可使用对应功能</div>
</body>
</html>`
  }

  // 图片菜单磁盘缓存目录 (按 HTML 内容 hash, 命中缓存免去重复渲染, 与 preview-help 同方案)
  const menuCacheDir = path.resolve(ctx.baseDir, 'data/ggcevo/menu')

  // 用 puppeteer 将 HTML 渲染为图片, 返回 base64 data URL 字符串; 失败时返回以 ⚠️ 开头的错误提示文本
  const renderMenuImage = async (html: string): Promise<string> => {
    const logger = ctx.logger('ggcevo')
    // 1. 按 HTML 内容 hash 计算缓存文件名, 命中则直接读回 base64, 无需 puppeteer
    const hash = createHash('sha256').update(html).digest('hex')
    const cachePath = path.resolve(menuCacheDir, `${hash}.jpg`)
    if (fs.existsSync(cachePath)) {
      const cached = await readFile(cachePath)
      return `data:image/jpeg;base64,${cached.toString('base64')}`
    }
    if (!ctx.puppeteer) {
      logger.warn('[menu-render] 未启用 puppeteer 服务')
      return '⚠️ 未启用 puppeteer 服务，无法渲染图片菜单。请安装并启用 `koishi-plugin-puppeteer` 或 `@shangxueink/puppeteer-without-canvas`。'
    }
    const page = await ctx.puppeteer.page()
    try {
      await page.setViewport({ width: 1280, height: 100, deviceScaleFactor: 1 })
      await page.setContent(html)
      await page.waitForNetworkIdle()
      const img = await page.screenshot({ type: 'jpeg', quality: 85, fullPage: true, encoding: 'binary' })
      // 2. 写入缓存并清理旧缓存
      try {
        await mkdir(menuCacheDir, { recursive: true })
        const files = await readdir(menuCacheDir)
        for (const file of files) await unlink(path.resolve(menuCacheDir, file))
        await writeFile(cachePath, img)
      } catch (e) {
        logger.error('[menu-render] 写入菜单图缓存失败: %o', e)
      }
      return `data:image/jpeg;base64,${img.toString('base64')}`
    } catch (e) {
      logger.warn('[menu-render] 渲染菜单图片失败: %o', e)
      return '⚠️ 菜单图片渲染失败，请查看日志后重试。'
    } finally {
      await page.close()
    }
  }

  // 将菜单图发送到目标会话: QQ 官方机器人手动走官方富媒体上传+发送(适配器会静默吞掉QQ接口错误), 其余平台直接发图(与 preview-help 一致, 不带引用)
  const sendMenuImage = async (session: Session, dataUrl: string): Promise<string | h> => {
    const logger = ctx.logger('ggcevo')
    if (!dataUrl.startsWith('data:image')) return dataUrl // 渲染失败的错误提示文本
    if (session.platform !== 'qq') return h.image(dataUrl)
    const bot = session.bot as any
    const match = /^data:image\/[\w.+-]+;base64,(.*)$/.exec(dataUrl)
    if (!match) return '⚠️ 菜单图片数据无效。'
    try {
      const fileData = match[1]
      // 被动回复需要递增的 msg_seq (与 adapter-qq flush 行为一致, 存到会话对象上)
      const msgSeq = (session['seq'] || 0) + 1
      session['seq'] = msgSeq
      if (session.isDirect) {
        const fileRes = await bot.internal.sendFilePrivate(session.userId, { file_type: 1, srv_send_msg: false, file_data: fileData })
        await bot.internal.sendPrivateMessage(session.channelId, {
          msg_type: 7, media: fileRes, content: '', msg_id: session.messageId, msg_seq: msgSeq,
        })
      } else {
        const fileRes = await bot.internal.sendFileGuild(session.channelId, { file_type: 1, srv_send_msg: false, file_data: fileData })
        const msgRes = await bot.internal.sendMessage(session.channelId, {
          msg_type: 7, media: fileRes, content: '', msg_id: session.messageId, msg_seq: msgSeq,
        })
        // 仅警告异常情况: 消息进入审核且未开启 MESSAGE_AUDIT intent 时可能不显示
        if (msgRes?.audit_id) logger.warn('[menu-render] QQ 菜单图消息进入审核(audit_id=%s), 若未开启 MESSAGE_AUDIT intent 消息可能不显示', msgRes.audit_id)
      }
      return
    } catch (e) {
      logger.error('[menu-render] QQ 官方发送菜单图失败: %o', e)
      return '⚠️ QQ 发送菜单图失败，请查看日志中的错误信息。'
    }
  }

  ctx.command('咕咕之战', '查看咕咕之战内容分类菜单')
    .action(async ({ session }) => {
      if (config.menuStyle === 'image') {
        const dataUrl = await renderMenuImage(buildMenuHtml('咕咕之战', '内容分类菜单 · 输入指令名即可使用'))
        return sendMenuImage(session, dataUrl)
      }
      return buildTextMenu()
    })
}

// ========== 工具函数 ==========

function toBeijingTime(isoString: string): string {
  const date = new Date(isoString);
  const beijingTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = beijingTime.getUTCFullYear();
  const M = pad(beijingTime.getUTCMonth() + 1);
  const d = pad(beijingTime.getUTCDate());
  const h = pad(beijingTime.getUTCHours());
  const m = pad(beijingTime.getUTCMinutes());
  const s = pad(beijingTime.getUTCSeconds());
  return `${y}/${M}/${d} ${h}:${m}:${s}`;
}

function formatMiningDuration(minutes: number): string {
  const totalMinutes = Math.floor(minutes);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours <= 0) return `${mins}分钟`;
  if (mins <= 0) return `${hours}小时`;
  return `${hours}小时${mins}分`;
}

function translateEventType(eventType: string): string {
  const translations: Record<string, string> = {
    cameBackOnline: '恢复在线',
    wentOffline: '离线',
  };
  return translations[eventType] || eventType;
}

function formatRecentEvents(events: any[]): string {
  if (!events || events.length === 0) return '无';
  const latest5 = events.slice(0, 5);
  return latest5.map((e: any) =>
    `${translateEventType(e.eventType)} (${toBeijingTime(e.eventTime)})`
  ).join(', ');
}

function formatMapMonitorMessage(currentData: any, previousRecord: any): string {
  const previousData = JSON.parse(previousRecord.lastState);

  const lines: string[] = [];
  lines.push('🔔 地图状态变更通知');

  if (currentData.mapName) {
    lines.push(`地图: ${currentData.mapName} (ID: ${currentData.mapId})`);
  } else {
    lines.push(`地图ID: ${currentData.mapId}`);
  }

  const fieldLabels: Record<string, string> = {
    isOnline: '在线状态',
    lastStatusChangeTime: '最后状态变更时间',
    offlineCountLast24h: '24h内离线次数',
    offlineCountLast30d: '30d内离线次数',
  };

  const newValueOnlyFields = ['lastStatusChangeTime', 'offlineCountLast24h', 'offlineCountLast30d'];

  const timeFields = ['lastCheckTime', 'lastStatusChangeTime', 'firstSeenTime'];

  const formatValue = (key: string, raw: string): string => {
    if (key === 'isOnline') {
      try {
        const parsed = JSON.parse(raw);
        return typeof parsed === 'boolean' ? (parsed ? '🟢 在线' : '🔴 离线') : raw;
      } catch { return raw; }
    }
    if (key === 'recentEvents') {
      try {
        const events = JSON.parse(raw);
        return formatRecentEvents(events);
      } catch { return raw; }
    }
    if (timeFields.includes(key)) {
      try {
        return toBeijingTime(JSON.parse(raw));
      } catch { return raw; }
    }
    return raw;
  };

  for (const key of Object.keys(currentData)) {
    if (key === 'mapId' || key === 'mapName' || key === 'recentEvents' || key === 'popularityRank' || key === 'lastCheckTime') continue;
    const prevValue = JSON.stringify(previousData[key]);
    const currValue = JSON.stringify(currentData[key]);
    if (prevValue !== currValue) {
      const label = fieldLabels[key] || key;
      if (newValueOnlyFields.includes(key)) {
        lines.push(`${label}: ${formatValue(key, currValue)}`);
      } else {
        lines.push(`${label}: ${formatValue(key, prevValue)} → ${formatValue(key, currValue)}`);
      }
    }
  }

  return lines.join('\n');
}
