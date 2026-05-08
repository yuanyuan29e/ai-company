"""
微调数据集导出脚本（v2 自动化版本）
从 quality_reactions 表中读取自动筛选的高质量数据，
转换为混元模型微调所需的 JSONL 格式

输出格式（每行一个 JSON 对象）：
{
  "messages": [
    {"role": "system", "content": "你是...(角色设定)"},
    {"role": "user", "content": "描述当前画面场景"},
    {"role": "assistant", "content": "弹幕风格的 Reaction"}
  ]
}
"""

import os
import sys
import json
import sqlite3
import random
import argparse
from typing import List, Dict

# 数据库路径
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'database', 'reaction.db')

# 通用 Reaction 角色 system prompt（不再绑定固定人设，按text_category区分风格）
CATEGORY_PROMPTS = {
    'reaction': '你是一个追剧观众，正在观看视频并发出实时反应。你的回复是弹幕风格，15字以内，自然真实，有情感共鸣。',
    'analysis': '你是一个善于分析的追剧观众，擅长发现伏笔和细节。回复15字以内，弹幕风格，犀利有见地。',
    'emotion': '你是一个感性的追剧观众，容易被剧情打动。回复15字以内，弹幕风格，真情流露。',
    'humor': '你是一个爱吐槽的追剧观众，总能找到笑点。回复15字以内，弹幕风格，犀利幽默。',
}

# 根据剧集类型生成场景描述
GENRE_SCENE_TEMPLATES = {
    '古偶': [
        '当前正在播放古装甜宠剧，画面出现精彩场景',
        '古偶剧中男女主互动的高甜名场面',
        '古装剧出现关键剧情节点',
    ],
    '悬疑': [
        '悬疑剧中出现关键线索或反转',
        '烧脑剧情中一个可疑的细节',
        '悬疑剧高能片段正在上演',
    ],
    '喜剧': [
        '喜剧中出现搞笑名场面',
        '角色做出滑稽的举动',
        '情景喜剧中的经典桥段',
    ],
    '仙侠': [
        '仙侠剧中出现精彩打斗或仙术场景',
        '仙侠剧的虐心情节',
        '修仙/玄幻剧的关键剧情',
    ],
    '都市': [
        '都市剧中出现冲突或高潮',
        '职场/情感剧的关键转折',
        '现代剧中引发共鸣的场景',
    ],
    '通用': [
        '视频中正在播放精彩片段',
        '当前画面出现令人印象深刻的场景',
        '观看视频时出现高能画面',
    ],
}


def build_user_message(genre: str, text_category: str) -> str:
    """构建微调数据的 user 消息"""
    templates = GENRE_SCENE_TEMPLATES.get(genre, GENRE_SCENE_TEMPLATES['通用'])
    base = random.choice(templates)
    
    # 根据分类添加补充描述
    category_hints = {
        'reaction': '',
        'analysis': '，注意观察细节',
        'emotion': '，氛围感人',
        'humor': '，场景有趣',
    }
    hint = category_hints.get(text_category, '')
    return f"{base}{hint}"


def export_finetune(
    db_path: str = DB_PATH,
    quality_min: int = 3,
    output_path: str = None,
    max_samples: int = None,
    source_type: str = None,
    platform: str = None,
) -> int:
    """导出微调数据集
    
    Args:
        db_path: 数据库路径
        quality_min: 最低质量分
        output_path: 输出 JSONL 文件路径
        max_samples: 最大样本数
        source_type: 筛选来源类型
        platform: 筛选平台
        
    Returns:
        导出的数据条数
    """
    if not os.path.exists(db_path):
        print(f"[ERROR] 数据库不存在: {db_path}")
        sys.exit(1)
    
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    where_clauses = [f'quality_score >= {quality_min}']
    params = []
    
    if source_type:
        where_clauses.append('source_type = ?')
        params.append(source_type)
    if platform:
        where_clauses.append('platform = ?')
        params.append(platform)
    
    where_str = ' AND '.join(where_clauses)
    sql = f"SELECT * FROM quality_reactions WHERE {where_str} ORDER BY quality_score DESC, id DESC"
    
    if max_samples:
        sql += f" LIMIT {max_samples}"
    
    cursor.execute(sql, params)
    rows = cursor.fetchall()
    conn.close()
    
    if not rows:
        print("[WARN] 没有符合条件的数据")
        return 0
    
    if output_path is None:
        output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'output')
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, 'finetune_dataset.jsonl')
    else:
        os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else '.', exist_ok=True)
    
    count = 0
    with open(output_path, 'w', encoding='utf-8') as f:
        for row in rows:
            text = row['text']
            genre = row['genre']
            text_category = row['text_category'] or 'reaction'
            
            # 构建对话结构
            system_prompt = CATEGORY_PROMPTS.get(text_category, CATEGORY_PROMPTS['reaction'])
            user_message = build_user_message(genre, text_category)
            
            sample = {
                'messages': [
                    {'role': 'system', 'content': system_prompt},
                    {'role': 'user', 'content': user_message},
                    {'role': 'assistant', 'content': text},
                ]
            }
            
            f.write(json.dumps(sample, ensure_ascii=False) + '\n')
            count += 1
    
    print(f"[OK] 导出 {count} 条微调数据到: {output_path}")
    return count


def export_split(db_path: str = DB_PATH, quality_min: int = 3, train_ratio: float = 0.9):
    """导出并拆分为训练集/验证集"""
    if not os.path.exists(db_path):
        print(f"[ERROR] 数据库不存在: {db_path}")
        sys.exit(1)
    
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute(
        f"SELECT * FROM quality_reactions WHERE quality_score >= {quality_min} ORDER BY RANDOM()"
    )
    rows = cursor.fetchall()
    conn.close()
    
    if not rows:
        print("[WARN] 没有符合条件的数据")
        return
    
    # 拆分
    split_idx = int(len(rows) * train_ratio)
    train_rows = rows[:split_idx]
    val_rows = rows[split_idx:]
    
    output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'output')
    os.makedirs(output_dir, exist_ok=True)
    
    def write_jsonl(rows_subset, filepath):
        with open(filepath, 'w', encoding='utf-8') as f:
            for row in rows_subset:
                text_category = row['text_category'] or 'reaction'
                system_prompt = CATEGORY_PROMPTS.get(text_category, CATEGORY_PROMPTS['reaction'])
                user_message = build_user_message(row['genre'], text_category)
                
                sample = {
                    'messages': [
                        {'role': 'system', 'content': system_prompt},
                        {'role': 'user', 'content': user_message},
                        {'role': 'assistant', 'content': row['text']},
                    ]
                }
                f.write(json.dumps(sample, ensure_ascii=False) + '\n')
    
    train_path = os.path.join(output_dir, 'train.jsonl')
    val_path = os.path.join(output_dir, 'val.jsonl')
    
    write_jsonl(train_rows, train_path)
    write_jsonl(val_rows, val_path)
    
    print(f"[OK] 拆分完成：")
    print(f"  训练集: {len(train_rows)} 条 → {train_path}")
    print(f"  验证集: {len(val_rows)} 条 → {val_path}")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='导出微调数据集 (JSONL) - v2 自动化版本')
    parser.add_argument('--quality-min', type=int, default=3, help='最低质量分（默认3）')
    parser.add_argument('--output', '-o', type=str, help='输出文件路径')
    parser.add_argument('--max-samples', type=int, help='最大样本数')
    parser.add_argument('--source-type', type=str, help='筛选来源(subtitle/danmaku/comment)')
    parser.add_argument('--platform', type=str, help='筛选平台(bilibili/tencent/mgtv/iqiyi)')
    parser.add_argument('--split', action='store_true', help='拆分为训练集/验证集')
    parser.add_argument('--train-ratio', type=float, default=0.9, help='训练集比例（默认0.9）')
    
    args = parser.parse_args()
    
    print("=" * 50)
    print("  微调数据集导出工具（v2 自动化版本）")
    print("=" * 50)
    print()
    
    if args.split:
        export_split(quality_min=args.quality_min, train_ratio=args.train_ratio)
    else:
        export_finetune(
            quality_min=args.quality_min,
            output_path=args.output,
            max_samples=args.max_samples,
            source_type=args.source_type,
            platform=args.platform,
        )
