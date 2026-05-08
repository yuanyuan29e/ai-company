"""
增强版微调数据集导出脚本（v3）
在 v2 基础上增加三大改进：
1. 融入剧本上下文（sceneHint + characterMood + keyDialogues）作为 user 输入
2. 加入人物鉴别条件，教会模型只在有人物时输出
3. 生成负样本（[SKIP]），教会模型在空镜/纯风景时不输出

输出格式（每行一个 JSON 对象）：
{
  "messages": [
    {"role": "system", "content": "角色设定 + 输出规则"},
    {"role": "user", "content": "剧情上下文 + 人物信息 + 场景描述"},
    {"role": "assistant", "content": "15字以内弹幕 或 [SKIP]"}
  ]
}

使用方式：
  python export_finetune_enhanced.py                        # 默认导出
  python export_finetune_enhanced.py --split                # 拆分为训练/验证集
  python export_finetune_enhanced.py --quality-min 4        # 高质量数据
  python export_finetune_enhanced.py --with-skip-ratio 0.2  # 20%负样本
  python export_finetune_enhanced.py --persona empath       # 指定人格
"""

import os
import sys
import json
import sqlite3
import random
import argparse
from typing import List, Dict, Optional

# 数据库路径
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'database', 'reaction.db')

# 剧本数据路径
EPISODE_DATA_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    '..', 'server', 'src', 'data', 'episodes'
)

# ============ 人格化 System Prompts ============

PERSONA_SYSTEM_PROMPTS = {
    'empath': """你是"糖糖"，一个软萌感性的追剧搭子。你容易被剧情打动，嗑糖尖叫、虐心安慰都是你的强项。
你的输出必须是弹幕风格，15字以内，口语化，有情绪。
当画面中没有人物（纯风景/空镜/特效过渡）时，直接输出 [SKIP]。
当画面中有人物但没什么值得反应的内容时，也输出 [SKIP]。""",

    'explorer': """你是"阿探"，一个细节控侦探搭子。你善于发现伏笔、暗示和剧情线索。
你的输出必须是弹幕风格，15字以内，口语化，有见地。
当画面中没有人物（纯风景/空镜/特效过渡）时，直接输出 [SKIP]。
当画面中有人物但没什么值得反应的内容时，也输出 [SKIP]。""",

    'director': """你是"戏骨哥"，一个懂行的剧评搭子。你关注演技、镜头语言和制作质感。
你的输出必须是弹幕风格，15字以内，口语化，有专业感。
当画面中没有人物（纯风景/空镜/特效过渡）时，直接输出 [SKIP]。
当画面中有人物但没什么值得反应的内容时，也输出 [SKIP]。""",

    'roaster': """你是"乐子人"，一个快乐吐槽搭子。你总能找到笑点和槽点。
你的输出必须是弹幕风格，15字以内，口语化，犀利幽默。
当画面中没有人物（纯风景/空镜/特效过渡）时，直接输出 [SKIP]。
当画面中有人物但没什么值得反应的内容时，也输出 [SKIP]。""",

    'timekeeper': """你是"小理"，一个剧情整理搭子。你善于梳理时间线、人物关系和剧情脉络。
你的输出必须是弹幕风格，15字以内，口语化，有条理。
当画面中没有人物（纯风景/空镜/特效过渡）时，直接输出 [SKIP]。
当画面中有人物但没什么值得反应的内容时，也输出 [SKIP]。""",
}

# text_category 到 persona 的映射
CATEGORY_TO_PERSONA = {
    'emotion': 'empath',
    'analysis': 'explorer',
    'reaction': 'director',
    'humor': 'roaster',
}

# ============ 空镜/无人物场景描述模板（用于生成负样本） ============

EMPTY_SCENE_TEMPLATES = [
    # 仙侠类空镜
    "【画面描述】云雾缭绕的仙山全景，没有人物出现。远处有古建筑群。\n【人物】无",
    "【画面描述】瀑布从悬崖倾泻而下，周围是茂密的竹林。纯风景镜头。\n【人物】无",
    "【画面描述】金色光芒笼罩的天空，仙鹤飞过，远山如黛。\n【人物】无",
    "【画面描述】一座古老的石桥横跨深涧，桥下是万丈深渊。空镜。\n【人物】无",
    "【画面描述】夜空中繁星点点，一轮明月挂在天际。纯景色过渡镜头。\n【人物】无",
    "【画面描述】仙境中的桃花林，花瓣飘落。没有人物。\n【人物】无",
    "【画面描述】古老的建筑群远景，晨雾中若隐若现。纯环境交代。\n【人物】无",
    "【画面描述】法阵光芒特效正在消散，天空出现奇异天象。特效过渡画面。\n【人物】无",
    "【画面描述】秋日的红枫林中一条蜿蜒的小路，落叶纷飞。\n【人物】无",
    "【画面描述】暴风雨中的大海，雷电交加。纯自然景观。\n【人物】无",
    # 都市类空镜
    "【画面描述】城市夜景航拍，高楼大厦灯火通明。\n【人物】无",
    "【画面描述】清晨阳光照射在空旷的办公室里。环境镜头。\n【人物】无",
    # 通用过渡
    "【画面描述】片头字幕/标题画面。\n【人物】无",
    "【画面描述】场景切换的黑屏过渡。\n【人物】无",
    "【画面描述】一段文字说明出现在画面上。\n【人物】无",
]


def load_episode_data() -> List[Dict]:
    """加载所有剧本节点数据"""
    nodes = []
    if not os.path.exists(EPISODE_DATA_DIR):
        print(f"[WARN] 剧本数据目录不存在: {EPISODE_DATA_DIR}")
        return nodes

    for filename in os.listdir(EPISODE_DATA_DIR):
        if filename.endswith('.json'):
            filepath = os.path.join(EPISODE_DATA_DIR, filename)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    episode_info = {
                        'episodeId': data.get('episodeId', ''),
                        'title': data.get('title', ''),
                        'seriesName': data.get('seriesName', ''),
                        'worldSetting': data.get('worldSetting', ''),
                        'mainCharacters': data.get('mainCharacters', {}),
                    }
                    for node in data.get('nodes', []):
                        node['_episode'] = episode_info
                        nodes.append(node)
            except Exception as e:
                print(f"[WARN] 加载剧本失败 {filename}: {e}")

    print(f"[INFO] 加载了 {len(nodes)} 个剧本场景节点")
    return nodes


def build_enhanced_user_message(
    genre: str,
    text_category: str,
    scene_node: Optional[Dict] = None
) -> str:
    """构建增强版 user 消息（融入剧本上下文）"""

    if scene_node:
        # 使用真实剧本节点构建上下文
        parts = []

        # 剧情进度
        plot_summary = scene_node.get('plotSummaryUntilNow', '')
        if plot_summary:
            parts.append(f"【剧情进度】{plot_summary}")

        # 当前场景
        scene_hint = scene_node.get('sceneHint', '')
        if scene_hint:
            parts.append(f"【画面描述】{scene_hint}")

        # 出场人物
        characters = scene_node.get('characters', [])
        if characters:
            parts.append(f"【人物】{'、'.join(characters)}")
        else:
            parts.append("【人物】无")

        # 角色情绪
        mood = scene_node.get('characterMood', '')
        if mood:
            parts.append(f"【情绪】{mood}")

        # 关键台词
        dialogues = scene_node.get('keyDialogues', [])
        if dialogues:
            dial_text = ' / '.join(dialogues[:3])  # 最多3句
            parts.append(f"【台词】{dial_text}")

        return '\n'.join(parts)

    else:
        # 无剧本节点时，使用通用模板（兼容旧逻辑）
        genre_templates = {
            '仙侠': [
                "【画面描述】仙侠剧中角色互动的场景\n【人物】有角色出镜",
                "【画面描述】修仙世界中的关键剧情画面\n【人物】有角色出镜",
            ],
            '古偶': [
                "【画面描述】古装剧中男女主互动的场景\n【人物】有角色出镜",
                "【画面描述】古偶剧中出现情感高潮\n【人物】有角色出镜",
            ],
            '悬疑': [
                "【画面描述】悬疑剧中出现关键线索\n【人物】有角色出镜",
            ],
            '喜剧': [
                "【画面描述】喜剧中出现搞笑场面\n【人物】有角色出镜",
            ],
            '都市': [
                "【画面描述】都市剧中出现冲突或高潮\n【人物】有角色出镜",
            ],
        }
        templates = genre_templates.get(genre, ["【画面描述】视频中出现精彩场景\n【人物】有角色出镜"])
        return random.choice(templates)


def build_skip_user_message() -> str:
    """构建需要输出 [SKIP] 的 user 消息（负样本）"""
    return random.choice(EMPTY_SCENE_TEMPLATES)


def get_persona_prompt(text_category: str, persona: Optional[str] = None) -> str:
    """获取人格化 system prompt"""
    if persona and persona in PERSONA_SYSTEM_PROMPTS:
        return PERSONA_SYSTEM_PROMPTS[persona]

    # 根据 text_category 推断 persona
    mapped_persona = CATEGORY_TO_PERSONA.get(text_category, 'empath')
    return PERSONA_SYSTEM_PROMPTS[mapped_persona]


def export_enhanced_finetune(
    db_path: str = DB_PATH,
    quality_min: int = 3,
    output_path: str = None,
    max_samples: int = None,
    source_type: str = None,
    platform: str = None,
    persona: str = None,
    skip_ratio: float = 0.15,
) -> int:
    """导出增强版微调数据集

    Args:
        db_path: 数据库路径
        quality_min: 最低质量分
        output_path: 输出 JSONL 文件路径
        max_samples: 最大样本数
        source_type: 筛选来源类型
        platform: 筛选平台
        persona: 指定人格（不指定则根据 text_category 自动分配）
        skip_ratio: 负样本（[SKIP]）在总数据中的比例（默认15%）

    Returns:
        导出的数据条数
    """
    if not os.path.exists(db_path):
        print(f"[ERROR] 数据库不存在: {db_path}")
        sys.exit(1)

    # 加载剧本数据
    scene_nodes = load_episode_data()

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
        output_path = os.path.join(output_dir, 'finetune_enhanced.jsonl')
    else:
        os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else '.', exist_ok=True)

    # 计算负样本数量
    num_positive = len(rows)
    num_skip = int(num_positive * skip_ratio / (1 - skip_ratio))

    print(f"[INFO] 正样本: {num_positive} 条, 负样本([SKIP]): {num_skip} 条")
    print(f"[INFO] 总计: {num_positive + num_skip} 条, 负样本占比: {skip_ratio:.1%}")

    count = 0
    samples = []

    # ===== 正样本：高质量 Reaction =====
    for row in rows:
        text = row['text']
        genre = row['genre'] or '通用'
        text_category = row['text_category'] or 'reaction'

        # 随机选择一个剧本节点作为上下文（增加多样性）
        scene_node = random.choice(scene_nodes) if scene_nodes else None

        system_prompt = get_persona_prompt(text_category, persona)
        user_message = build_enhanced_user_message(genre, text_category, scene_node)

        sample = {
            'messages': [
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': user_message},
                {'role': 'assistant', 'content': text},
            ]
        }
        samples.append(sample)
        count += 1

    # ===== 负样本：[SKIP]（无人物/不值得反应） =====
    for _ in range(num_skip):
        # 随机选一个 persona
        p = persona if persona else random.choice(list(PERSONA_SYSTEM_PROMPTS.keys()))
        system_prompt = PERSONA_SYSTEM_PROMPTS[p]
        user_message = build_skip_user_message()

        sample = {
            'messages': [
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': user_message},
                {'role': 'assistant', 'content': '[SKIP]'},
            ]
        }
        samples.append(sample)
        count += 1

    # 打乱顺序
    random.shuffle(samples)

    # 写入文件
    with open(output_path, 'w', encoding='utf-8') as f:
        for sample in samples:
            f.write(json.dumps(sample, ensure_ascii=False) + '\n')

    print(f"[OK] 导出 {count} 条增强微调数据到: {output_path}")
    return count


def export_enhanced_split(
    db_path: str = DB_PATH,
    quality_min: int = 3,
    train_ratio: float = 0.9,
    persona: str = None,
    skip_ratio: float = 0.15,
):
    """导出并拆分为训练集/验证集"""
    if not os.path.exists(db_path):
        print(f"[ERROR] 数据库不存在: {db_path}")
        sys.exit(1)

    # 加载剧本数据
    scene_nodes = load_episode_data()

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

    # 构建所有样本
    all_samples = []

    # 正样本
    for row in rows:
        text = row['text']
        genre = row['genre'] or '通用'
        text_category = row['text_category'] or 'reaction'

        scene_node = random.choice(scene_nodes) if scene_nodes else None
        system_prompt = get_persona_prompt(text_category, persona)
        user_message = build_enhanced_user_message(genre, text_category, scene_node)

        all_samples.append({
            'messages': [
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': user_message},
                {'role': 'assistant', 'content': text},
            ]
        })

    # 负样本
    num_skip = int(len(rows) * skip_ratio / (1 - skip_ratio))
    for _ in range(num_skip):
        p = persona if persona else random.choice(list(PERSONA_SYSTEM_PROMPTS.keys()))
        system_prompt = PERSONA_SYSTEM_PROMPTS[p]
        user_message = build_skip_user_message()

        all_samples.append({
            'messages': [
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': user_message},
                {'role': 'assistant', 'content': '[SKIP]'},
            ]
        })

    # 打乱并拆分
    random.shuffle(all_samples)
    split_idx = int(len(all_samples) * train_ratio)
    train_samples = all_samples[:split_idx]
    val_samples = all_samples[split_idx:]

    output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'output')
    os.makedirs(output_dir, exist_ok=True)

    train_path = os.path.join(output_dir, 'train_enhanced.jsonl')
    val_path = os.path.join(output_dir, 'val_enhanced.jsonl')

    for samples, filepath in [(train_samples, train_path), (val_samples, val_path)]:
        with open(filepath, 'w', encoding='utf-8') as f:
            for sample in samples:
                f.write(json.dumps(sample, ensure_ascii=False) + '\n')

    print(f"[OK] 拆分完成：")
    print(f"  训练集: {len(train_samples)} 条 → {train_path}")
    print(f"  验证集: {len(val_samples)} 条 → {val_path}")
    print(f"  正样本: {len(rows)} 条 | 负样本([SKIP]): {num_skip} 条")


def preview_samples(db_path: str = DB_PATH, num: int = 5, persona: str = None):
    """预览几条生成的样本，方便检查质量"""
    scene_nodes = load_episode_data()

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM quality_reactions WHERE quality_score >= 4 ORDER BY RANDOM() LIMIT ?", [num])
    rows = cursor.fetchall()
    conn.close()

    print("\n" + "=" * 60)
    print("  📋 正样本预览（有人物，应输出弹幕）")
    print("=" * 60)

    for i, row in enumerate(rows, 1):
        text_category = row['text_category'] or 'reaction'
        scene_node = random.choice(scene_nodes) if scene_nodes else None
        system_prompt = get_persona_prompt(text_category, persona)
        user_message = build_enhanced_user_message(row['genre'] or '通用', text_category, scene_node)

        print(f"\n--- 样本 {i} ---")
        print(f"[System] {system_prompt[:80]}...")
        print(f"[User]\n{user_message}")
        print(f"[Assistant] {row['text']}")

    print("\n" + "=" * 60)
    print("  📋 负样本预览（无人物，应输出 [SKIP]）")
    print("=" * 60)

    for i in range(min(3, num)):
        p = persona if persona else random.choice(list(PERSONA_SYSTEM_PROMPTS.keys()))
        system_prompt = PERSONA_SYSTEM_PROMPTS[p]
        user_message = build_skip_user_message()

        print(f"\n--- 负样本 {i+1} ---")
        print(f"[System] {system_prompt[:80]}...")
        print(f"[User]\n{user_message}")
        print(f"[Assistant] [SKIP]")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='增强版微调数据集导出工具 (v3)')
    parser.add_argument('--quality-min', type=int, default=3, help='最低质量分（默认3）')
    parser.add_argument('--output', '-o', type=str, help='输出文件路径')
    parser.add_argument('--max-samples', type=int, help='最大样本数')
    parser.add_argument('--source-type', type=str, help='筛选来源(subtitle/danmaku/comment)')
    parser.add_argument('--platform', type=str, help='筛选平台(bilibili/tencent/mgtv/iqiyi)')
    parser.add_argument('--persona', type=str, choices=['empath', 'explorer', 'director', 'roaster', 'timekeeper'],
                        help='指定人格（不指定则自动分配）')
    parser.add_argument('--with-skip-ratio', type=float, default=0.15,
                        help='负样本([SKIP])占比（默认0.15，即15%%）')
    parser.add_argument('--split', action='store_true', help='拆分为训练集/验证集')
    parser.add_argument('--train-ratio', type=float, default=0.9, help='训练集比例（默认0.9）')
    parser.add_argument('--preview', action='store_true', help='预览生成样本（不导出）')
    parser.add_argument('--preview-num', type=int, default=5, help='预览条数')

    args = parser.parse_args()

    print("=" * 60)
    print("  🚀 增强版微调数据集导出工具（v3）")
    print("     融合：剧本上下文 + 人物鉴别 + 负样本训练")
    print("=" * 60)
    print()

    if args.preview:
        preview_samples(num=args.preview_num, persona=args.persona)
    elif args.split:
        export_enhanced_split(
            quality_min=args.quality_min,
            train_ratio=args.train_ratio,
            persona=args.persona,
            skip_ratio=args.with_skip_ratio,
        )
    else:
        export_enhanced_finetune(
            quality_min=args.quality_min,
            output_path=args.output,
            max_samples=args.max_samples,
            source_type=args.source_type,
            platform=args.platform,
            persona=args.persona,
            skip_ratio=args.with_skip_ratio,
        )
