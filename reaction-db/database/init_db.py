"""
Reaction 数据库初始化脚本（v2 - 自动化版本）
执行 schema.sql 创建 SQLite 数据库和所有表结构
支持从旧版数据库迁移（添加 platform 字段、创建 quality_reactions 表）
"""

import sqlite3
import os
import sys

# 数据库文件路径
DB_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(DB_DIR, 'reaction.db')
SCHEMA_PATH = os.path.join(DB_DIR, 'schema.sql')


def init_database(db_path: str = DB_PATH, schema_path: str = SCHEMA_PATH):
    """初始化数据库：创建文件并执行 schema"""
    
    # 检查 schema 文件是否存在
    if not os.path.exists(schema_path):
        print(f"[ERROR] Schema 文件不存在: {schema_path}")
        sys.exit(1)
    
    # 读取 schema SQL
    with open(schema_path, 'r', encoding='utf-8') as f:
        schema_sql = f.read()
    
    # 如果数据库已存在，询问是否重建
    if os.path.exists(db_path):
        print(f"[WARN] 数据库已存在: {db_path}")
        response = input("是否要重建数据库？这将删除所有现有数据 (y/N): ").strip().lower()
        if response == 'y':
            os.remove(db_path)
            print("[INFO] 已删除旧数据库")
        else:
            print("[INFO] 保留现有数据库，尝试迁移...")
            migrate_database(db_path)
            return
    
    # 连接数据库（不存在则自动创建）
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # 执行 schema
        cursor.executescript(schema_sql)
        conn.commit()
        print(f"[OK] 数据库初始化成功: {db_path}")
        
        # 验证表创建
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
        tables = cursor.fetchall()
        print(f"[INFO] 已创建的表: {[t[0] for t in tables]}")
        
        # 显示索引
        cursor.execute("SELECT name FROM sqlite_master WHERE type='index' ORDER BY name;")
        indexes = cursor.fetchall()
        print(f"[INFO] 已创建的索引: {len(indexes)} 个")
        
    except sqlite3.Error as e:
        print(f"[ERROR] 数据库初始化失败: {e}")
        sys.exit(1)
    finally:
        conn.close()


def migrate_database(db_path: str = DB_PATH):
    """从旧版数据库迁移到新版
    
    迁移内容：
    1. videos 表添加 platform 和 platform_meta 字段
    2. 创建 quality_reactions 表（如不存在）
    3. 如果存在 annotated_reactions 表，迁移数据到 quality_reactions
    """
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # 1. 检查并添加 videos 表的 platform 字段
        cursor.execute("PRAGMA table_info(videos)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'platform' not in columns:
            cursor.execute("ALTER TABLE videos ADD COLUMN platform TEXT NOT NULL DEFAULT 'bilibili'")
            print("[MIGRATE] videos 表: 已添加 platform 字段")
        
        if 'platform_meta' not in columns:
            cursor.execute("ALTER TABLE videos ADD COLUMN platform_meta TEXT")
            print("[MIGRATE] videos 表: 已添加 platform_meta 字段")
        
        # 2. 创建 quality_reactions 表
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS quality_reactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                raw_id INTEGER NOT NULL,
                text TEXT NOT NULL,
                platform TEXT NOT NULL DEFAULT 'bilibili',
                source_type TEXT NOT NULL,
                like_count INTEGER DEFAULT 0,
                quality_score INTEGER NOT NULL DEFAULT 3,
                text_category TEXT DEFAULT 'reaction',
                is_fewshot INTEGER DEFAULT 0,
                genre TEXT NOT NULL DEFAULT '通用',
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (raw_id) REFERENCES raw_reactions(id) ON DELETE CASCADE
            )
        """)
        print("[MIGRATE] quality_reactions 表: 已创建（如不存在）")
        
        # 创建索引
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_quality_score ON quality_reactions(quality_score)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_quality_platform ON quality_reactions(platform)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_quality_source_type ON quality_reactions(source_type)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_quality_genre ON quality_reactions(genre)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_quality_is_fewshot ON quality_reactions(is_fewshot)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_quality_category ON quality_reactions(text_category)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_raw_reactions_like_count ON raw_reactions(like_count)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_videos_platform ON videos(platform)")
        
        # 3. 如果存在旧的 annotated_reactions 表，迁移数据
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='annotated_reactions'")
        if cursor.fetchone():
            # 检查 quality_reactions 是否为空
            cursor.execute("SELECT COUNT(*) FROM quality_reactions")
            if cursor.fetchone()[0] == 0:
                print("[MIGRATE] 从 annotated_reactions 迁移数据到 quality_reactions...")
                cursor.execute("""
                    INSERT INTO quality_reactions (raw_id, text, platform, source_type, like_count, quality_score, text_category, is_fewshot, genre)
                    SELECT 
                        COALESCE(raw_id, 0),
                        text,
                        'bilibili',
                        'comment',
                        0,
                        quality_score,
                        CASE scene_type
                            WHEN 'highlight' THEN 'reaction'
                            WHEN 'heartbreak' THEN 'emotion'
                            WHEN 'foreshadow' THEN 'analysis'
                            WHEN 'comedy' THEN 'humor'
                            ELSE 'reaction'
                        END,
                        is_fewshot,
                        genre
                    FROM annotated_reactions
                """)
                migrated = cursor.rowcount
                print(f"[MIGRATE] 已迁移 {migrated} 条标注数据")
            else:
                print("[MIGRATE] quality_reactions 已有数据，跳过迁移")
        
        # 4. 简化 few_shot_sets 表（添加新字段如果缺失）
        cursor.execute("PRAGMA table_info(few_shot_sets)")
        fss_columns = [col[1] for col in cursor.fetchall()]
        
        if 'text_category' not in fss_columns and fss_columns:
            cursor.execute("ALTER TABLE few_shot_sets ADD COLUMN text_category TEXT")
            print("[MIGRATE] few_shot_sets 表: 已添加 text_category 字段")
        
        conn.commit()
        print("[MIGRATE] 数据库迁移完成！")
        
        # 显示当前表状态
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
        tables = cursor.fetchall()
        print(f"[INFO] 当前表: {[t[0] for t in tables]}")
        
    except sqlite3.Error as e:
        print(f"[ERROR] 迁移失败: {e}")
        conn.rollback()
    finally:
        conn.close()


def insert_sample_data(db_path: str = DB_PATH):
    """插入示例数据，便于测试"""
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # 插入示例视频（多平台）
        sample_videos = [
            ('BV1example01', 'bilibili', '【Reaction】佳偶天成第1集！这对CP太甜了', '追剧小王子', 2700, '古偶', '佳偶天成', 1, '["reaction","古偶","甜剧"]'),
            ('BV1example02', 'bilibili', '【追剧反应】开端第1集 时间循环太上头了', '悬疑迷妹', 2400, '悬疑', '开端', 1, '["reaction","悬疑","烧脑"]'),
            ('BV1example03', 'bilibili', '【爆笑reaction】武林外传重温 笑到肚子疼', '快乐源泉', 1800, '喜剧', '武林外传', 1, '["reaction","喜剧","搞笑"]'),
        ]
        
        cursor.executemany(
            "INSERT OR IGNORE INTO videos (bvid, platform, title, uploader, duration, genre, drama_name, episode_num, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            sample_videos
        )
        
        # 插入示例原始数据（含多来源）
        sample_reactions = [
            # B站字幕（UP主语句 - 最高优先级）
            (1, '天哪这对CP也太甜了吧', 120.5, 'subtitle', 0, None, None),
            (1, '男主这个眼神我真的受不了', 135.2, 'subtitle', 0, None, None),
            (1, '编剧太会了这个节奏感太好了', 200.0, 'subtitle', 0, None, None),
            # B站弹幕
            (1, '太甜了吧这对CP！', 120.5, 'danmaku', 0, '用户A', None),
            (1, '磕到了磕到了！', 250.3, 'danmaku', 0, '用户D', None),
            # B站评论
            (1, '编剧太会了，这场戏的节奏', 200.0, 'comment', 1523, '剧评人', None),
            # 悬疑类
            (2, '卧槽这反转我完全没想到', 300.0, 'subtitle', 0, None, None),
            (2, '等一下这个细节是伏笔吧', 450.5, 'subtitle', 0, None, None),
            (2, '编剧在下一盘大棋', 600.0, 'comment', 892, '推理爱好者', None),
            # 喜剧类
            (3, '哈哈哈笑死我了这段太搞了', 60.0, 'subtitle', 0, None, None),
            (3, '佟掌柜太绝了', 120.0, 'danmaku', 0, '用户I', None),
        ]
        
        cursor.executemany(
            "INSERT OR IGNORE INTO raw_reactions (video_id, text, timestamp, source_type, like_count, user_name, extra_info) VALUES (?, ?, ?, ?, ?, ?, ?)",
            sample_reactions
        )
        
        conn.commit()
        print(f"[OK] 示例数据插入成功")
        print(f"  - 视频: {len(sample_videos)} 条")
        print(f"  - 原始 Reaction: {len(sample_reactions)} 条")
        print()
        print("[TIP] 运行 auto_filter.py 对示例数据执行自动质量筛选")
        
    except sqlite3.Error as e:
        print(f"[ERROR] 示例数据插入失败: {e}")
    finally:
        conn.close()


if __name__ == '__main__':
    print("=" * 50)
    print("  Reaction 数据库初始化工具（v2 自动化版本）")
    print("=" * 50)
    print()
    
    # 初始化数据库
    init_database()
    
    # 询问是否插入示例数据
    print()
    response = input("是否插入示例数据用于测试？(Y/n): ").strip().lower()
    if response != 'n':
        insert_sample_data()
    
    print()
    print("[DONE] 初始化完成！")
    print()
    print("下一步:")
    print("  1. 配置 video_list.json 中的视频列表")
    print("  2. 运行 batch_crawl.py 批量爬取数据")
    print("  3. 运行 auto_filter.py 自动质量筛选")
    print("  4. 运行 scripts/export_fewshot.py 导出训练数据")
