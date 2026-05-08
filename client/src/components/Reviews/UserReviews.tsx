import React from 'react';

interface ReviewItem {
  id: number;
  avatar: string;
  name: string;
  rating: number;
  tag: string;
  tagColor: string;
  content: string;
  watchTime: string;
}

const REVIEWS: ReviewItem[] = [
  {
    id: 1,
    avatar: '🧑',
    name: '小墨里的慢生活',
    rating: 5,
    tag: '强烈推荐',
    tagColor: '#FF6A00',
    content: '看了前六集，戏情紧凑，不拖沓，故事情节新颖，开头就抓住里大噱，短短六集完成了相识，...',
    watchTime: '累计观看超过3小时',
  },
  {
    id: 2,
    avatar: '📺',
    name: '拯救爱人',
    rating: 5,
    tag: '强烈推荐',
    tagColor: '#FF6A00',
    content: '结束，终于等到古装男子任嘉伦出场便是恶势力不可挡，一个顶俩，偿得火，偿得注，再加上超...',
    watchTime: '累计观看少于1小时',
  },
  {
    id: 3,
    avatar: '👩',
    name: '南灵',
    rating: 5,
    tag: '强烈推荐',
    tagColor: '#FF6A00',
    content: '任嘉伦的战千乔太有魅力了！表面冷就柏挡，实则有盖道之心，反差感直接拉满，薄薄又深情的...',
    watchTime: '累计观看少于1小时',
  },
];

const SCORE_ITEMS = [
  { label: '力荐', score: null, filled: true },
  { label: '一般般', score: null, filled: false },
  { label: '不推荐', score: null, filled: false },
];

export default function UserReviews() {
  return (
    <div className="px-5 py-5 bg-[#0D0D0D] border-t border-white/5">
      {/* 标题行 - 带翻页 */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-medium text-[15px]">用户评价</h3>
        <div className="flex items-center gap-3">
          <button className="text-txv-text-tertiary text-[14px] hover:text-white transition-colors">&lt;</button>
          <span className="text-txv-text-secondary text-[13px]">1</span>
          <button className="text-txv-text-tertiary text-[14px] hover:text-white transition-colors">&gt;</button>
        </div>
      </div>

      {/* 评分 + 评论卡片横向布局 */}
      <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
        {/* 综合评分卡片 */}
        <div className="flex-shrink-0 w-[160px] xl:w-[180px] bg-[#1A1A1A] rounded-xl p-3 xl:p-4 flex flex-col">
          <p className="text-txv-text-tertiary text-[11px] mb-1">腾讯视频评分</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-txv-orange text-[36px] font-bold leading-tight">9.3</p>
              <div className="flex items-center gap-0.5 mt-1">
                {Array.from({ length: 5 }, (_, i) => (
                  <svg key={i} className="w-3 h-3 text-txv-orange" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                  </svg>
                ))}
              </div>
              <p className="text-txv-text-tertiary text-[10px] mt-1.5">23.2万人点评</p>
            </div>
            {/* 推荐指标 */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1">
                <span className="text-txv-text-tertiary text-[10px] w-8">力荐</span>
                <div className="w-[40px] h-[3px] bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-txv-orange rounded-full" style={{ width: '95%' }} />
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-txv-text-tertiary text-[10px] w-8">一般般</span>
                <div className="w-[40px] h-[3px] bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-txv-orange/50 rounded-full" style={{ width: '5%' }} />
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-txv-text-tertiary text-[10px] w-8">不推荐</span>
                <div className="w-[40px] h-[3px] bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-txv-orange/50 rounded-full" style={{ width: '2%' }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 用户评论卡片 */}
        {REVIEWS.map((review) => (
          <div
            key={review.id}
            className="flex-shrink-0 w-[200px] xl:w-[240px] bg-[#1A1A1A] rounded-xl p-3 xl:p-4 flex flex-col"
          >
            {/* 头部：头像 + 用户名 */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">{review.avatar}</span>
              <span className="text-white text-[12px] font-medium">{review.name}</span>
            </div>
            {/* 星星 + 标签 */}
            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 5 }, (_, i) => (
                  <svg
                    key={i}
                    className={`w-3 h-3 ${i < review.rating ? 'text-txv-orange' : 'text-white/20'}`}
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                  </svg>
                ))}
              </div>
              <span
                className="text-[10px] px-1.5 py-0.5 rounded"
                style={{ color: review.tagColor, backgroundColor: `${review.tagColor}15` }}
              >
                {review.tag}
              </span>
            </div>
            {/* 评论内容 */}
            <p className="text-txv-text-secondary text-[12px] leading-relaxed flex-1 line-clamp-3">
              {review.content}
            </p>
            {/* 底部观看时长 */}
            <p className="text-txv-text-tertiary text-[10px] mt-2 pt-2 border-t border-white/5">
              {review.watchTime}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
