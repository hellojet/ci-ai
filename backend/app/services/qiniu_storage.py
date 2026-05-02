"""七牛云对象存储服务。"""

import logging
import uuid

from qiniu import Auth, put_data

from app.config import get_settings

logger = logging.getLogger(__name__)


def _get_auth() -> Auth:
    settings = get_settings()
    return Auth(settings.qiniu_access_key, settings.qiniu_secret_key)


def upload_bytes(
    data: bytes,
    extension: str = "png",
    folder: str = "images",
) -> str:
    """将二进制数据上传到七牛云，返回完整的公开访问 URL。

    Args:
        data: 文件二进制内容
        extension: 文件扩展名（不含点）
        folder: 存储路径前缀（如 views / environments / styles）

    Returns:
        完整的 CDN URL，如 https://te6l2pna9.hd-bkt.clouddn.com/views/xxxx.png
    """
    settings = get_settings()
    auth = _get_auth()

    key = f"{folder}/{uuid.uuid4().hex}.{extension}"
    token = auth.upload_token(settings.qiniu_bucket, key, 3600)

    ret, info = put_data(token, key, data)

    if info.status_code != 200:
        logger.error("七牛云上传失败: status=%s, body=%s", info.status_code, info.text_body)
        raise RuntimeError(f"七牛云上传失败: {info.status_code}")

    # 七牛默认域名的 HTTPS 证书 CN 不匹配（*.ctcdn.cn），只能走 http。
    # 如果前端部署在 https 下需要避免 mixed content，请在七牛后台绑定自有域名并配置 HTTPS 证书，
    # 然后把 QINIU_DOMAIN 改成自有域名即可。
    url = f"http://{settings.qiniu_domain}/{key}"
    logger.info("七牛云上传成功: %s", url)
    return url
