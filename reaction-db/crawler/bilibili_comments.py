"""
B站评论区爬取器
获取视频评论区的高赞评论，提取有情感价值的短评存入数据库
"""

import time
import json
import sqlite3
import requests
from typing import List, Dict, Optional

from config import (
    DB_PATH, get_headers, get_delay, MAX_RETRIES, REQUEST_TIMEOUT,
    BILIBILI_COMMENT_API, BILIBILI_VIDEO_INFO_API,
    MIN_TEXT_LENGTH, MAX_TEXT_LENGTH, FILTER_KEYWORDS
)


def get_video_aid(bvid: str) -> Optional[int]:
    """获取视频的 aid（评论区需要）"""
    url = BILIBILI_VIDEO_INFO_API
    params = {'bvid': bvid}
    
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(url, params=params, headers=get_headers(), timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            data = resp.json()
            
            if data.get('code') == 0 and data.get('data'):
                return data['data'].get('aid')
            return None
                
        except requests.RequestException as e:
            print(f"  [WARN] 请求失败 (尝试 {attempt + 1}/{MAX_RETRIES}): {e}")
            time.sleep(get_delay())
    
    return None


def fetch_comments(aid: int, page: int = 1, sort: int = 1) -> Optional[Dict]:
    """获取评论列表
    
    Args:
        aid: 视频 aid
        page: 页码
        sort: 排序方式，0=按时间 1=按点赞 2=按回复
        
    Returns:
        API 响应 JSON
    """
    url = BILIBILI_COMMENT_API
    params = {
        'type': 1,       # 1=视频
        'oid': aid,
        'mode': 3,       # 3=热门排序
        'next': page,
    }
    
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(url, params=params, headers=get_headers(), timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            data = resp.json()
            
            if data.get('code') == 0:
                return data.get('data', {})
            else:
                print(f"  [WARN] 获取评论失败: {data.get('message', '未知错误')}")
                return None
                
        except requests.RequestException as e:
            print(f"  [WARN] 请求失败 (尝试 {attempt + 1}/{MAX_RETRIES}): {e}")
            time.sleep(get_delay())
    
    return None


def filter_comment(text: str) -> bool:
    """判断评论是否应该保留"""
    # 长度过滤（评论允许稍长一点）
    if len(text) < MIN_TEXT_LENGTH or len(text) > 100:
        return False
    
    # 关键词过滤
    text_lower = text.lower()
    for keyword in FILTER_KEYWORDS:
        if keyword.lower() in text_lower:
            return False
    
    # 过滤纯表情/符号
    import re
    if not re.search(r'[\u4e00-\u9fff\w]', text):
        return False
    
    return True


def extract_short_reactions(text: str) -> List[str]:
    """从长评论中提取短句（可能包含多个 reaction 风格的句子）
    
    长评论可能包含多句话，提取其中适合作为弹幕风格 Reaction 的短句
    """
    import re
    
    # 如果文本本身就很短，直接返回
    if len(text) <= MAX_TEXT_LENGTH:
        return [text]
    
    # 按标点切分
    sentences = re.split(r'[。！？!?；;，,\n]+', text)
    
    short_reactions = []
    for sentence in sentences:
        sentence = sentence.strip()
        if MIN_TEXT_LENGTH <= len(sentence) <= MAX_TEXT_LENGTH:
            short_reactions.append(sentence)
    
    return short_reactions


def crawl_comments(bvid: str, video_id: int, max_pages: int = 5, db_path: str = DB_PATH) -> int:
    """爬取视频评论并存入数据库
    
    Args:
        bvid: B站视频BV号
        video_id: 数据库中的视频ID
        max_pages: 最大爬取页数
        db_path: 数据库路径
        
    Returns:
        成功入库的评论条数
    """
    print(f"[评论] 开始爬取 {bvid}")
    
    # 获取 aid
    aid = get_video_aid(bvid)
    if not aid:
        print(f"  [ERROR] 无法获取 aid，跳过")
        return 0
    
    time.sleep(get_delay())
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    total_inserted = 0
    
    for page in range(1, max_pages + 1):
        print(f"  [INFO] 获取第 {page}/{max_pages} 页评论...")
        
        data = fetch_comments(aid, page)
        if not data:
            break
        
        replies = data.get('replies', [])
        if not replies:
            print(f"  [INFO] 第 {page} 页无更多评论")
            break
        
        page_inserted = 0
        
        for reply in replies:
            content = reply.get('content', {})
            message = content.get('message', '').strip()
            like_count = reply.get('like', 0)
            user_name = reply.get('member', {}).get('uname', '')
            
            # 提取短句
            reactions = extract_short_reactions(message)
            
            for reaction_text in reactions:
                is_valid = filter_comment(reaction_text)
                
                extra_info = json.dumps({
                    'like': like_count,
                    'original_full': message if message != reaction_text else None,
                }, ensure_ascii=False)
                
                cursor.execute(
                    """INSERT INTO raw_reactions (video_id, text, timestamp, source_type, like_count, user_name, extra_info, is_filtered)
                       VALUES (?, ?, NULL, 'comment', ?, ?, ?, ?)""",
                    (video_id, reaction_text, like_count, user_name, extra_info, 0 if is_valid else 1)
                )
                
                if is_valid:
                    page_inserted += 1
        
        total_inserted += page_inserted
        print(f"  [INFO] 第 {page} 页入库 {page_inserted} 条有效评论")
        
        # 检查是否还有下一页
        cursor_info = data.get('cursor', {})
        if not cursor_info.get('is_end', True):
            time.sleep(get_delay())
        else:
            break
    
    conn.commit()
    conn.close()
    
    print(f"  [OK] 共入库 {total_inserted} 条有效评论")
    return total_inserted


if __name__ == '__main__':
    import sys
    
    if len(sys.argv) < 2:
        print("用法: python bilibili_comments.py <BV号> [最大页数]")
        print("示例: python bilibili_comments.py BV1xx411x7xx 3")
        sys.exit(1)
    
    bvid = sys.argv[1]
    max_pages = int(sys.argv[2]) if len(sys.argv) > 2 else 5
    
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
    
    count = crawl_comments(bvid, video_id, max_pages)
    print(f"\n完成！共入库 {count} 条评论")
