"""SQLite → PostgreSQL 数据迁移脚本。

使用方法：
  1. 先确保目标 PostgreSQL 数据库已创建且可连接
  2. 安装依赖：pip install psycopg2-binary
  3. 在服务器上执行：
     cd backend
     POSTGRES_URL="postgresql://用户名:密码@主机:5432/数据库名" python scripts/migrate_sqlite_to_postgres.py

注意事项：
  - 脚本会先在目标数据库中建表（如果不存在），然后逐表迁移数据
  - 迁移是幂等的：会先清空目标表再插入（TRUNCATE CASCADE）
  - 迁移完成后会自动修正 PostgreSQL 序列（auto-increment）的起始值
  - 支持 JSON 字段（SQLite 中存为 TEXT，PostgreSQL 中为 JSONB）
"""

import json
import os
import sqlite3
import sys

import psycopg2
import psycopg2.extras

# 迁移表顺序（按外键依赖排列，父表在前，子表在后）
TABLE_ORDER = [
    "users",
    "projects",
    "scenes",
    "characters",
    "character_views",
    "environments",
    "environment_images",
    "styles",
    "shots",
    "shot_images",
    "shot_videos",
    "shot_characters",
    "scripts",
    "generation_tasks",
    "system_settings",
]

# SQLite 数据库文件路径（相对于 backend/ 目录）
SQLITE_PATH = os.environ.get("SQLITE_PATH", "./ci_ai.db")
# PostgreSQL 连接串
POSTGRES_URL = os.environ.get("POSTGRES_URL", "")


def get_sqlite_connection(db_path: str) -> sqlite3.Connection:
    """获取 SQLite 连接。"""
    if not os.path.exists(db_path):
        print(f"❌ SQLite 文件不存在: {db_path}")
        sys.exit(1)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def get_postgres_connection(url: str):
    """获取 PostgreSQL 连接。"""
    try:
        conn = psycopg2.connect(url)
        conn.autocommit = False
        return conn
    except Exception as exc:
        print(f"❌ 无法连接 PostgreSQL: {exc}")
        sys.exit(1)


def get_table_columns(sqlite_conn: sqlite3.Connection, table_name: str) -> list[str]:
    """获取 SQLite 表的列名列表。"""
    cursor = sqlite_conn.execute(f"PRAGMA table_info({table_name})")
    return [row["name"] for row in cursor.fetchall()]


def table_exists_in_sqlite(sqlite_conn: sqlite3.Connection, table_name: str) -> bool:
    """检查 SQLite 中是否存在指定表。"""
    cursor = sqlite_conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (table_name,),
    )
    return cursor.fetchone() is not None


def get_row_count(sqlite_conn: sqlite3.Connection, table_name: str) -> int:
    """获取 SQLite 表的行数。"""
    cursor = sqlite_conn.execute(f"SELECT COUNT(*) as cnt FROM {table_name}")
    return cursor.fetchone()["cnt"]


def create_tables_in_postgres(postgres_conn):
    """在 PostgreSQL 中创建表结构（通过 SQLAlchemy metadata）。

    这里用同步方式调用 SQLAlchemy 建表，确保目标数据库表结构正确。
    """
    from sqlalchemy import create_engine
    from app.database import Base

    # 确保所有 model 被导入
    import app.models.user  # noqa: F401
    import app.models.project  # noqa: F401
    import app.models.scene  # noqa: F401
    import app.models.shot  # noqa: F401
    import app.models.shot_image  # noqa: F401
    import app.models.shot_video  # noqa: F401
    import app.models.shot_character  # noqa: F401
    import app.models.character  # noqa: F401
    import app.models.character_view  # noqa: F401
    import app.models.environment  # noqa: F401
    import app.models.environment_image  # noqa: F401
    import app.models.style  # noqa: F401
    import app.models.script  # noqa: F401
    import app.models.generation_task  # noqa: F401
    import app.models.system_settings  # noqa: F401

    sync_url = POSTGRES_URL
    engine = create_engine(sync_url)
    Base.metadata.create_all(engine)
    engine.dispose()
    print("✅ PostgreSQL 表结构已创建/确认")


def fix_sequences(postgres_conn):
    """修正 PostgreSQL 序列值，确保 auto-increment 从最大 ID + 1 开始。

    兼容两种序列类型：
    - SERIAL 列：通过 pg_get_serial_sequence 获取
    - IDENTITY 列：通过 pg_sequences + information_schema 获取
    """
    cursor = postgres_conn.cursor()
    fixed_count = 0

    # 方式一：查询 SERIAL 列关联的序列
    cursor.execute("""
        SELECT t.relname AS table_name,
               a.attname AS column_name,
               pg_get_serial_sequence(t.relname::text, a.attname::text) AS seq_name
        FROM pg_class t
        JOIN pg_attribute a ON a.attrelid = t.oid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE t.relkind = 'r'
          AND n.nspname = 'public'
          AND a.attnum > 0
          AND NOT a.attisdropped
          AND pg_get_serial_sequence(t.relname::text, a.attname::text) IS NOT NULL
    """)
    serial_sequences = cursor.fetchall()

    for table_name, column_name, seq_name in serial_sequences:
        cursor.execute(f'SELECT COALESCE(MAX("{column_name}"), 0) + 1 FROM "{table_name}"')
        next_val = cursor.fetchone()[0]
        cursor.execute(f"SELECT setval('{seq_name}', {next_val}, false)")
        print(f"  🔧 序列 {seq_name} → 下一个值 = {next_val}")
        fixed_count += 1

    # 方式二：查询 IDENTITY 列关联的序列（SQLAlchemy 2.x 在 PostgreSQL 上默认用 IDENTITY）
    cursor.execute("""
        SELECT c.table_name, c.column_name,
               pg_get_serial_sequence(c.table_name, c.column_name) AS seq_name
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.is_identity = 'YES'
          AND pg_get_serial_sequence(c.table_name, c.column_name) IS NOT NULL
    """)
    identity_sequences = cursor.fetchall()

    for table_name, column_name, seq_name in identity_sequences:
        # 避免重复处理（可能已经被方式一处理过）
        if any(s[2] == seq_name for s in serial_sequences):
            continue
        cursor.execute(f'SELECT COALESCE(MAX("{column_name}"), 0) + 1 FROM "{table_name}"')
        next_val = cursor.fetchone()[0]
        cursor.execute(f"SELECT setval('{seq_name}', {next_val}, false)")
        print(f"  🔧 序列 {seq_name} (identity) → 下一个值 = {next_val}")
        fixed_count += 1

    if fixed_count == 0:
        print("  ⚠️  未找到需要修正的序列（可能表中无自增列或命名不匹配）")

    postgres_conn.commit()
    print("✅ 所有序列已修正")


def migrate_table(
    sqlite_conn: sqlite3.Connection,
    postgres_conn,
    table_name: str,
):
    """迁移单张表的数据。"""
    if not table_exists_in_sqlite(sqlite_conn, table_name):
        print(f"  ⏭️  表 {table_name} 在 SQLite 中不存在，跳过")
        return

    row_count = get_row_count(sqlite_conn, table_name)
    if row_count == 0:
        print(f"  ⏭️  表 {table_name} 无数据，跳过")
        return

    columns = get_table_columns(sqlite_conn, table_name)
    print(f"  📦 迁移 {table_name}: {row_count} 行, {len(columns)} 列")

    # 从 SQLite 读取所有数据
    cursor = sqlite_conn.execute(f"SELECT * FROM {table_name}")
    rows = cursor.fetchall()

    # 清空目标表
    pg_cursor = postgres_conn.cursor()
    pg_cursor.execute(f'TRUNCATE TABLE "{table_name}" CASCADE')

    # 批量插入（列名加引号避免保留字冲突）
    col_names = ", ".join(f'"{col}"' for col in columns)
    placeholders = ", ".join(["%s"] * len(columns))
    insert_sql = f'INSERT INTO "{table_name}" ({col_names}) VALUES ({placeholders})'

    batch_size = 500
    inserted = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        values = []
        for row in batch:
            row_values = []
            for col in columns:
                value = row[col]
                # JSON 字段处理：SQLite 中存为 TEXT 字符串，PostgreSQL 需要传 dict/list
                if isinstance(value, str) and value.startswith(("{", "[")):
                    try:
                        value = json.loads(value)
                        # psycopg2 需要用 Json 包装
                        value = psycopg2.extras.Json(value)
                    except (json.JSONDecodeError, ValueError):
                        pass
                row_values.append(value)
            values.append(tuple(row_values))

        pg_cursor.executemany(insert_sql, values)
        inserted += len(batch)

    postgres_conn.commit()
    print(f"    ✅ 已插入 {inserted} 行")


def main():
    if not POSTGRES_URL:
        print("❌ 请设置环境变量 POSTGRES_URL")
        print('   示例: POSTGRES_URL="postgresql://user:pass@host:5432/dbname" python scripts/migrate_sqlite_to_postgres.py')
        sys.exit(1)

    print("=" * 60)
    print("  SQLite → PostgreSQL 数据迁移工具")
    print("=" * 60)
    print(f"\n  源数据库: {SQLITE_PATH}")
    print(f"  目标数据库: {POSTGRES_URL.split('@')[1] if '@' in POSTGRES_URL else POSTGRES_URL}")
    print()

    # 1. 连接数据库
    sqlite_conn = get_sqlite_connection(SQLITE_PATH)
    postgres_conn = get_postgres_connection(POSTGRES_URL)
    print("✅ 数据库连接成功\n")

    # 2. 在 PostgreSQL 中建表
    print("📋 步骤 1: 创建表结构...")
    create_tables_in_postgres(postgres_conn)
    print()

    # 3. 逐表迁移数据（禁用外键约束，避免插入顺序问题）
    print("📋 步骤 2: 迁移数据...")
    pg_cursor = postgres_conn.cursor()
    # 禁用所有触发器（包括外键约束检查）
    pg_cursor.execute("SET session_replication_role = 'replica';")
    postgres_conn.commit()
    print("  🔓 已暂时禁用外键约束")

    for table_name in TABLE_ORDER:
        migrate_table(sqlite_conn, postgres_conn, table_name)

    # 恢复外键约束检查
    pg_cursor.execute("SET session_replication_role = 'origin';")
    postgres_conn.commit()
    print("  🔒 已恢复外键约束")
    print()

    # 4. 修正序列
    print("📋 步骤 3: 修正自增序列...")
    fix_sequences(postgres_conn)
    print()

    # 5. 收尾
    sqlite_conn.close()
    postgres_conn.close()

    print("=" * 60)
    print("  🎉 数据迁移完成！")
    print("=" * 60)
    print()
    print("后续操作：")
    print("  1. 修改 backend/.env 中的 DATABASE_URL：")
    print(f'     DATABASE_URL=postgresql+asyncpg://...')
    print("  2. 确保已安装 asyncpg 和 psycopg2-binary：")
    print("     pip install asyncpg psycopg2-binary")
    print("  3. 重启应用服务")
    print()


if __name__ == "__main__":
    # 确保能导入 app 模块
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    main()
