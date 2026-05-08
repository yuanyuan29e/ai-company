"""
Few-shot 数据集导出脚本（v2 自动化版本）
从 quality_reactions 表中筛选高质量 Reaction（自动评分），
输出为 JSON 格式，供 reactionDb.ts 服务层使用
"""

import os
import sys
import json
import sqlite3
import argparse
from typing import List, Dict

# 数据库路径
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'database', 'reaction.db')


def export_fewshot(
    db_path: str = DB_PATH,
    genre: str = None,
    text_category: str = None,
    source_type: str = None,
    platform: str = None,
    quality_min: int = 4,
    output_path: str = None
) -> List[Dict]:
    """导出 few-shot 示例数据（从自动筛选结果）
    
    Args:
        db_path: 数据库路径
        genre: 筛选剧集类型（可选）
        text_category: 筛选文本分类（可选）
        source_type: 筛选来源类型（可选）
        platform: 筛选平台（可选）
        quality_min: 最低质量分
        output_path: 输出文件路径（可选）
        
    Returns:
        导出的数据列表
    """
    if not os.path.exists(db_path):
        print(f"[ERROR] 数据库不存在: {db_path}")
        sys.exit(1)
    
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # 构建查询
    where_clauses = ['is_fewshot = 1', f'quality_score >= {quality_min}']
    params = []
    
    if genre:
        where_clauses.append('genre = ?')
        params.append(genre)
    if text_category:
        where_clauses.append('text_category = ?')
        params.append(text_category)
    if source_type:
        where_clauses.append('source_type = ?')
        params.append(source_type)
    if platform:
        where_clauses.append('platform = ?')
        params.append(platform)
    
    where_str = ' AND '.join(where_clauses)
    sql = f"SELECT * FROM quality_reactions WHERE {where_str} ORDER BY quality_score DESC, id DESC"
    
    cursor.execute(sql, params)
    rows = cursor.fetchall()
    conn.close()
    
    # 转换为导出格式
    data = []
    for row in rows:
        item = {
            'text': row['text'],
            'source_type': row['source_type'],
            'platform': row['platform'],
            'genre': row['genre'],
            'text_category': row['text_category'],
            'quality_score': row['quality_score'],
            'like_count': row['like_count'],
        }
        data.append(item)
    
    # 输出
    result = {
        'version': '2.0',
        'type': 'fewshot_auto',
        'count': len(data),
        'filters': {
            'genre': genre,
            'text_category': text_category,
            'source_type': source_type,
            'platform': platform,
            'quality_min': quality_min,
        },
        'data': data,
    }
    
    if output_path:
        os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else '.', exist_ok=True)
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"[OK] 导出 {len(data)} 条 few-shot 数据到: {output_path}")
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    
    return data


def export_by_genre(db_path: str = DB_PATH, output_dir: str = None):
    """按剧集类型分别导出 few-shot 集"""
    genres = ['古偶', '悬疑', '喜剧', '仙侠', '都市', '通用']
    
    if output_dir is None:
        output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'output')
    
    os.makedirs(output_dir, exist_ok=True)
    
    total = 0
    for genre in genres:
        output_path = os.path.join(output_dir, f'fewshot_{genre}.json')
        data = export_fewshot(db_path, genre=genre, output_path=output_path)
        total += len(data)
    
    # 额外导出一个全量（不限genre）
    output_path = os.path.join(output_dir, 'fewshot_all.json')
    data = export_fewshot(db_path, output_path=output_path)
    total += len(data)
    
    print(f"\n[DONE] 共导出 {total} 条数据")
    print(f"输出目录: {output_dir}")


def export_by_source(db_path: str = DB_PATH, output_dir: str = None):
    """按来源类型分别导出（subtitle优先）"""
    sources = ['subtitle', 'danmaku', 'comment']
    
    if output_dir is None:
        output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'output')
    
    os.makedirs(output_dir, exist_ok=True)
    
    total = 0
    for source in sources:
        output_path = os.path.join(output_dir, f'fewshot_{source}.json')
        data = export_fewshot(db_path, source_type=source, output_path=output_path)
        total += len(data)
    
    print(f"\n[DONE] 共导出 {total} 条数据，按来源分为 {len(sources)} 个文件")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='导出 Few-shot 示例数据（自动化版本）')
    parser.add_argument('--genre', type=str, help='筛选剧集类型')
    parser.add_argument('--category', type=str, help='筛选文本分类(reaction/analysis/emotion/humor)')
    parser.add_argument('--source-type', type=str, help='筛选来源类型(subtitle/danmaku/comment)')
    parser.add_argument('--platform', type=str, help='筛选平台(bilibili/tencent/mgtv/iqiyi)')
    parser.add_argument('--quality-min', type=int, default=4, help='最低质量分（默认4）')
    parser.add_argument('--output', '-o', type=str, help='输出文件路径')
    parser.add_argument('--by-genre', action='store_true', help='按剧集类型分别导出')
    parser.add_argument('--by-source', action='store_true', help='按来源类型分别导出')
    parser.add_argument('--output-dir', type=str, help='分类导出时的输出目录')
    
    args = parser.parse_args()
    
    print("=" * 50)
    print("  Few-shot 数据导出工具（v2 自动化）")
    print("=" * 50)
    print()
    
    if args.by_genre:
        export_by_genre(output_dir=args.output_dir)
    elif args.by_source:
        export_by_source(output_dir=args.output_dir)
    else:
        export_fewshot(
            genre=args.genre,
            text_category=args.category,
            source_type=args.source_type,
            platform=args.platform,
            quality_min=args.quality_min,
            output_path=args.output,
        )
