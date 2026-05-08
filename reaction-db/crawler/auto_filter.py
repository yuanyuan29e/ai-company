"""
自动质量筛选脚本
基于点赞数/文本质量/情感词密度自动评分，
将高质量数据从 raw_reactions 导入 quality_reactions 表。
完全取代人工标注流程。
"""

import os
import sys
import re
import sqlite3
import argparse
from typing import List, Dict, Tuple

# 数据库路径
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'database', 'reaction.db')

# ============ 情感词典 ============

# 常见情感词/表达（用于判断文本是否具有情感价值）
EMOTION_WORDS = {
    # 兴奋/惊喜
    '卧槽', '天哪', '绝了', '太帅了', '好帅', '我的妈', '震惊', '牛逼',
    '太强了', '厉害', '无敌', '爆了', '炸了', '神了', '秀啊', 'yyds',
    # 开心/甜蜜
    '太甜了', '磕到了', '好甜', '幸福', '开心', '太好了', '爱了',
    '心动', '嗑死', '好嗑', '糖好多', '发糖', '好幸福',
    # 搞笑
    '笑死', '哈哈', '太搞了', '乐死', '绝了', '好好笑', '笑疯',
    '笑出声', '笑到', '太逗了', '离谱', '整活',
    # 感动/虐心
    '好哭', '哭了', '心疼', '太虐了', '破防', '泪目', '感动',
    '太惨了', '虐哭', '受不了', '难受', '扎心',
    # 思考/分析
    '伏笔', '细节', '暗示', '线索', '反转', '高能', '注意到',
    '怀疑', '推理', '预测', '猜到', '果然', '原来',
    # 吐槽
    '离谱', '什么鬼', '无语', '尴尬', '烂', '难看', '差评',
    '太假了', '智商', '降智', '编剧',
}

# 水弹幕模式（重复/无意义内容）
WATER_PATTERNS = [
    r'^[哈嘿呵]{3,}$',         # 纯哈哈哈
    r'^[6６]{3,}$',             # 纯666
    r'^[?？!！.。]+$',          # 纯标点
    r'^.{1}$',                  # 单字
    r'^(第一|前排|来了|打卡)$',   # 签到类
    r'^[a-zA-Z]{1,3}$',        # 短英文
]

# 文本分类关键词（用于自动推断text_category）
CATEGORY_KEYWORDS = {
    'reaction': ['卧槽', '天哪', '绝了', '太甜了', '磕到', '好帅', '笑死', '哭了', '太虐', '破防'],
    'analysis': ['伏笔', '细节', '暗示', '线索', '推理', '预测', '怀疑', '原来', '前面', '后面'],
    'emotion': ['心疼', '感动', '太好了', '幸福', '难受', '破防', '泪目', '好哭', '扎心'],
    'humor': ['哈哈', '笑死', '太搞了', '离谱', '什么鬼', '乐死', '整活', '绝了', '太逗'],
}


def has_emotion_words(text: str) -> bool:
    """检查文本是否包含情感词"""
    for word in EMOTION_WORDS:
        if word in text:
            return True
    return False


def is_repetitive(text: str) -> bool:
    """检查文本是否为水弹幕/重复无意义内容"""
    for pattern in WATER_PATTERNS:
        if re.match(pattern, text):
            return True
    # 检查单字符重复（如 "啊啊啊啊"）
    if len(set(text)) <= 2 and len(text) >= 3:
        return True
    return False


def infer_text_category(text: str) -> str:
    """基于关键词自动推断文本分类"""
    scores = {cat: 0 for cat in CATEGORY_KEYWORDS}
    for cat, keywords in CATEGORY_KEYWORDS.items():
        for kw in keywords:
            if kw in text:
                scores[cat] += 1
    
    max_cat = max(scores, key=scores.get)
    if scores[max_cat] > 0:
        return max_cat
    return 'reaction'  # 默认为reaction


def calculate_quality_score(text: str, like_count: int, source_type: str) -> int:
    """计算文本质量评分（1-5分）
    
    评分规则：
    - UP主字幕（AI字幕）直接高分，这是最核心的Reaction数据
    - 评论以点赞数为主权重
    - 弹幕按文本质量打分
    """
    score = 3.0  # 基础分
    
    # UP主字幕（AI字幕）直接高分
    if source_type == 'subtitle':
        score = 4.0
        if 3 <= len(text) <= 50:
            score += 1.0  # 合适长度加分
        return min(5, max(1, round(score)))
    
    # 点赞加分（评论）
    if like_count >= 100:
        score += 2.0
    elif like_count >= 50:
        score += 1.5
    elif like_count >= 20:
        score += 1.0
    elif like_count >= 5:
        score += 0.5
    
    # 文本质量加分
    if 5 <= len(text) <= 20:
        score += 0.5  # 弹幕最佳长度
    elif 3 <= len(text) <= 30:
        score += 0.3  # 次优长度
    
    if has_emotion_words(text):
        score += 0.5  # 含情感词
    
    # 扣分项
    if is_repetitive(text):
        score -= 2.0  # 重复内容大幅扣分
    
    return min(5, max(1, round(score)))


def run_auto_filter(db_path: str = DB_PATH, batch_size: int = 1000, 
                    min_score: int = 3, force: bool = False) -> Dict[str, int]:
    """执行自动质量筛选，将高质量数据从 raw_reactions 导入 quality_reactions
    
    Args:
        db_path: 数据库路径
        batch_size: 每批处理条数
        min_score: 最低入库评分（低于此分不入库）
        force: 是否强制重新筛选（清空quality_reactions后重新来）
        
    Returns:
        统计字典
    """
    if not os.path.exists(db_path):
        print(f"[ERROR] 数据库不存在: {db_path}")
        sys.exit(1)
    
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # 如果 force，先清空 quality_reactions
    if force:
        cursor.execute("DELETE FROM quality_reactions")
        conn.commit()
        print("[INFO] 已清空 quality_reactions 表")
    
    # 获取已处理的 raw_id 集合（避免重复处理）
    cursor.execute("SELECT raw_id FROM quality_reactions")
    processed_ids = set(row['raw_id'] for row in cursor.fetchall())
    
    # 获取所有未过滤的原始数据
    cursor.execute("""
        SELECT r.id, r.text, r.source_type, r.like_count, r.video_id, v.genre, v.bvid
        FROM raw_reactions r
        LEFT JOIN videos v ON r.video_id = v.id
        WHERE r.is_filtered = 0
        ORDER BY r.id
    """)
    
    rows = cursor.fetchall()
    total = len(rows)
    
    stats = {
        'total_processed': 0,
        'total_inserted': 0,
        'total_fewshot': 0,
        'skipped_processed': 0,
        'skipped_low_score': 0,
        'by_source': {},
        'by_category': {},
    }
    
    print(f"\n[AUTO-FILTER] 开始自动质量筛选")
    print(f"  待处理原始数据: {total} 条")
    print(f"  已处理（跳过）: {len(processed_ids)} 条")
    print(f"  最低入库评分: {min_score}")
    print()
    
    batch_count = 0
    
    for row in rows:
        raw_id = row['id']
        
        # 跳过已处理的
        if raw_id in processed_ids:
            stats['skipped_processed'] += 1
            continue
        
        text = row['text']
        source_type = row['source_type']
        like_count = row['like_count'] or 0
        genre = row['genre'] or '通用'
        
        # 计算质量评分
        quality_score = calculate_quality_score(text, like_count, source_type)
        
        # 低于最低分不入库
        if quality_score < min_score:
            stats['skipped_low_score'] += 1
            stats['total_processed'] += 1
            continue
        
        # 推断文本分类
        text_category = infer_text_category(text)
        
        # 判断平台（从extra_info中获取，或默认bilibili）
        platform = 'bilibili'  # 默认
        
        # 是否入选 few-shot（评分>=4自动入选）
        is_fewshot = 1 if quality_score >= 4 else 0
        
        # 插入 quality_reactions
        cursor.execute("""
            INSERT INTO quality_reactions (raw_id, text, platform, source_type, like_count, quality_score, text_category, is_fewshot, genre)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (raw_id, text, platform, source_type, like_count, quality_score, text_category, is_fewshot, genre))
        
        stats['total_inserted'] += 1
        if is_fewshot:
            stats['total_fewshot'] += 1
        
        # 统计
        stats['by_source'][source_type] = stats['by_source'].get(source_type, 0) + 1
        stats['by_category'][text_category] = stats['by_category'].get(text_category, 0) + 1
        
        stats['total_processed'] += 1
        batch_count += 1
        
        # 批量提交
        if batch_count >= batch_size:
            conn.commit()
            print(f"  [PROGRESS] 已处理 {stats['total_processed']}/{total}，入库 {stats['total_inserted']}")
            batch_count = 0
    
    # 最终提交
    conn.commit()
    conn.close()
    
    # 打印统计
    print(f"\n{'='*50}")
    print(f"  自动质量筛选完成")
    print(f"{'='*50}")
    print(f"  处理总数: {stats['total_processed']}")
    print(f"  入库总数: {stats['total_inserted']}")
    print(f"  Few-shot 入选: {stats['total_fewshot']}")
    print(f"  跳过（已处理）: {stats['skipped_processed']}")
    print(f"  跳过（低分）: {stats['skipped_low_score']}")
    print(f"\n  按来源分布:")
    for src, count in stats['by_source'].items():
        print(f"    {src}: {count}")
    print(f"\n  按分类分布:")
    for cat, count in stats['by_category'].items():
        print(f"    {cat}: {count}")
    print(f"{'='*50}")
    
    return stats


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='自动质量筛选工具（取代人工标注）')
    parser.add_argument('--min-score', type=int, default=3, help='最低入库评分（1-5，默认3）')
    parser.add_argument('--batch-size', type=int, default=1000, help='批量提交条数（默认1000）')
    parser.add_argument('--force', action='store_true', help='强制重新筛选（清空后重来）')
    parser.add_argument('--db', type=str, default=DB_PATH, help='数据库路径')
    
    args = parser.parse_args()
    
    run_auto_filter(
        db_path=args.db,
        batch_size=args.batch_size,
        min_score=args.min_score,
        force=args.force,
    )
