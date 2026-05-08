"""
多平台批量爬取入口
读取 video_list.json，根据 platform 字段分发到对应爬虫模块
支持：B站、腾讯视频、芒果TV、爱奇艺
支持断点续爬和状态追踪
"""

import os
import sys
import json
import time
import sqlite3
from typing import List, Dict

from config import (
    DB_PATH, get_delay,
    PLATFORM_BILIBILI, PLATFORM_TENCENT, PLATFORM_MGTV, PLATFORM_IQIYI
)
from bilibili_danmaku import crawl_danmaku, get_video_info
from bilibili_subtitle import crawl_subtitle
from bilibili_comments import crawl_comments
from tencent_video import crawl_tencent_danmaku, crawl_tencent_comments
from mgtv import crawl_mgtv_danmaku, crawl_mgtv_comments
from iqiyi import crawl_iqiyi_danmaku, crawl_iqiyi_comments


def load_video_list(list_path: str = None) -> List[Dict]:
    """加载待爬取的视频列表"""
    if list_path is None:
        list_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'video_list.json')
    
    if not os.path.exists(list_path):
        print(f"[ERROR] 视频列表文件不存在: {list_path}")
        sys.exit(1)
    
    with open(list_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    return data.get('videos', [])


def ensure_video_in_db(video_info: Dict, db_path: str = DB_PATH) -> int:
    """确保视频记录存在于数据库中，返回 video_id"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    bvid = video_info['bvid']
    platform = video_info.get('platform', PLATFORM_BILIBILI)
    
    # 检查是否已存在
    cursor.execute("SELECT id, crawl_status FROM videos WHERE bvid = ?", (bvid,))
    result = cursor.fetchone()
    
    if result:
        conn.close()
        return result[0]
    
    title = video_info.get('drama_name', bvid)
    uploader = ''
    duration = 0
    
    # B站视频尝试从API获取信息
    if platform == PLATFORM_BILIBILI and bvid.startswith('BV'):
        api_info = get_video_info(bvid)
        if api_info:
            title = api_info['title']
            uploader = api_info['uploader']
            duration = api_info['duration']
    
    # 其他平台从 platform_meta 获取 duration
    platform_meta = video_info.get('platform_meta', {})
    if platform != PLATFORM_BILIBILI and 'duration' in platform_meta:
        duration = platform_meta['duration']
    
    tags = json.dumps(video_info.get('tags', []), ensure_ascii=False)
    platform_meta_str = json.dumps(platform_meta, ensure_ascii=False) if platform_meta else None
    
    cursor.execute(
        """INSERT INTO videos (bvid, platform, title, uploader, duration, genre, drama_name, episode_num, tags, crawl_status, platform_meta)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)""",
        (bvid, platform, title, uploader, duration,
         video_info.get('genre', '其他'),
         video_info.get('drama_name', ''),
         video_info.get('episode_num', 0),
         tags, platform_meta_str)
    )
    
    conn.commit()
    video_id = cursor.lastrowid
    conn.close()
    
    return video_id


def update_crawl_status(video_id: int, status: str, db_path: str = DB_PATH):
    """更新视频的爬取状态"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    if status == 'done':
        cursor.execute(
            "UPDATE videos SET crawl_status = ?, crawled_at = datetime('now') WHERE id = ?",
            (status, video_id)
        )
    else:
        cursor.execute(
            "UPDATE videos SET crawl_status = ? WHERE id = ?",
            (status, video_id)
        )
    
    conn.commit()
    conn.close()


def crawl_bilibili_video(video: Dict, video_id: int,
                          crawl_danmaku_flag: bool, crawl_subtitle_flag: bool,
                          crawl_comments_flag: bool, max_comment_pages: int) -> int:
    """爬取B站视频数据"""
    bvid = video['bvid']
    total_count = 0
    
    if crawl_danmaku_flag:
        count = crawl_danmaku(bvid, video_id)
        total_count += count
        time.sleep(get_delay())
    
    if crawl_subtitle_flag:
        count = crawl_subtitle(bvid, video_id)
        total_count += count
        time.sleep(get_delay())
    
    if crawl_comments_flag:
        count = crawl_comments(bvid, video_id, max_comment_pages)
        total_count += count
    
    return total_count


def crawl_tencent_video_data(video: Dict, video_id: int, max_comment_pages: int) -> int:
    """爬取腾讯视频数据"""
    meta = video.get('platform_meta', {})
    total_count = 0
    
    target_id = meta.get('target_id', '')
    vid = meta.get('vid', '')
    article_id = meta.get('article_id', '')
    duration = meta.get('duration', 7200)
    
    if target_id and vid:
        count = crawl_tencent_danmaku(target_id, vid, video_id, duration)
        total_count += count
        time.sleep(get_delay())
    
    if article_id:
        count = crawl_tencent_comments(article_id, video_id, max_comment_pages)
        total_count += count
    
    return total_count


def crawl_mgtv_video_data(video: Dict, video_id: int, max_comment_pages: int) -> int:
    """爬取芒果TV数据"""
    meta = video.get('platform_meta', {})
    total_count = 0
    
    danmaku_url_base = meta.get('danmaku_url_base', '')
    subject_id = meta.get('subject_id', '')
    max_pages = meta.get('max_pages', 120)
    
    if danmaku_url_base:
        count = crawl_mgtv_danmaku(danmaku_url_base, video_id, max_pages)
        total_count += count
        time.sleep(get_delay())
    
    if subject_id:
        count = crawl_mgtv_comments(subject_id, video_id, max_comment_pages)
        total_count += count
    
    return total_count


def crawl_iqiyi_video_data(video: Dict, video_id: int, max_comment_pages: int) -> int:
    """爬取爱奇艺数据"""
    meta = video.get('platform_meta', {})
    total_count = 0
    
    video_id_iqiyi = meta.get('video_id_iqiyi', '')
    content_id = meta.get('content_id', '')
    max_pages = meta.get('max_pages', 23)
    
    if video_id_iqiyi:
        count = crawl_iqiyi_danmaku(video_id_iqiyi, video_id, max_pages)
        total_count += count
        time.sleep(get_delay())
    
    if content_id:
        count = crawl_iqiyi_comments(content_id, video_id, max_comment_pages)
        total_count += count
    
    return total_count


def batch_crawl(video_list: List[Dict], skip_done: bool = True,
                crawl_danmaku_flag: bool = True,
                crawl_subtitle_flag: bool = True,
                crawl_comments_flag: bool = True,
                max_comment_pages: int = 10,
                platform_filter: str = None):
    """批量爬取视频数据（多平台）
    
    Args:
        video_list: 视频列表
        skip_done: 是否跳过已完成的视频
        crawl_danmaku_flag: 是否爬取弹幕（仅B站生效）
        crawl_subtitle_flag: 是否爬取字幕（仅B站生效）
        crawl_comments_flag: 是否爬取评论（仅B站生效）
        max_comment_pages: 评论最大爬取页数
        platform_filter: 仅爬取指定平台（可选）
    """
    # 按平台过滤
    if platform_filter:
        video_list = [v for v in video_list if v.get('platform', PLATFORM_BILIBILI) == platform_filter]
    
    total = len(video_list)
    
    # 统计各平台数量
    platform_counts = {}
    for v in video_list:
        p = v.get('platform', PLATFORM_BILIBILI)
        platform_counts[p] = platform_counts.get(p, 0) + 1
    
    print(f"\n{'='*60}")
    print(f"  多平台批量爬取任务：共 {total} 个视频")
    print(f"  平台分布: {platform_counts}")
    if platform_filter:
        print(f"  过滤平台: {platform_filter}")
    print(f"{'='*60}\n")
    
    stats = {'success': 0, 'skipped': 0, 'failed': 0}
    
    for i, video in enumerate(video_list, 1):
        bvid = video.get('bvid', '')
        platform = video.get('platform', PLATFORM_BILIBILI)
        
        # 跳过示例
        if 'example' in bvid or 'xxx' in bvid:
            print(f"[{i}/{total}] 跳过示例视频: {bvid}")
            stats['skipped'] += 1
            continue
        
        # B站视频需要BV号开头
        if platform == PLATFORM_BILIBILI and not bvid.startswith('BV'):
            print(f"[{i}/{total}] 跳过无效BV号: {bvid}")
            stats['skipped'] += 1
            continue
        
        print(f"\n[{i}/{total}] [{platform}] {video.get('drama_name', '')} - {bvid}")
        print(f"  类型: {video.get('genre', '未知')} | 第{video.get('episode_num', '?')}集")
        
        # 确保视频在数据库中
        video_id = ensure_video_in_db(video)
        
        # 检查是否已完成
        if skip_done:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute("SELECT crawl_status FROM videos WHERE id = ?", (video_id,))
            status = cursor.fetchone()
            conn.close()
            
            if status and status[0] == 'done':
                print(f"  [SKIP] 已完成爬取，跳过")
                stats['skipped'] += 1
                continue
        
        # 开始爬取
        update_crawl_status(video_id, 'crawling')
        
        try:
            if platform == PLATFORM_BILIBILI:
                total_count = crawl_bilibili_video(
                    video, video_id,
                    crawl_danmaku_flag, crawl_subtitle_flag,
                    crawl_comments_flag, max_comment_pages
                )
            elif platform == PLATFORM_TENCENT:
                total_count = crawl_tencent_video_data(video, video_id, max_comment_pages)
            elif platform == PLATFORM_MGTV:
                total_count = crawl_mgtv_video_data(video, video_id, max_comment_pages)
            elif platform == PLATFORM_IQIYI:
                total_count = crawl_iqiyi_video_data(video, video_id, max_comment_pages)
            else:
                print(f"  [WARN] 不支持的平台: {platform}")
                stats['failed'] += 1
                continue
            
            # 标记完成
            update_crawl_status(video_id, 'done')
            print(f"  [DONE] 视频爬取完成，共 {total_count} 条数据")
            stats['success'] += 1
            
        except Exception as e:
            update_crawl_status(video_id, 'failed')
            print(f"  [FAIL] 爬取异常: {e}")
            stats['failed'] += 1
        
        # 视频间等待
        if i < total:
            delay = get_delay() * 2
            print(f"  等待 {delay:.1f} 秒后继续...")
            time.sleep(delay)
    
    # 打印汇总
    print(f"\n{'='*60}")
    print(f"  批量爬取完成！")
    print(f"  成功: {stats['success']} | 跳过: {stats['skipped']} | 失败: {stats['failed']}")
    print(f"{'='*60}")
    print(f"\n[TIP] 爬取完成后运行 auto_filter.py 进行自动质量筛选")


def show_db_stats(db_path: str = DB_PATH):
    """显示数据库统计信息"""
    if not os.path.exists(db_path):
        print("[WARN] 数据库不存在，请先运行 init_db.py")
        return
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print(f"\n{'─'*40}")
    print("  数据库统计")
    print(f"{'─'*40}")
    
    cursor.execute("SELECT COUNT(*) FROM videos")
    print(f"  视频总数: {cursor.fetchone()[0]}")
    
    cursor.execute("SELECT COUNT(*) FROM raw_reactions WHERE is_filtered = 0")
    print(f"  有效 Reaction: {cursor.fetchone()[0]}")
    
    cursor.execute("SELECT COUNT(*) FROM raw_reactions WHERE is_filtered = 1")
    print(f"  已过滤: {cursor.fetchone()[0]}")
    
    # 检查 quality_reactions 表是否存在
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='quality_reactions'")
    if cursor.fetchone():
        cursor.execute("SELECT COUNT(*) FROM quality_reactions")
        print(f"  高质量（自动筛选）: {cursor.fetchone()[0]}")
        
        cursor.execute("SELECT COUNT(*) FROM quality_reactions WHERE is_fewshot = 1")
        print(f"  Few-shot 入选: {cursor.fetchone()[0]}")
    
    # 按平台分布
    cursor.execute("SELECT platform, COUNT(*) FROM videos GROUP BY platform")
    rows = cursor.fetchall()
    if rows:
        print(f"\n  按平台:")
        for row in rows:
            print(f"    {row[0]}: {row[1]} 个视频")
    
    # 按来源分布
    cursor.execute("SELECT source_type, COUNT(*) FROM raw_reactions WHERE is_filtered = 0 GROUP BY source_type")
    print(f"\n  按来源分布:")
    for row in cursor.fetchall():
        print(f"    {row[0]}: {row[1]} 条")
    
    # 按剧集类型分布
    cursor.execute("""
        SELECT v.genre, COUNT(r.id) 
        FROM raw_reactions r JOIN videos v ON r.video_id = v.id 
        WHERE r.is_filtered = 0 
        GROUP BY v.genre
    """)
    print(f"\n  按剧集类型:")
    for row in cursor.fetchall():
        print(f"    {row[0]}: {row[1]} 条")
    
    print(f"{'─'*40}")
    conn.close()


if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='多平台 Reaction 视频批量爬取工具')
    parser.add_argument('--list', type=str, default=None, help='视频列表JSON文件路径')
    parser.add_argument('--platform', type=str, choices=['bilibili', 'tencent', 'mgtv', 'iqiyi'], help='仅爬取指定平台')
    parser.add_argument('--no-danmaku', action='store_true', help='不爬取弹幕（仅B站）')
    parser.add_argument('--no-subtitle', action='store_true', help='不爬取字幕（仅B站）')
    parser.add_argument('--no-comments', action='store_true', help='不爬取评论（仅B站）')
    parser.add_argument('--comment-pages', type=int, default=10, help='评论最大页数（默认10）')
    parser.add_argument('--force', action='store_true', help='强制重新爬取（不跳过已完成）')
    parser.add_argument('--stats', action='store_true', help='仅显示数据库统计')
    
    args = parser.parse_args()
    
    # 检查数据库是否存在
    if not os.path.exists(DB_PATH):
        print("[ERROR] 数据库不存在！请先运行: python ../database/init_db.py")
        sys.exit(1)
    
    # 仅显示统计
    if args.stats:
        show_db_stats()
        sys.exit(0)
    
    # 加载视频列表
    video_list = load_video_list(args.list)
    
    if not video_list:
        print("[ERROR] 视频列表为空！请在 video_list.json 中添加视频")
        sys.exit(1)
    
    # 执行批量爬取
    batch_crawl(
        video_list=video_list,
        skip_done=not args.force,
        crawl_danmaku_flag=not args.no_danmaku,
        crawl_subtitle_flag=not args.no_subtitle,
        crawl_comments_flag=not args.no_comments,
        max_comment_pages=args.comment_pages,
        platform_filter=args.platform,
    )
    
    # 显示统计
    show_db_stats()
