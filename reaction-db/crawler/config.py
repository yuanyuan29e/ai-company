"""
多平台 Reaction 爬虫配置
支持平台：B站、腾讯视频、芒果TV、爱奇艺
"""

import os
import random

# ============ 基础配置 ============

# 数据库路径
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'database', 'reaction.db')

# 请求间隔（秒）- 避免触发风控
REQUEST_DELAY_MIN = 2.0
REQUEST_DELAY_MAX = 4.0

# 最大重试次数
MAX_RETRIES = 3

# 超时时间（秒）
REQUEST_TIMEOUT = 15

# ============ 平台枚举 ============

PLATFORM_BILIBILI = 'bilibili'
PLATFORM_TENCENT = 'tencent'
PLATFORM_MGTV = 'mgtv'
PLATFORM_IQIYI = 'iqiyi'

ALL_PLATFORMS = [PLATFORM_BILIBILI, PLATFORM_TENCENT, PLATFORM_MGTV, PLATFORM_IQIYI]

# ============ B站 API 地址 ============

# 弹幕 API（protobuf 格式）
BILIBILI_DANMAKU_API = "https://api.bilibili.com/x/v1/dm/list.so"

# 弹幕 API（新版 protobuf，按分段获取）
BILIBILI_DANMAKU_SEG_API = "https://api.bilibili.com/x/v2/dm/web/seg.so"

# 视频信息 API
BILIBILI_VIDEO_INFO_API = "https://api.bilibili.com/x/web-interface/view"

# 字幕列表 API（包含在视频信息中）
BILIBILI_PLAYER_API = "https://api.bilibili.com/x/player/v2"

# 评论 API
BILIBILI_COMMENT_API = "https://api.bilibili.com/x/v2/reply/main"

# cid 获取 API
BILIBILI_PAGELIST_API = "https://api.bilibili.com/x/player/pagelist"

# ============ 腾讯视频 API 地址 ============

# 弹幕 API（JSON格式，每30秒一包）
TENCENT_DANMU_API = "https://mfm.video.qq.com/danmu"

# 评论 API（cursor 翻页）
TENCENT_COMMENT_API = "https://video.coral.qq.com/varticle/{article_id}/comment/v2"

# ============ 芒果TV API 地址 ============

# 弹幕 API（JSON格式，每分钟一包）
MGTV_DANMU_API = "https://bullet-ali.hitv.com/bullet/{date}/{path}/{video_id}/{page}.json"

# 评论 API（分页）
MGTV_COMMENT_API = "https://comment.mgtv.com/v4/comment/getCommentList"

# ============ 爱奇艺 API 地址 ============

# 弹幕 API（.z压缩XML，每5分钟一包）
IQIYI_DANMU_API = "https://cmts.iqiyi.com/bullet/{id78}/{prefix}/{video_id}_300_{page}.z"

# 评论 API（last_id 翻页）
IQIYI_COMMENT_API = "https://sns-comment.iqiyi.com/v3/comment/get_comments.action"

# ============ 请求头配置 ============

# User-Agent 池
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
]

# Cookie（可选，登录后获取更多数据）
# 填入你的B站 Cookie 以获取字幕等需要登录的内容
BILIBILI_COOKIE = os.environ.get('BILIBILI_COOKIE', '')


def get_headers(platform: str = PLATFORM_BILIBILI):
    """获取指定平台的随机请求头"""
    base_headers = {
        'User-Agent': random.choice(USER_AGENTS),
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    }

    if platform == PLATFORM_BILIBILI:
        base_headers.update({
            'Referer': 'https://www.bilibili.com',
            'Origin': 'https://www.bilibili.com',
            'Cookie': BILIBILI_COOKIE,
        })
    elif platform == PLATFORM_TENCENT:
        base_headers.update({
            'Referer': 'https://v.qq.com',
            'Origin': 'https://v.qq.com',
        })
    elif platform == PLATFORM_MGTV:
        base_headers.update({
            'Referer': 'https://www.mgtv.com',
            'Origin': 'https://www.mgtv.com',
        })
    elif platform == PLATFORM_IQIYI:
        base_headers.update({
            'Referer': 'https://www.iqiyi.com',
            'Origin': 'https://www.iqiyi.com',
        })

    return base_headers


def get_delay():
    """获取随机请求延迟"""
    return random.uniform(REQUEST_DELAY_MIN, REQUEST_DELAY_MAX)


# ============ 剧集类型分类 ============

GENRE_MAP = {
    '古偶': ['古装', '偶像', '甜宠', '仙侠', '古装甜宠'],
    '悬疑': ['悬疑', '推理', '犯罪', '烧脑', '刑侦'],
    '喜剧': ['喜剧', '搞笑', '轻喜剧', '情景喜剧'],
    '仙侠': ['仙侠', '修仙', '玄幻', '奇幻'],
    '都市': ['都市', '现代', '职场', '情感', '家庭'],
}

# ============ 数据过滤规则 ============

# 最小文本长度（过短的弹幕无意义）
MIN_TEXT_LENGTH = 2

# 最大文本长度（过长的可能是复制粘贴）
MAX_TEXT_LENGTH = 50

# 需要过滤的关键词（广告/无关内容）
FILTER_KEYWORDS = [
    '关注', '点赞', '投币', '三连', '求关注',
    'http', 'www', '.com', '.cn',
    '加群', 'QQ', '微信', 'wx',
    '抽奖', '福利', '免费',
]
