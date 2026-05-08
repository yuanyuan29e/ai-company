/**
 * Reaction 数据库服务层
 * 使用 sql.js（纯 JavaScript SQLite 实现，无需原生编译）
 * 提供数据库连接和操作接口
 * 
 * 数据来源：多平台自动爬取 + auto_filter 自动质量评分
 * 不再使用人工标注，改用 quality_reactions 表
 */

import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import fs from 'fs';
import path from 'path';

// 数据库文件路径
const DB_PATH = path.resolve(__dirname, '../../../reaction-db/database/reaction.db');

// 类型定义
export interface RawReaction {
  id: number;
  video_id: number;
  text: string;
  timestamp: number | null;
  source_type: 'danmaku' | 'subtitle' | 'comment';
  like_count: number;
  user_name: string | null;
  extra_info: string | null;
  is_filtered: number;
  created_at: string;
  video_title?: string;
  drama_name?: string;
  genre?: string;
  platform?: string;
}

export interface QualityReaction {
  id: number;
  raw_id: number;
  text: string;
  source_type: 'danmaku' | 'subtitle' | 'comment';
  quality_score: number;
  text_category: string;
  genre: string;
  platform: string;
  is_fewshot: number;
  created_at: string;
}

export interface VideoInfo {
  id: number;
  bvid: string;
  title: string;
  uploader: string;
  duration: number;
  genre: string;
  drama_name: string;
  episode_num: number;
  tags: string;
  platform: string;
  platform_meta: string | null;
  crawl_status: string;
  crawled_at: string | null;
  created_at: string;
}

export interface FewShotQuery {
  text_category?: string;
  genre?: string;
  source_type?: string;
  platform?: string;
  limit?: number;
}

export interface ListQuery {
  page?: number;
  pageSize?: number;
  source_type?: string;
  genre?: string;
  text_category?: string;
  platform?: string;
  is_filtered?: number;
  quality_min?: number;
  search?: string;
}

export interface DbStats {
  total_videos: number;
  total_raw: number;
  total_valid: number;
  total_filtered: number;
  total_quality: number;
  total_fewshot: number;
  by_source: Record<string, number>;
  by_genre: Record<string, number>;
  by_category: Record<string, number>;
  by_platform: Record<string, number>;
}

// 单例数据库实例
let db: SqlJsDatabase | null = null;
let dbReady: Promise<void> | null = null;

/**
 * 初始化数据库连接
 */
async function initDb(): Promise<void> {
  try {
    const SQL = await initSqlJs();
    
    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(buffer);
      console.log(`[ReactionDB] 连接成功: ${DB_PATH}`);
    } else {
      console.warn(`[ReactionDB] 数据库文件不存在: ${DB_PATH}`);
      console.warn('[ReactionDB] 请运行: cd reaction-db/database && python init_db.py');
      db = null;
    }
  } catch (error) {
    console.error(`[ReactionDB] 初始化失败:`, error);
    db = null;
  }
}

// 启动时初始化
dbReady = initDb();

/**
 * 获取数据库实例
 */
async function getDb(): Promise<SqlJsDatabase | null> {
  await dbReady;
  return db;
}

/**
 * 将 sql.js 查询结果转为对象数组
 */
function queryToObjects<T>(db: SqlJsDatabase, sql: string, params: any[] = []): T[] {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  
  const results: T[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push(row as unknown as T);
  }
  stmt.free();
  return results;
}

/**
 * 执行单值查询
 */
function queryScalar(db: SqlJsDatabase, sql: string, params: any[] = []): any {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  stmt.step();
  const result = stmt.get();
  stmt.free();
  return result ? result[0] : null;
}

// ============ 导出接口 ============

/**
 * 检查数据库是否可用
 */
export function isDbAvailable(): boolean {
  return db !== null;
}

/**
 * 获取原始 Reaction 列表
 */
export async function listRawReactions(query: ListQuery): Promise<{ data: RawReaction[]; total: number }> {
  const database = await getDb();
  if (!database) return { data: [], total: 0 };
  
  const { page = 1, pageSize = 50, source_type, genre, platform, is_filtered, search } = query;
  
  let whereClauses: string[] = [];
  let params: any[] = [];
  
  if (source_type) {
    whereClauses.push('r.source_type = ?');
    params.push(source_type);
  }
  if (genre) {
    whereClauses.push('v.genre = ?');
    params.push(genre);
  }
  if (platform) {
    whereClauses.push('v.platform = ?');
    params.push(platform);
  }
  if (is_filtered !== undefined) {
    whereClauses.push('r.is_filtered = ?');
    params.push(is_filtered);
  }
  if (search) {
    whereClauses.push("r.text LIKE ?");
    params.push(`%${search}%`);
  }
  
  const whereStr = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';
  
  const total = queryScalar(database,
    `SELECT COUNT(*) FROM raw_reactions r LEFT JOIN videos v ON r.video_id = v.id ${whereStr}`,
    params
  ) as number;
  
  const offset = (page - 1) * pageSize;
  const data = queryToObjects<RawReaction>(database,
    `SELECT r.*, v.title as video_title, v.drama_name, v.genre, v.platform
     FROM raw_reactions r LEFT JOIN videos v ON r.video_id = v.id
     ${whereStr} ORDER BY r.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  
  return { data, total };
}

/**
 * 获取质量筛选后的 Reaction 列表（替代原标注列表）
 */
export async function listQualityReactions(query: ListQuery): Promise<{ data: QualityReaction[]; total: number }> {
  const database = await getDb();
  if (!database) return { data: [], total: 0 };
  
  const { page = 1, pageSize = 50, text_category, source_type, genre, platform, quality_min } = query;
  
  let whereClauses: string[] = [];
  let params: any[] = [];
  
  if (text_category) { whereClauses.push('text_category = ?'); params.push(text_category); }
  if (source_type) { whereClauses.push('source_type = ?'); params.push(source_type); }
  if (genre) { whereClauses.push('genre = ?'); params.push(genre); }
  if (platform) { whereClauses.push('platform = ?'); params.push(platform); }
  if (quality_min) { whereClauses.push('quality_score >= ?'); params.push(quality_min); }
  
  const whereStr = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';
  
  const total = queryScalar(database, `SELECT COUNT(*) FROM quality_reactions ${whereStr}`, params) as number;
  
  const offset = (page - 1) * pageSize;
  const data = queryToObjects<QualityReaction>(database,
    `SELECT * FROM quality_reactions ${whereStr} ORDER BY quality_score DESC, id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  
  return { data, total };
}

/**
 * Few-shot 示例检索（核心功能）
 * 从 quality_reactions 中检索高质量 Reaction 用于提示词注入
 * 
 * 检索策略（逐级降级）：
 * 1. 精确匹配 text_category + source_type
 * 2. 匹配 text_category（任意来源但排除subtitle）
 * 3. 匹配 genre + 排除subtitle
 * 4. 全局高质量弹幕
 * 
 * 注意：使用 RANDOM() 保证每次返回不同的示例，增加生成多样性
 */
export function searchFewShot(query: FewShotQuery): QualityReaction[] {
  if (!db) return [];
  
  const limit = query.limit || 5;
  
  // 策略1: 精确匹配 text_category + source_type（如果指定了source_type）
  if (query.text_category && query.source_type) {
    const results = queryToObjects<QualityReaction>(db,
      `SELECT * FROM quality_reactions WHERE is_fewshot = 1 AND text_category = ? AND source_type = ? AND quality_score >= 4 ORDER BY RANDOM() LIMIT ?`,
      [query.text_category, query.source_type, limit]
    );
    if (results.length >= 3) return results;
  }
  
  // 策略2: 匹配 text_category（排除subtitle字幕）
  if (query.text_category) {
    const results = queryToObjects<QualityReaction>(db,
      `SELECT * FROM quality_reactions WHERE is_fewshot = 1 AND text_category = ? AND source_type != 'subtitle' AND quality_score >= 4 ORDER BY RANDOM() LIMIT ?`,
      [query.text_category, limit]
    );
    if (results.length >= 3) return results;
  }
  
  // 策略3: 匹配 genre（排除subtitle）
  if (query.genre) {
    const results = queryToObjects<QualityReaction>(db,
      `SELECT * FROM quality_reactions WHERE is_fewshot = 1 AND genre = ? AND source_type != 'subtitle' AND quality_score >= 4 ORDER BY RANDOM() LIMIT ?`,
      [query.genre, limit]
    );
    if (results.length >= 2) return results;
  }
  
  // 策略4: 全局高质量弹幕（排除 subtitle 字幕）
  return queryToObjects<QualityReaction>(db,
    `SELECT * FROM quality_reactions WHERE is_fewshot = 1 AND source_type != 'subtitle' AND quality_score >= 4 ORDER BY RANDOM() LIMIT ?`,
    [limit]
  );
}

/**
 * 获取统计信息
 */
export async function getStats(): Promise<DbStats> {
  const database = await getDb();
  if (!database) {
    return { total_videos: 0, total_raw: 0, total_valid: 0, total_filtered: 0, total_quality: 0, total_fewshot: 0, by_source: {}, by_genre: {}, by_category: {}, by_platform: {} };
  }
  
  const total_videos = queryScalar(database, 'SELECT COUNT(*) FROM videos') as number;
  const total_raw = queryScalar(database, 'SELECT COUNT(*) FROM raw_reactions') as number;
  const total_valid = queryScalar(database, 'SELECT COUNT(*) FROM raw_reactions WHERE is_filtered = 0') as number;
  const total_filtered = queryScalar(database, 'SELECT COUNT(*) FROM raw_reactions WHERE is_filtered = 1') as number;
  const total_quality = queryScalar(database, 'SELECT COUNT(*) FROM quality_reactions') as number;
  const total_fewshot = queryScalar(database, 'SELECT COUNT(*) FROM quality_reactions WHERE is_fewshot = 1') as number;
  
  const by_source: Record<string, number> = {};
  const sourceRows = queryToObjects<{source_type: string; c: number}>(database,
    'SELECT source_type, COUNT(*) as c FROM quality_reactions GROUP BY source_type'
  );
  for (const row of sourceRows) by_source[row.source_type] = row.c;
  
  const by_genre: Record<string, number> = {};
  const genreRows = queryToObjects<{genre: string; c: number}>(database,
    'SELECT genre, COUNT(*) as c FROM quality_reactions GROUP BY genre'
  );
  for (const row of genreRows) by_genre[row.genre] = row.c;
  
  const by_category: Record<string, number> = {};
  const categoryRows = queryToObjects<{text_category: string; c: number}>(database,
    'SELECT text_category, COUNT(*) as c FROM quality_reactions GROUP BY text_category'
  );
  for (const row of categoryRows) by_category[row.text_category] = row.c;
  
  const by_platform: Record<string, number> = {};
  const platformRows = queryToObjects<{platform: string; c: number}>(database,
    'SELECT platform, COUNT(*) as c FROM quality_reactions GROUP BY platform'
  );
  for (const row of platformRows) by_platform[row.platform] = row.c;
  
  return { total_videos, total_raw, total_valid, total_filtered, total_quality, total_fewshot, by_source, by_genre, by_category, by_platform };
}

/**
 * 获取视频列表
 */
export async function listVideos(): Promise<VideoInfo[]> {
  const database = await getDb();
  if (!database) return [];
  return queryToObjects<VideoInfo>(database, 'SELECT * FROM videos ORDER BY created_at DESC');
}

/**
 * 关闭数据库
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
    console.log('[ReactionDB] 连接已关闭');
  }
}
