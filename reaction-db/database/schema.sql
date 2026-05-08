-- Reaction 数据库 Schema（v2 - 自动化版本）
-- 多平台爬取 + 自动质量筛选，取代人工标注流程

-- 启用外键约束
PRAGMA foreign_keys = ON;

-- 视频信息表：记录爬取来源视频的元数据（支持多平台）
CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bvid TEXT NOT NULL UNIQUE,              -- 视频唯一标识（B站BV号/其他平台ID）
    platform TEXT NOT NULL DEFAULT 'bilibili', -- 平台：bilibili/tencent/mgtv/iqiyi
    title TEXT NOT NULL,                     -- 视频标题
    uploader TEXT,                           -- UP主/发布者名称
    duration INTEGER,                        -- 视频时长（秒）
    genre TEXT NOT NULL DEFAULT '其他',       -- 剧集类型：古偶/悬疑/喜剧/仙侠/都市/其他
    drama_name TEXT,                         -- 剧名
    episode_num INTEGER,                     -- 第几集
    tags TEXT,                               -- 标签（JSON数组字符串）
    crawl_status TEXT DEFAULT 'pending',     -- 爬取状态：pending/crawling/done/failed
    crawled_at TEXT,                         -- 爬取完成时间
    created_at TEXT DEFAULT (datetime('now')),
    -- 各平台专属字段（JSON存储）
    platform_meta TEXT                       -- 平台特有参数（如腾讯的vid/target_id, 芒果的subject_id等）
);

-- 原始 Reaction 数据表：存储爬取的弹幕/字幕/评论原始文本
CREATE TABLE IF NOT EXISTS raw_reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER NOT NULL,
    text TEXT NOT NULL,                      -- 弹幕/字幕/评论文本
    timestamp REAL,                          -- 视频中的时间点（秒），评论可为NULL
    source_type TEXT NOT NULL,               -- 来源类型：danmaku/subtitle/comment
    like_count INTEGER DEFAULT 0,            -- 点赞数（评论和弹幕可用）
    user_name TEXT,                          -- 用户名（可选）
    extra_info TEXT,                         -- 额外信息（JSON，含platform等）
    is_filtered INTEGER DEFAULT 0,          -- 是否已被过滤（低质量/无关内容）
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
);

-- 自动评分后的高质量 Reaction 表（取代人工标注的 annotated_reactions）
CREATE TABLE IF NOT EXISTS quality_reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    raw_id INTEGER NOT NULL,                 -- 关联原始数据
    text TEXT NOT NULL,                      -- 文本内容
    platform TEXT NOT NULL DEFAULT 'bilibili', -- 来源平台
    source_type TEXT NOT NULL,               -- 来源类型：danmaku/subtitle/comment
    like_count INTEGER DEFAULT 0,            -- 点赞数
    quality_score INTEGER NOT NULL DEFAULT 3, -- 自动质量评分：1-5
    text_category TEXT DEFAULT 'reaction',   -- 自动推断分类：reaction/analysis/emotion/humor
    is_fewshot INTEGER DEFAULT 0,           -- 是否入选 few-shot 集（score>=4 自动入选）
    genre TEXT NOT NULL DEFAULT '通用',       -- 继承自视频的剧集类型
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (raw_id) REFERENCES raw_reactions(id) ON DELETE CASCADE
);

-- Few-shot 示例集表（简化版，用于组织导出）
CREATE TABLE IF NOT EXISTS few_shot_sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,                      -- 示例集名称
    description TEXT,                        -- 说明
    genre TEXT,                              -- 目标剧集类型（可为NULL表示通用）
    text_category TEXT,                      -- 目标文本分类
    reaction_ids TEXT NOT NULL,              -- 包含的 quality_reaction ids（JSON数组）
    is_active INTEGER DEFAULT 1,            -- 是否启用
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- 索引优化查询性能
CREATE INDEX IF NOT EXISTS idx_raw_reactions_video_id ON raw_reactions(video_id);
CREATE INDEX IF NOT EXISTS idx_raw_reactions_source_type ON raw_reactions(source_type);
CREATE INDEX IF NOT EXISTS idx_raw_reactions_timestamp ON raw_reactions(timestamp);
CREATE INDEX IF NOT EXISTS idx_raw_reactions_is_filtered ON raw_reactions(is_filtered);
CREATE INDEX IF NOT EXISTS idx_raw_reactions_like_count ON raw_reactions(like_count);

CREATE INDEX IF NOT EXISTS idx_quality_score ON quality_reactions(quality_score);
CREATE INDEX IF NOT EXISTS idx_quality_platform ON quality_reactions(platform);
CREATE INDEX IF NOT EXISTS idx_quality_source_type ON quality_reactions(source_type);
CREATE INDEX IF NOT EXISTS idx_quality_genre ON quality_reactions(genre);
CREATE INDEX IF NOT EXISTS idx_quality_is_fewshot ON quality_reactions(is_fewshot);
CREATE INDEX IF NOT EXISTS idx_quality_category ON quality_reactions(text_category);

CREATE INDEX IF NOT EXISTS idx_videos_genre ON videos(genre);
CREATE INDEX IF NOT EXISTS idx_videos_bvid ON videos(bvid);
CREATE INDEX IF NOT EXISTS idx_videos_platform ON videos(platform);
CREATE INDEX IF NOT EXISTS idx_videos_crawl_status ON videos(crawl_status);

CREATE INDEX IF NOT EXISTS idx_few_shot_sets_active ON few_shot_sets(is_active);
