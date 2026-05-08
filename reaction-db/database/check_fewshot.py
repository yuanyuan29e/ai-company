import sqlite3

conn = sqlite3.connect('reaction.db')
cur = conn.cursor()

print("=== 弹幕类型的 few-shot (quality_score>=4) ===")
cur.execute("""
    SELECT text, quality_score, text_category, genre 
    FROM quality_reactions 
    WHERE is_fewshot = 1 AND source_type = 'danmaku' AND quality_score >= 4
    ORDER BY quality_score DESC 
    LIMIT 20
""")
for r in cur.fetchall():
    print(f"  [{r[1]}分][{r[2]}][{r[3]}] {r[0]}")

print("\n=== 评论类型的 few-shot (quality_score>=4) ===")
cur.execute("""
    SELECT text, quality_score, text_category, genre 
    FROM quality_reactions 
    WHERE is_fewshot = 1 AND source_type = 'comment' AND quality_score >= 4
    ORDER BY quality_score DESC 
    LIMIT 10
""")
for r in cur.fetchall():
    print(f"  [{r[1]}分][{r[2]}][{r[3]}] {r[0]}")

print("\n=== 统计 source_type 分布 ===")
cur.execute("""
    SELECT source_type, COUNT(*) 
    FROM quality_reactions 
    WHERE is_fewshot = 1 
    GROUP BY source_type
""")
for r in cur.fetchall():
    print(f"  {r[0]}: {r[1]}")

print("\n=== 字幕类的 few-shot 示例 ===")
cur.execute("""
    SELECT text, quality_score, text_category 
    FROM quality_reactions 
    WHERE is_fewshot = 1 AND source_type = 'subtitle'
    ORDER BY quality_score DESC 
    LIMIT 10
""")
for r in cur.fetchall():
    print(f"  [{r[1]}分][{r[2]}] {r[0]}")

conn.close()
