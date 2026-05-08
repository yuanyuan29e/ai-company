"""
芒果TV爬虫
爬取弹幕（JSON格式，每分钟一包）和评论（分页15条/页）
"""

import time
import json
import sqlite3
import requests
from typing import List, Dict, Optional

from config import (
    DB_PATH, get_headers, get_delay, MAX_RETRIES, REQUEST_TIMEOUT,
    PLATFORM_MGTV, MGTV_COMMENT_API,
    MIN_TEXT_LENGTH, MAX_TEXT_LENGTH, FILTER_KEYWORDS
)


def filter_text(text: str) -> bool:
    """判断文本是否应该保留"""
    if not text or len(text) < MIN_TEXT_LENGTH or len(text) > MAX_TEXT_LENGTH:
        return False
    if not any('\u4e00' <= c <= '\u9fff' or c.isalpha() for c in text):
        return False
    text_lower = text.lower()
    for keyword in FILTER_KEYWORDS:
        if keyword.lower() in text_lower:
            return False
    return True


def crawl_mgtv_danmaku(danmaku_url_base: str, video_id: int,
                        max_pages: int = 120, db_path: str = DB_PATH) -> int:
    """爬取芒果TV弹幕
    
    Args:
        danmaku_url_base: 弹幕API基础URL（不含page部分）
            例如: https://bullet-ali.hitv.com/bullet/2021/08/14/005323/12281642/
        video_id: 数据库中的视频ID
        max_pages: 最大页数（视频分钟数向上取整）
        db_path: 数据库路径
        
    Returns:
        成功入库的弹幕条数
    """
    print(f"[芒果弹幕] 开始爬取")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    inserted = 0
    empty_count = 0
    
    for page in range(0, max_pages):
        try:
            url = f"{danmaku_url_base.rstrip('/')}/{page}.json"
            
            resp = requests.get(url, headers=get_headers(PLATFORM_MGTV), timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            data = resp.json()
            
            items = data.get('data', {}).get('items', [])
            if not items:
                empty_count += 1
                if empty_count >= 3:
                    print(f"  [INFO] 连续3次无数据，停止（page={page}）")
                    break
                time.sleep(get_delay())
                continue
            
            empty_count = 0
            
            for item in items:
                content = item.get('content', '').strip()
                danmaku_time = item.get('time', 0)
                
                is_valid = filter_text(content)
                
                extra = json.dumps({
                    'platform': 'mgtv',
                    'ids': item.get('ids', ''),
                }, ensure_ascii=False)
                
                cursor.execute(
                    """INSERT INTO raw_reactions (video_id, text, timestamp, source_type, like_count, user_name, extra_info, is_filtered)
                       VALUES (?, ?, ?, 'danmaku', 0, NULL, ?, ?)""",
                    (video_id, content, danmaku_time, extra, 0 if is_valid else 1)
                )
                if is_valid:
                    inserted += 1
            
            if page % 20 == 0:
                print(f"  [INFO] 已爬取 {page+1} 页")
            
            time.sleep(get_delay())
            
        except requests.RequestException as e:
            print(f"  [WARN] 第{page}页请求失败: {e}")
            time.sleep(get_delay())
        except (json.JSONDecodeError, KeyError) as e:
            print(f"  [WARN] 第{page}页解析失败: {e}")
            time.sleep(get_delay())
    
    conn.commit()
    conn.close()
    
    print(f"  [OK] 入库 {inserted} 条有效弹幕")
    return inserted


def crawl_mgtv_comments(subject_id: str, video_id: int,
                         max_pages: int = 50, db_path: str = DB_PATH) -> int:
    """爬取芒果TV评论
    
    Args:
        subject_id: 芒果TV视频的subjectId
        video_id: 数据库中的视频ID
        max_pages: 最大爬取页数
        db_path: 数据库路径
        
    Returns:
        成功入库的评论条数
    """
    print(f"[芒果评论] 开始爬取 subject_id={subject_id}")
    
    conn = sqlite3.connect(db_path)
    cursor_db = conn.cursor()
    
    inserted = 0
    
    for page in range(1, max_pages + 1):
        try:
            params = {
                'page': page,
                'subjectType': 'hunantv2014',
                'subjectId': subject_id,
                '_support': 10000000,
            }
            
            resp = requests.get(
                MGTV_COMMENT_API,
                params=params,
                headers=get_headers(PLATFORM_MGTV),
                timeout=REQUEST_TIMEOUT
            )
            resp.raise_for_status()
            data = resp.json()
            
            comment_list = data.get('data', {}).get('list', [])
            if not comment_list:
                print(f"  [INFO] 第{page}页无数据，停止")
                break
            
            for item in comment_list:
                content = item.get('content', '').strip()
                like_count = item.get('praiseNum', 0)
                user_name = item.get('user', {}).get('nickName', '')
                date_str = item.get('date', '')
                
                is_valid = filter_text(content)
                
                extra = json.dumps({
                    'platform': 'mgtv',
                    'date': date_str,
                }, ensure_ascii=False)
                
                cursor_db.execute(
                    """INSERT INTO raw_reactions (video_id, text, timestamp, source_type, like_count, user_name, extra_info, is_filtered)
                       VALUES (?, ?, NULL, 'comment', ?, ?, ?, ?)""",
                    (video_id, content, like_count, user_name, extra, 0 if is_valid else 1)
                )
                if is_valid:
                    inserted += 1
            
            print(f"  [INFO] 第{page}页：{len(comment_list)} 条评论")
            time.sleep(get_delay())
            
        except requests.RequestException as e:
            print(f"  [WARN] 第{page}页请求失败: {e}")
            time.sleep(get_delay())
        except (json.JSONDecodeError, KeyError) as e:
            print(f"  [WARN] 第{page}页解析失败: {e}")
            break
    
    conn.commit()
    conn.close()
    
    print(f"  [OK] 入库 {inserted} 条有效评论")
    return inserted


if __name__ == '__main__':
    print("芒果TV爬虫")
    print("用法:")
    print("  python mgtv.py danmaku <弹幕URL基础路径> <video_id> [max_pages]")
    print("  python mgtv.py comments <subject_id> <video_id> [max_pages]")
    print()
    print("示例:")
    print("  python mgtv.py danmaku https://bullet-ali.hitv.com/bullet/2021/08/14/005323/12281642 1 121")
    print("  python mgtv.py comments 12281642 1 50")
