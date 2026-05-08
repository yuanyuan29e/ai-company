"""
B站字幕爬取器
获取视频的 CC 字幕（如果有），解析为带时间戳的文本段存入数据库
"""

import time
import json
import sqlite3
import requests
from typing import List, Dict, Optional

from config import (
    DB_PATH, get_headers, get_delay, MAX_RETRIES, REQUEST_TIMEOUT,
    BILIBILI_PLAYER_API, BILIBILI_PAGELIST_API,
    MIN_TEXT_LENGTH, MAX_TEXT_LENGTH
)


def get_video_cid(bvid: str) -> Optional[int]:
    """获取视频的 cid"""
    url = BILIBILI_PAGELIST_API
    params = {'bvid': bvid}
    
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(url, params=params, headers=get_headers(), timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            data = resp.json()
            
            if data.get('code') == 0 and data.get('data'):
                return data['data'][0]['cid']
            return None
                
        except requests.RequestException as e:
            print(f"  [WARN] 请求失败 (尝试 {attempt + 1}/{MAX_RETRIES}): {e}")
            time.sleep(get_delay())
    
    return None


def get_subtitle_urls(bvid: str, cid: int) -> List[Dict]:
    """获取视频字幕 URL 列表
    
    Returns:
        [{'lan': 'zh-CN', 'lan_doc': '中文（中国）', 'subtitle_url': '...'}]
    """
    url = BILIBILI_PLAYER_API
    params = {'bvid': bvid, 'cid': cid}
    
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(url, params=params, headers=get_headers(), timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            data = resp.json()
            
            if data.get('code') == 0:
                subtitle_info = data.get('data', {}).get('subtitle', {})
                subtitles = subtitle_info.get('subtitles', [])
                return subtitles
            else:
                print(f"  [WARN] 获取字幕信息失败: {data.get('message', '未知错误')}")
                return []
                
        except requests.RequestException as e:
            print(f"  [WARN] 请求失败 (尝试 {attempt + 1}/{MAX_RETRIES}): {e}")
            time.sleep(get_delay())
    
    return []


def fetch_subtitle_content(subtitle_url: str) -> Optional[List[Dict]]:
    """获取字幕内容 JSON
    
    字幕格式：
    {
        "body": [
            {"from": 0.0, "to": 2.5, "content": "字幕文本"},
            ...
        ]
    }
    """
    # B站字幕 URL 可能没有协议头
    if subtitle_url.startswith('//'):
        subtitle_url = 'https:' + subtitle_url
    
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(subtitle_url, headers=get_headers(), timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            data = resp.json()
            
            return data.get('body', [])
            
        except requests.RequestException as e:
            print(f"  [WARN] 字幕内容请求失败 (尝试 {attempt + 1}/{MAX_RETRIES}): {e}")
            time.sleep(get_delay())
        except json.JSONDecodeError as e:
            print(f"  [ERROR] 字幕 JSON 解析失败: {e}")
            return None
    
    return None


def filter_subtitle(text: str) -> bool:
    """判断字幕是否应该保留"""
    if len(text) < MIN_TEXT_LENGTH or len(text) > MAX_TEXT_LENGTH:
        return False
    
    # 字幕通常是有意义的文本，过滤条件比弹幕宽松
    # 过滤纯标点/空白
    if not any('\u4e00' <= c <= '\u9fff' or c.isalpha() for c in text):
        return False
    
    return True


def crawl_subtitle(bvid: str, video_id: int, db_path: str = DB_PATH) -> int:
    """爬取单个视频的字幕并存入数据库
    
    Args:
        bvid: B站视频BV号
        video_id: 数据库中的视频ID
        db_path: 数据库路径
        
    Returns:
        成功入库的字幕条数
    """
    print(f"[字幕] 开始爬取 {bvid}")
    
    # 获取 cid
    cid = get_video_cid(bvid)
    if not cid:
        print(f"  [ERROR] 无法获取 cid，跳过")
        return 0
    
    time.sleep(get_delay())
    
    # 获取字幕 URL 列表
    subtitles = get_subtitle_urls(bvid, cid)
    if not subtitles:
        print(f"  [INFO] 该视频没有CC字幕")
        return 0
    
    print(f"  [INFO] 找到 {len(subtitles)} 个字幕轨道")
    
    # 优先获取中文字幕
    target_subtitle = None
    for sub in subtitles:
        if 'zh' in sub.get('lan', '').lower():
            target_subtitle = sub
            break
    
    if not target_subtitle and subtitles:
        target_subtitle = subtitles[0]
    
    if not target_subtitle:
        print(f"  [WARN] 无可用字幕")
        return 0
    
    print(f"  [INFO] 使用字幕: {target_subtitle.get('lan_doc', '未知语言')}")
    
    time.sleep(get_delay())
    
    # 获取字幕内容
    subtitle_body = fetch_subtitle_content(target_subtitle.get('subtitle_url', ''))
    if not subtitle_body:
        print(f"  [ERROR] 无法获取字幕内容")
        return 0
    
    print(f"  [INFO] 获取到 {len(subtitle_body)} 条字幕段")
    
    # 过滤并入库
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    inserted = 0
    
    for item in subtitle_body:
        text = item.get('content', '').strip()
        from_time = item.get('from', 0)
        to_time = item.get('to', 0)
        
        is_valid = filter_subtitle(text)
        
        extra_info = json.dumps({'from': from_time, 'to': to_time}, ensure_ascii=False)
        
        cursor.execute(
            """INSERT INTO raw_reactions (video_id, text, timestamp, source_type, like_count, user_name, extra_info, is_filtered)
               VALUES (?, ?, ?, 'subtitle', 0, NULL, ?, ?)""",
            (video_id, text, from_time, extra_info, 0 if is_valid else 1)
        )
        
        if is_valid:
            inserted += 1
    
    conn.commit()
    conn.close()
    
    print(f"  [OK] 入库 {inserted} 条有效字幕")
    return inserted


if __name__ == '__main__':
    import sys
    
    if len(sys.argv) < 2:
        print("用法: python bilibili_subtitle.py <BV号>")
        print("示例: python bilibili_subtitle.py BV1xx411x7xx")
        print("\n注意: 获取字幕可能需要登录Cookie，请在 config.py 中设置 BILIBILI_COOKIE")
        sys.exit(1)
    
    bvid = sys.argv[1]
    
    # 需要先在数据库中有视频记录
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM videos WHERE bvid = ?", (bvid,))
    result = cursor.fetchone()
    
    if not result:
        print(f"[ERROR] 视频 {bvid} 不在数据库中，请先运行 bilibili_danmaku.py 或手动添加")
        conn.close()
        sys.exit(1)
    
    video_id = result[0]
    conn.close()
    
    count = crawl_subtitle(bvid, video_id)
    print(f"\n完成！共入库 {count} 条字幕")
