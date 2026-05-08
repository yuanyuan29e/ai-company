"""
从腾讯视频提取《佳偶天成》第1集弹幕
API: https://dm.video.qq.com/barrage/segment/{vid}/t/v1/{start_ms}/{end_ms}
每30秒一段，无需认证
"""

import requests
import json
import time
import os

# 视频信息
VID = "v4102yte9jg"  # 《佳偶天成》第1集
VIDEO_DURATION_MIN = 45  # 估计视频时长（分钟）
SEGMENT_MS = 30000  # 每段30秒

# 输出路径
OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_JSON = os.path.join(OUTPUT_DIR, "danmaku_episode1.json")

def fetch_danmaku(vid, duration_minutes=45):
    """获取指定视频的全部弹幕"""
    all_danmaku = []
    hot_danmaku = []  # 高赞弹幕
    
    total_segments = (duration_minutes * 60 * 1000) // SEGMENT_MS
    empty_count = 0
    
    print(f"开始获取弹幕: vid={vid}, 预计{total_segments}段")
    print(f"API: https://dm.video.qq.com/barrage/segment/{vid}/t/v1/...")
    print("-" * 50)
    
    for i in range(total_segments):
        start_ms = i * SEGMENT_MS
        end_ms = start_ms + SEGMENT_MS
        
        url = f"https://dm.video.qq.com/barrage/segment/{vid}/t/v1/{start_ms}/{end_ms}"
        
        try:
            resp = requests.get(url, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://v.qq.com',
            }, timeout=10)
            
            if resp.status_code != 200:
                print(f"  [WARN] 段{i} 状态码: {resp.status_code}")
                empty_count += 1
                if empty_count >= 5:
                    print(f"  连续5次失败，停止")
                    break
                time.sleep(1)
                continue
            
            data = resp.json()
            barrage_list = data.get('barrage_list', [])
            
            if not barrage_list:
                empty_count += 1
                if empty_count >= 3:
                    print(f"  连续3次无数据(时间={start_ms//1000}s)，视频已结束")
                    break
                time.sleep(0.5)
                continue
            
            empty_count = 0
            
            for barrage in barrage_list:
                content = barrage.get('content', '').strip()
                if not content:
                    continue
                
                time_offset_ms = int(barrage.get('time_offset', 0))
                timestamp_s = (start_ms + time_offset_ms) / 1000.0
                up_count = int(barrage.get('up_count', 0))
                content_score = float(barrage.get('content_score', 0))
                
                # 提取颜色信息
                color = '#FFFFFF'
                content_style = barrage.get('content_style', '')
                if content_style:
                    try:
                        style = json.loads(content_style) if isinstance(content_style, str) else content_style
                        if style.get('color'):
                            color = '#' + style['color'].upper()
                        if style.get('gradient_colors'):
                            color = '#' + style['gradient_colors'][0].upper()
                    except:
                        pass
                
                item = {
                    'text': content,
                    'timestamp': round(timestamp_s, 1),
                    'up_count': up_count,
                    'color': color,
                    'score': content_score,
                }
                
                all_danmaku.append(item)
                
                # 高赞弹幕单独收集
                if up_count >= 50 or content_score >= 100:
                    hot_danmaku.append(item)
            
            # 进度打印
            if i > 0 and i % 20 == 0:
                minutes = start_ms // 60000
                print(f"  进度: {minutes}分钟, 已获取 {len(all_danmaku)} 条弹幕, {len(hot_danmaku)} 条热门")
            
            # 请求间隔，避免频繁
            time.sleep(0.3)
            
        except Exception as e:
            print(f"  [ERROR] 段{i}: {e}")
            time.sleep(1)
            empty_count += 1
            if empty_count >= 5:
                break
    
    print("-" * 50)
    print(f"获取完成！总计 {len(all_danmaku)} 条弹幕, {len(hot_danmaku)} 条热门")
    
    return all_danmaku, hot_danmaku


def filter_quality_danmaku(all_danmaku, hot_danmaku):
    """筛选高质量弹幕用于前端展示"""
    
    # 过滤规则
    def is_good(text):
        # 太短
        if len(text) < 2:
            return False
        # 太长
        if len(text) > 30:
            return False
        # 纯重复字符
        if len(set(text)) <= 2 and len(text) > 3:
            return False
        # 广告/无关
        keywords = ['关注', '点赞', 'http', 'www', '加群', 'QQ', '微信', '抽奖', '福利']
        for kw in keywords:
            if kw.lower() in text.lower():
                return False
        return True
    
    # 筛选普通弹幕池（去重、筛选）
    seen = set()
    normal_pool = []
    for d in sorted(all_danmaku, key=lambda x: x['timestamp']):
        text = d['text']
        if text in seen or not is_good(text):
            continue
        seen.add(text)
        normal_pool.append(d)
    
    # 筛选热门弹幕（高赞 + 高分）
    seen_hot = set()
    hot_pool = []
    for d in sorted(hot_danmaku, key=lambda x: -x['up_count']):
        text = d['text']
        if text in seen_hot or not is_good(text):
            continue
        seen_hot.add(text)
        hot_pool.append(d)
    
    print(f"筛选后：普通弹幕 {len(normal_pool)} 条, 热门弹幕 {len(hot_pool)} 条")
    
    return normal_pool, hot_pool


def export_for_frontend(normal_pool, hot_pool, output_path):
    """导出为前端可用的JSON格式"""
    
    # 取前100条普通弹幕作为弹幕池
    # 均匀采样以覆盖整个视频时间线
    if len(normal_pool) > 100:
        step = len(normal_pool) // 100
        sampled_normal = [normal_pool[i] for i in range(0, len(normal_pool), step)][:100]
    else:
        sampled_normal = normal_pool
    
    # 热门弹幕取前20条
    sampled_hot = hot_pool[:20]
    
    result = {
        'video': '佳偶天成 第1集',
        'vid': VID,
        'total_danmaku': len(normal_pool),
        'normal_pool': [d['text'] for d in sampled_normal],
        'hot_pool': [
            {
                'text': d['text'],
                'hot': d['up_count'],
                'color': d['color'] if d['color'] != '#FFFFFF' else '#FFFFFF',
            }
            for d in sampled_hot
        ],
    }
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    
    print(f"\n已导出到: {output_path}")
    print(f"  普通弹幕池: {len(result['normal_pool'])} 条")
    print(f"  热门弹幕池: {len(result['hot_pool'])} 条")
    
    # 打印部分样本
    print(f"\n=== 普通弹幕样本 ===")
    for text in result['normal_pool'][:15]:
        print(f"  '{text}'")
    
    print(f"\n=== 热门弹幕样本 ===")
    for item in result['hot_pool'][:10]:
        print(f"  '{item['text']}' (🔥{item['hot']})")
    
    return result


if __name__ == '__main__':
    print("=" * 50)
    print("《佳偶天成》第1集 弹幕提取工具")
    print("=" * 50)
    print()
    
    # 1. 获取弹幕
    all_danmaku, hot_danmaku = fetch_danmaku(VID, duration_minutes=VIDEO_DURATION_MIN)
    
    if not all_danmaku:
        print("未获取到弹幕，请检查网络连接")
        exit(1)
    
    # 2. 筛选高质量弹幕
    normal_pool, hot_pool = filter_quality_danmaku(all_danmaku, hot_danmaku)
    
    # 3. 导出
    result = export_for_frontend(normal_pool, hot_pool, OUTPUT_JSON)
    
    print("\n✅ 完成！下一步请运行 update_frontend_danmaku.py 更新前端代码")
