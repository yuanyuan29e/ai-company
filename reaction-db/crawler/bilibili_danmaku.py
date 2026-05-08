"""
B站弹幕爬取器
从B站视频获取弹幕数据（XML格式），解析后存入 SQLite 数据库
"""

import re
import time
import sqlite3
import requests
import xml.etree.ElementTree as ET
from typing import List, Dict, Optional

from config import (
    DB_PATH, get_headers, get_delay, MAX_RETRIES, REQUEST_TIMEOUT,
    BILIBILI_DANMAKU_API, BILIBILI_VIDEO_INFO_API, BILIBILI_PAGELIST_API,
    MIN_TEXT_LENGTH, MAX_TEXT_LENGTH, FILTER_KEYWORDS
)


def get_video_cid(bvid: str) -> Optional[int]:
    """获取视频的 cid（弹幕容器ID）"""
    url = BILIBILI_PAGELIST_API
    params = {'bvid': bvid}
    
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(url, params=params, headers=get_headers(), timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            data = resp.json()
            
            if data.get('code') == 0 and data.get('data'):
                return data['data'][0]['cid']
            else:
                print(f"  [WARN] 获取 cid 失败: {data.get('message', '未知错误')}")
                return None
                
        except requests.RequestException as e:
            print(f"  [WARN] 请求失败 (尝试 {attempt + 1}/{MAX_RETRIES}): {e}")
            time.sleep(get_delay())
    
    return None


def get_video_info(bvid: str) -> Optional[Dict]:
    """获取视频基本信息"""
    url = BILIBILI_VIDEO_INFO_API
    params = {'bvid': bvid}
    
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(url, params=params, headers=get_headers(), timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            data = resp.json()
            
            if data.get('code') == 0 and data.get('data'):
                info = data['data']
                return {
                    'title': info.get('title', ''),
                    'uploader': info.get('owner', {}).get('name', ''),
                    'duration': info.get('duration', 0),
                    'cid': info.get('cid', 0),
                }
            else:
                print(f"  [WARN] 获取视频信息失败: {data.get('message', '未知错误')}")
                return None
                
        except requests.RequestException as e:
            print(f"  [WARN] 请求失败 (尝试 {attempt + 1}/{MAX_RETRIES}): {e}")
            time.sleep(get_delay())
    
    return None


def fetch_danmaku_xml(cid: int) -> Optional[str]:
    """获取弹幕 XML 数据"""
    url = f"{BILIBILI_DANMAKU_API}?oid={cid}"
    
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(url, headers=get_headers(), timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            # B站弹幕接口返回的是 deflate 压缩的 XML
            resp.encoding = 'utf-8'
            return resp.text
            
        except requests.RequestException as e:
            print(f"  [WARN] 弹幕请求失败 (尝试 {attempt + 1}/{MAX_RETRIES}): {e}")
            time.sleep(get_delay())
    
    return None


def parse_danmaku_xml(xml_text: str) -> List[Dict]:
    """解析弹幕 XML 为结构化数据
    
    弹幕 XML 格式：
    <d p="时间,模式,字号,颜色,发送时间,弹幕池,用户哈希,弹幕ID">弹幕内容</d>
    p 参数说明：
    - [0] 时间：弹幕出现时间（秒）
    - [1] 模式：1普通 4底部 5顶部 6逆向 7精准定位 8高级
    - [2] 字号：25普通 18小
    - [3] 颜色：十进制颜色值
    - [4] 发送时间：UNIX时间戳
    - [5] 弹幕池：0普通 1字幕 2特殊
    - [6] 用户哈希
    - [7] 弹幕ID
    """
    danmakus = []
    
    try:
        root = ET.fromstring(xml_text)
        for d in root.findall('.//d'):
            text = d.text
            if not text:
                continue
                
            p_attrs = d.get('p', '').split(',')
            if len(p_attrs) < 8:
                continue
            
            try:
                timestamp = float(p_attrs[0])
                mode = int(p_attrs[1])
                color = int(p_attrs[3])
                send_time = int(p_attrs[4])
                user_hash = p_attrs[6]
            except (ValueError, IndexError):
                continue
            
            danmakus.append({
                'text': text.strip(),
                'timestamp': timestamp,
                'mode': mode,
                'color': color,
                'send_time': send_time,
                'user_hash': user_hash,
            })
            
    except ET.ParseError as e:
        print(f"  [ERROR] XML 解析错误: {e}")
    
    return danmakus


def filter_danmaku(text: str) -> bool:
    """判断弹幕是否应该保留（返回 True 表示保留）"""
    # 长度过滤
    if len(text) < MIN_TEXT_LENGTH or len(text) > MAX_TEXT_LENGTH:
        return False
    
    # 关键词过滤
    text_lower = text.lower()
    for keyword in FILTER_KEYWORDS:
        if keyword.lower() in text_lower:
            return False
    
    # 纯数字/标点过滤
    if re.match(r'^[\d\s\W]+$', text) and not re.search(r'[\u4e00-\u9fff]', text):
        return False
    
    return True


def crawl_danmaku(bvid: str, video_id: int, db_path: str = DB_PATH) -> int:
    """爬取单个视频的弹幕并存入数据库
    
    Args:
        bvid: B站视频BV号
        video_id: 数据库中的视频ID
        db_path: 数据库路径
        
    Returns:
        成功入库的弹幕条数
    """
    print(f"[弹幕] 开始爬取 {bvid}")
    
    # 获取 cid
    cid = get_video_cid(bvid)
    if not cid:
        print(f"  [ERROR] 无法获取 cid，跳过")
        return 0
    
    time.sleep(get_delay())
    
    # 获取弹幕 XML
    xml_text = fetch_danmaku_xml(cid)
    if not xml_text:
        print(f"  [ERROR] 无法获取弹幕数据，跳过")
        return 0
    
    # 解析弹幕
    danmakus = parse_danmaku_xml(xml_text)
    print(f"  [INFO] 获取到 {len(danmakus)} 条原始弹幕")
    
    # 过滤并入库
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    inserted = 0
    filtered_out = 0
    
    for dm in danmakus:
        is_valid = filter_danmaku(dm['text'])
        
        extra_info = f'{{"mode": {dm["mode"]}, "color": {dm["color"]}}}'
        
        cursor.execute(
            """INSERT INTO raw_reactions (video_id, text, timestamp, source_type, like_count, user_name, extra_info, is_filtered)
               VALUES (?, ?, ?, 'danmaku', 0, ?, ?, ?)""",
            (video_id, dm['text'], dm['timestamp'], dm['user_hash'], extra_info, 0 if is_valid else 1)
        )
        
        if is_valid:
            inserted += 1
        else:
            filtered_out += 1
    
    conn.commit()
    conn.close()
    
    print(f"  [OK] 入库 {inserted} 条有效弹幕，过滤 {filtered_out} 条")
    return inserted


if __name__ == '__main__':
    import sys
    
    if len(sys.argv) < 2:
        print("用法: python bilibili_danmaku.py <BV号>")
        print("示例: python bilibili_danmaku.py BV1xx411x7xx")
        sys.exit(1)
    
    bvid = sys.argv[1]
    
    # 先获取视频信息
    info = get_video_info(bvid)
    if info:
        print(f"视频标题: {info['title']}")
        print(f"UP主: {info['uploader']}")
        print(f"时长: {info['duration']}秒")
    
    # 需要先在数据库中创建视频记录
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT OR IGNORE INTO videos (bvid, title, uploader, duration, genre) VALUES (?, ?, ?, ?, ?)",
        (bvid, info['title'] if info else bvid, info['uploader'] if info else '', info['duration'] if info else 0, '其他')
    )
    conn.commit()
    
    cursor.execute("SELECT id FROM videos WHERE bvid = ?", (bvid,))
    video_id = cursor.fetchone()[0]
    conn.close()
    
    # 爬取弹幕
    count = crawl_danmaku(bvid, video_id)
    print(f"\n完成！共入库 {count} 条弹幕")
