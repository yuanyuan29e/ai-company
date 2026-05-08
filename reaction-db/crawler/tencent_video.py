"""
腾讯视频爬虫
爬取弹幕（JSON格式，每30秒一包）和评论（cursor翻页）
"""

import time
import json
import sqlite3
import requests
from typing import List, Dict, Optional

from config import (
    DB_PATH, get_headers, get_delay, MAX_RETRIES, REQUEST_TIMEOUT,
    PLATFORM_TENCENT, TENCENT_DANMU_API, TENCENT_COMMENT_API,
    MIN_TEXT_LENGTH, MAX_TEXT_LENGTH, FILTER_KEYWORDS
)


def filter_text(text: str) -> bool:
    """判断文本是否应该保留"""
    if not text or len(text) < MIN_TEXT_LENGTH or len(text) > MAX_TEXT_LENGTH:
        return False
    # 过滤纯标点/空白
    if not any('\u4e00' <= c <= '\u9fff' or c.isalpha() for c in text):
        return False
    # 过滤广告/无关内容
    text_lower = text.lower()
    for keyword in FILTER_KEYWORDS:
        if keyword.lower() in text_lower:
            return False
    return True


def crawl_tencent_danmaku(target_id: str, vid: str, video_id: int,
                           duration: int = 7200, db_path: str = DB_PATH) -> int:
    """爬取腾讯视频弹幕
    
    Args:
        target_id: 腾讯视频弹幕target_id
        vid: 腾讯视频vid
        video_id: 数据库中的视频ID
        duration: 视频时长（秒），默认2小时
        db_path: 数据库路径
        
    Returns:
        成功入库的弹幕条数
    """
    print(f"[腾讯弹幕] 开始爬取 vid={vid}")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    inserted = 0
    
    # 新版弹幕API：每30秒一段，使用毫秒时间戳
    # URL格式: https://dm.video.qq.com/barrage/segment/{target_id}/t/v1/{start_ms}/{end_ms}
    segment_duration = 30  # 每段30秒
    
    for seg_start in range(0, duration, segment_duration):
        seg_end = seg_start + segment_duration
        start_ms = seg_start * 1000
        end_ms = seg_end * 1000
        ts = seg_start + segment_duration // 2  # 时间戳取中间值
        
        try:
            # 新版API
            url = f"https://dm.video.qq.com/barrage/segment/{target_id}/t/v1/{start_ms}/{end_ms}"
            
            resp = requests.get(
                url,
                headers=get_headers(PLATFORM_TENCENT),
                timeout=REQUEST_TIMEOUT
            )
            resp.raise_for_status()
            data = resp.json()
            
            barrage_list = data.get('barrage_list', [])
            if not barrage_list:
                # 没有数据了，可能已经超出视频时长
                empty_count = getattr(crawl_tencent_danmaku, '_empty_count', 0) + 1
                crawl_tencent_danmaku._empty_count = empty_count
                if empty_count >= 3:
                    print(f"  [INFO] 连续3次无数据，停止（timestamp={ts}）")
                    crawl_tencent_danmaku._empty_count = 0
                    break
                time.sleep(get_delay())
                continue
            
            crawl_tencent_danmaku._empty_count = 0
            
            for barrage in barrage_list:
                content = barrage.get('content', '').strip()
                # time_offset 是毫秒级时间戳
                time_offset_ms = int(barrage.get('time_offset', 0))
                barrage_ts = seg_start + time_offset_ms // 1000
                like_count = int(barrage.get('up_count', 0))
                nick = barrage.get('nick', '')
                
                is_valid = filter_text(content)
                
                cursor.execute(
                    """INSERT INTO raw_reactions (video_id, text, timestamp, source_type, like_count, user_name, extra_info, is_filtered)
                       VALUES (?, ?, ?, 'danmaku', ?, ?, ?, ?)""",
                    (video_id, content, barrage_ts, like_count, nick,
                     json.dumps({'platform': 'tencent', 'barrage_id': barrage.get('id', '')}, ensure_ascii=False),
                     0 if is_valid else 1)
                )
                if is_valid:
                    inserted += 1
            
            # 每30段（15分钟）打印一次进度
            seg_idx = seg_start // segment_duration
            if seg_idx > 0 and seg_idx % 30 == 0:
                print(f"  [INFO] 已爬取到 {seg_start//60} 分钟, 当前累计 {inserted} 条有效弹幕")
            
            time.sleep(get_delay())
            
        except requests.RequestException as e:
            print(f"  [WARN] 请求失败 (timestamp={ts}): {e}")
            time.sleep(get_delay())
        except (json.JSONDecodeError, KeyError) as e:
            print(f"  [WARN] 数据解析失败 (timestamp={ts}): {e}")
            time.sleep(get_delay())
    
    conn.commit()
    conn.close()
    
    print(f"  [OK] 入库 {inserted} 条有效弹幕")
    return inserted


def crawl_tencent_comments(article_id: str, video_id: int,
                            max_pages: int = 30, db_path: str = DB_PATH) -> int:
    """爬取腾讯视频评论
    
    Args:
        article_id: 腾讯视频评论区article_id
        video_id: 数据库中的视频ID
        max_pages: 最大爬取页数
        db_path: 数据库路径
        
    Returns:
        成功入库的评论条数
    """
    print(f"[腾讯评论] 开始爬取 article_id={article_id}")
    
    conn = sqlite3.connect(db_path)
    cursor_db = conn.cursor()
    
    inserted = 0
    cursor_val = '0'  # 首次cursor为0
    
    for page in range(max_pages):
        try:
            url = TENCENT_COMMENT_API.format(article_id=article_id)
            params = {
                'orinum': 10,
                'oriorder': 'o',
                'pageflag': 1,
                'cursor': cursor_val,
                'scorecursor': 0,
                'orirepnum': 2,
                'reporder': 'o',
                'reppageflag': 1,
                'source': 132,
            }
            
            resp = requests.get(
                url, params=params,
                headers=get_headers(PLATFORM_TENCENT),
                timeout=REQUEST_TIMEOUT
            )
            resp.raise_for_status()
            data = resp.json()
            
            comment_list = data.get('data', {}).get('oriCommList', [])
            if not comment_list:
                print(f"  [INFO] 第{page+1}页无数据，停止")
                break
            
            # 获取下一页的cursor
            cursor_val = str(data.get('data', {}).get('last', ''))
            if not cursor_val:
                break
            
            for item in comment_list:
                content = item.get('content', '').replace('\n', ' ').strip()
                like_count = item.get('up', 0)
                user_name = item.get('nick', '')
                
                is_valid = filter_text(content)
                
                extra = json.dumps({
                    'platform': 'tencent',
                    'comment_id': item.get('id', ''),
                    'time': item.get('time', ''),
                }, ensure_ascii=False)
                
                cursor_db.execute(
                    """INSERT INTO raw_reactions (video_id, text, timestamp, source_type, like_count, user_name, extra_info, is_filtered)
                       VALUES (?, ?, NULL, 'comment', ?, ?, ?, ?)""",
                    (video_id, content, like_count, user_name, extra, 0 if is_valid else 1)
                )
                if is_valid:
                    inserted += 1
            
            print(f"  [INFO] 第{page+1}页：{len(comment_list)} 条评论")
            time.sleep(get_delay())
            
        except requests.RequestException as e:
            print(f"  [WARN] 第{page+1}页请求失败: {e}")
            time.sleep(get_delay())
        except (json.JSONDecodeError, KeyError) as e:
            print(f"  [WARN] 第{page+1}页解析失败: {e}")
            break
    
    conn.commit()
    conn.close()
    
    print(f"  [OK] 入库 {inserted} 条有效评论")
    return inserted


if __name__ == '__main__':
    import sys
    
    print("腾讯视频爬虫")
    print("用法:")
    print("  python tencent_video.py danmaku <target_id> <vid> <video_id> [duration]")
    print("  python tencent_video.py comments <article_id> <video_id> [max_pages]")
    print()
    print("示例:")
    print("  python tencent_video.py danmaku 7220956568 t0040z3o3la 1 7245")
    print("  python tencent_video.py comments 6655100451 1 30")
