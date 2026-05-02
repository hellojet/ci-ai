"""把数据库里残留的 http://<qiniu_domain>/... URL 统一升级成 https://。

为什么需要：
- 七牛返回 URL 以前用的是 http，现代浏览器在 https 前端下会直接拦截 mixed content。
- 新上传已经改成 https（见 app/services/qiniu_storage.py），老数据需要手工刷一遍。

涉及表：characters.seed_image_url、styles.reference_image_url、character_views.image_url、
environment_images.image_url、shot_images.image_url、shot_videos.video_url、shots.video_url。
"""

import asyncio
import logging

from sqlalchemy import text

from app.config import get_settings
from app.database import async_session as async_session_maker

logger = logging.getLogger(__name__)

# 需要迁移的 (table, column)
TARGETS = [
    ("characters", "seed_image_url"),
    ("styles", "reference_image_url"),
    ("character_views", "image_url"),
    ("environment_images", "image_url"),
    ("shot_images", "image_url"),
    ("shot_videos", "video_url"),
    ("shots", "video_url"),
]


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    settings = get_settings()
    domain = settings.qiniu_domain
    if not domain:
        logger.warning("QINIU_DOMAIN 未配置，跳过迁移。")
        return

    # 注意：之前曾经错误地把 http 全部刷成 https，导致 te6l2pna9.hd-bkt.clouddn.com 这种
    # 七牛默认域名因 SSL 证书 CN 不匹配直接访问失败。这里保留脚本入口但实际方向改为 https → http，
    # 作为"回滚"使用。如果将来你绑定了自有域名 + 证书，再把方向反过来即可。
    http_prefix = f"https://{domain}/"
    https_prefix = f"http://{domain}/"

    async with async_session_maker() as session:
        total = 0
        for table, column in TARGETS:
            try:
                # SQLite 语法：REPLACE(col, 'http://xxx/', 'https://xxx/')
                sql = text(
                    f"UPDATE {table} SET {column} = REPLACE({column}, :http, :https) "
                    f"WHERE {column} LIKE :like_pat"
                )
                result = await session.execute(
                    sql, {"http": http_prefix, "https": https_prefix, "like_pat": f"{http_prefix}%"}
                )
                count = result.rowcount or 0
                total += count
                logger.info("表 %s.%s 迁移 %d 行", table, column, count)
            except Exception as exc:
                logger.warning("表 %s.%s 迁移失败（可能表不存在）：%s", table, column, exc)
        await session.commit()
        logger.info("全部迁移完成，总共刷新 %d 行记录。", total)


if __name__ == "__main__":
    asyncio.run(main())
