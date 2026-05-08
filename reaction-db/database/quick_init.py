"""非交互式数据库初始化"""
import sqlite3
import os

DB_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(DB_DIR, 'reaction.db')
SCHEMA_PATH = os.path.join(DB_DIR, 'schema.sql')

# 如果已存在则先删除
if os.path.exists(DB_PATH):
    os.remove(DB_PATH)
    print("[INFO] 已删除旧数据库")

# 读取 schema
with open(SCHEMA_PATH, 'r', encoding='utf-8') as f:
    schema_sql = f.read()

# 创建数据库
conn = sqlite3.connect(DB_PATH)
conn.executescript(schema_sql)
conn.close()

print(f"[OK] 数据库初始化成功: {DB_PATH}")

# 验证
conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
tables = [t[0] for t in cur.fetchall()]
print(f"[INFO] 已创建的表: {tables}")
conn.close()
print("[DONE] 可以开始爬取了！")
