"""
爱奇艺爬虫
爬取弹幕（.z压缩XML，每5分钟一包）和评论（last_id翻页）
"""

import time
import json
import zlib
import sqlite3
import requests
from typing import List, Dict, Optional

try:
    from lxml import etree
except ImportError:
    print("[WARN] lxml 未安装，爱奇艺弹幕解析需要 lxml: pip install lxml")
    etree = None

from config import (
    DB_PATH, get_headers, get_delay, MAX_RETRIES, REQUEST_TIMEOUT,
    PLATFORM_IQIYI, IQIYI_COMMENT_API,
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


def crawl_iqiyi_danmaku(video_id_iqiyi: str, video_id: int,
                         max_pages: int = 23, db_path: str = DB_PATH) -> int:
    """爬取爱奇艺弹幕
    
    爱奇艺弹幕使用旧接口，.z 压缩文件，解压后为 XML 格式。
    每5分钟一个数据包（300秒），page从1递增。
    URL 格式: https://cmts.iqiyi.com/bullet/{id[6:8]}/{id[0:2]}/{video_id}_300_{page}.z
    
    Args:
        video_id_iqiyi: 爱奇艺视频ID（纯数字）
        video_id: 数据库中的视频ID
        max_pages: 最大页数（视频分钟数/5 向上取整）
        db_path: 数据库路径
        
    Returns:
        成功入库的弹幕条数
    """
    if etree is None:
        print("[ERROR] lxml 未安装，无法解析爱奇艺弹幕")
        return 0
    
    print(f"[爱奇艺弹幕] 开始爬取 video_id={video_id_iqiyi}")
    
    # 构造URL中的路径参数
    # 正确规则: /倒数3-4位/最后两位/
    # 例: tvid=8843577660064500 -> /45/00/
    id_str = str(video_id_iqiyi)
    part1 = id_str[-4:-2] if len(id_str) >= 4 else '00'  # 倒数3-4位
    part2 = id_str[-2:] if len(id_str) >= 2 else '00'    # 最后两位
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    inserted = 0
    
    for page in range(1, max_pages + 1):
        try:
            url = f"https://cmts.iqiyi.com/bullet/{part1}/{part2}/{video_id_iqiyi}_300_{page}.z"
            
            resp = requests.get(url, headers=get_headers(PLATFORM_IQIYI), timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            
            # zlib 解压（使用 15+32 兼容 gzip/zlib 两种格式）
            decompressed_bytes = zlib.decompress(bytearray(resp.content), 15 + 32)
            
            # XML 解析（使用 bytes 输入避免 encoding declaration 问题）
            html = etree.fromstring(decompressed_bytes)
            # 实际API返回标签: <danmu><data><entry><list><bulletInfo>
            bullet_list = html.xpath('.//bulletInfo') or html.xpath('.//bulletinfo')
            
            if not bullet_list:
                print(f"  [INFO] 第{page}页无弹幕数据")
                time.sleep(get_delay())
                continue
            
            for bullet in bullet_list:
                content_el = bullet.xpath('./content/text()')
                content = ''.join(content_el).strip() if content_el else ''
                
                like_el = bullet.xpath('./likecount/text()')
                like_count = int(''.join(like_el)) if like_el else 0
                
                is_valid = filter_text(content)
                
                # 时间戳近似：page * 300 秒
                approx_time = (page - 1) * 300
                
                extra = json.dumps({
                    'platform': 'iqiyi',
                    'page': page,
                }, ensure_ascii=False)
                
                cursor.execute(
                    """INSERT INTO raw_reactions (video_id, text, timestamp, source_type, like_count, user_name, extra_info, is_filtered)
                       VALUES (?, ?, ?, 'danmaku', ?, NULL, ?, ?)""",
                    (video_id, content, approx_time, like_count, extra, 0 if is_valid else 1)
                )
                if is_valid:
                    inserted += 1
            
            if page % 5 == 0:
                print(f"  [INFO] 已爬取 {page} 页")
            
            time.sleep(get_delay())
            
        except requests.RequestException as e:
            print(f"  [WARN] 第{page}页请求失败: {e}")
            time.sleep(get_delay())
        except Exception as e:
            print(f"  [WARN] 第{page}页解析失败: {e}")
            time.sleep(get_delay())
    
    conn.commit()
    conn.close()
    
    print(f"  [OK] 入库 {inserted} 条有效弹幕")
    return inserted


def crawl_iqiyi_comments(content_id: str, video_id: int,
                          max_pages: int = 50, db_path: str = DB_PATH) -> int:
    """爬取爱奇艺评论
    
    使用 last_id 翻页，每页20条。
    
    Args:
        content_id: 爱奇艺视频的 content_id
        video_id: 数据库中的视频ID
        max_pages: 最大爬取页数
        db_path: 数据库路径
        
    Returns:
        成功入库的评论条数
    """
    print(f"[爱奇艺评论] 开始爬取 content_id={content_id}")
    
    conn = sqlite3.connect(db_path)
    cursor_db = conn.cursor()
    
    inserted = 0
    last_id = ''
    
    for page in range(max_pages):
        try:
            params = {
                'agent_type': 118,
                'agent_version': '9.11.5',
                'business_type': 17,
                'content_id': content_id,
                'page_size': 20,
            }
            
            if last_id:
                params['last_id'] = last_id
            
            resp = requests.get(
                IQIYI_COMMENT_API,
                params=params,
                headers=get_headers(PLATFORM_IQIYI),
                timeout=REQUEST_TIMEOUT
            )
            resp.raise_for_status()
            data = resp.json()
            
            comments = data.get('data', {}).get('comments', [])
            if not comments:
                print(f"  [INFO] 第{page+1}页无数据，停止")
                break
            
            # 更新 last_id（取最后一条的 id）
            id_list = []
            for item in comments:
                comment_id = item.get('id', '')
                id_list.append(str(comment_id))
                
                content = item.get('content', '不存在')
                if content == '不存在':
                    continue
                content = content.strip()
                
                user_name = item.get('userInfo', {}).get('uname', '')
                add_time = item.get('addTime', '')
                
                is_valid = filter_text(content)
                
                extra = json.dumps({
                    'platform': 'iqiyi',
                    'addTime': add_time,
                    'comment_id': comment_id,
                }, ensure_ascii=False)
                
                cursor_db.execute(
                    """INSERT INTO raw_reactions (video_id, text, timestamp, source_type, like_count, user_name, extra_info, is_filtered)
                       VALUES (?, ?, NULL, 'comment', 0, ?, ?, ?)""",
                    (video_id, content, user_name, extra, 0 if is_valid else 1)
                )
                if is_valid:
                    inserted += 1
            
            if id_list:
                last_id = id_list[-1]
            else:
                break
            
            print(f"  [INFO] 第{page+1}页：{len(comments)} 条评论")
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
    print("爱奇艺爬虫")
    print("用法:")
    print("  python iqiyi.py danmaku <iqiyi_video_id> <db_video_id> [max_pages]")
    print("  python iqiyi.py comments <content_id> <db_video_id> [max_pages]")
    print()
    print("示例:")
    print("  python iqiyi.py danmaku 1078946400 1 23")
    print("  python iqiyi.py comments 1078946400 1 50")
