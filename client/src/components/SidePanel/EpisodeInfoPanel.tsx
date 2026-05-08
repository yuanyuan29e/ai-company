import React, { useState } from 'react';

const TOTAL_EPISODES = 40;
const AVAILABLE_EPISODES = 24;
const CURRENT_EPISODE = 1;

export default function EpisodeInfoPanel() {
  const [activeTab, setActiveTab] = useState<'playlist' | 'recommend'>('playlist');
  const [selectedEpisode, setSelectedEpisode] = useState(CURRENT_EPISODE);

  return (
    <div className="h-full overflow-y-auto bg-[#141414]">
      {/* 剧集标题区 */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-white font-semibold text-[17px]">佳偶天成</h2>
          <span className="text-txv-text-tertiary text-sm cursor-pointer hover:text-txv-text-secondary transition-colors">
            简介 &gt;
          </span>
        </div>
        <p className="text-txv-text-tertiary text-[13px] mt-1.5">
          内地 · 2026 · 仙侠玄幻 · 拯救爱人
        </p>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-txv-orange font-semibold text-[15px]">9.3分</span>
          <span className="text-txv-text-tertiary text-[12px] flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
            </svg>
            21792
          </span>
        </div>
        <p className="text-txv-text-tertiary text-[11px] mt-2 leading-relaxed">
          追剧日历 · 更新至24集/全40集 · 会员每日18点更新，5月12日至5月14日停更 &gt;
        </p>
      </div>

      {/* 功能按钮行 */}
      <div className="flex items-center gap-6 px-4 pb-3 border-b border-white/5">
        <button className="flex flex-col items-center gap-1 text-txv-text-secondary text-[11px] hover:text-white transition-colors">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z"/>
          </svg>
          追剧
        </button>
        <button className="flex flex-col items-center gap-1 text-txv-text-secondary text-[11px] hover:text-white transition-colors">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
          </svg>
          缓存
        </button>
        <button className="flex flex-col items-center gap-1 text-txv-text-secondary text-[11px] hover:text-white transition-colors">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
          </svg>
          更多
        </button>
      </div>

      {/* 查看会员详情卡片 */}
      <div className="mx-4 mt-3 bg-gradient-to-r from-[#2A2000] to-[#1A1500] rounded-lg p-3 flex items-center justify-between border border-[#FFD700]/10">
        <div>
          <p className="text-[#FFD700] text-[13px] font-medium">查看会员详情</p>
          <p className="text-txv-text-tertiary text-[11px] mt-0.5">探索你的会员状态与专属特权</p>
        </div>
        <button className="text-[#FFD700] text-[12px] border border-[#FFD700]/50 rounded-full px-3 py-1 hover:bg-[#FFD700]/10 transition-colors">
          立即查看
        </button>
      </div>

      {/* 播放列表 / 相关推荐 Tab */}
      <div className="mt-4 px-4 flex items-center gap-6 border-b border-white/5">
        <button
          onClick={() => setActiveTab('playlist')}
          className={`pb-2.5 text-[14px] relative transition-colors ${
            activeTab === 'playlist'
              ? 'text-white font-medium'
              : 'text-txv-text-tertiary hover:text-txv-text-secondary'
          }`}
        >
          播放列表
          {activeTab === 'playlist' && (
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-[2px] bg-txv-orange rounded-full" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('recommend')}
          className={`pb-2.5 text-[14px] relative transition-colors ${
            activeTab === 'recommend'
              ? 'text-white font-medium'
              : 'text-txv-text-tertiary hover:text-txv-text-secondary'
          }`}
        >
          相关推荐
          {activeTab === 'recommend' && (
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-[2px] bg-txv-orange rounded-full" />
          )}
        </button>
      </div>

      {/* 选集内容 */}
      {activeTab === 'playlist' && (
        <div className="px-4 pt-3 pb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-white text-[13px] font-medium">选集</p>
            <span className="text-txv-text-tertiary text-[11px]">1-{TOTAL_EPISODES}</span>
          </div>
          <div className="grid grid-cols-5 gap-2 xl:gap-2.5">
            {Array.from({ length: TOTAL_EPISODES }, (_, i) => {
              const ep = i + 1;
              const isSelected = ep === selectedEpisode;
              const isVip = ep > 1;
              const isAvailable = ep <= AVAILABLE_EPISODES;
              return (
                <button
                  key={ep}
                  onClick={() => isAvailable && setSelectedEpisode(ep)}
                  className={`relative aspect-square rounded-md flex items-center justify-center text-[14px] font-medium transition-all ${
                    isSelected
                      ? 'bg-txv-orange text-white'
                      : isAvailable
                        ? 'bg-[#2A2A2A] text-txv-text-secondary hover:bg-[#333] hover:text-white'
                        : 'bg-[#1E1E1E] text-txv-text-tertiary/50 cursor-not-allowed'
                  }`}
                >
                  {ep}
                  {isVip && !isSelected && isAvailable && (
                    <span className="absolute top-0.5 right-1 text-[9px] text-[#FFD700] font-medium italic">
                      VIP
                    </span>
                  )}
                  {!isAvailable && ep === 25 && (
                    <span className="absolute -top-0.5 -right-0.5 text-[8px] text-[#FF4444] font-bold">
                      NEW
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 相关推荐 */}
      {activeTab === 'recommend' && (
        <div className="px-4 pt-3 pb-4">
          {[
            { title: '仙剑奇侠传', tag: '仙侠 · 古装', rating: '8.9' },
            { title: '长歌行', tag: '历史 · 冒险', rating: '8.5' },
            { title: '御赐小仵作', tag: '悬疑 · 古装', rating: '9.0' },
            { title: '苍兰诀', tag: '仙侠 · 爱情', rating: '9.2' },
            { title: '星汉灿烂', tag: '古装 · 爱情', rating: '8.7' },
          ].map((item, i) => (
            <div
              key={i}
              className="flex items-center gap-3 py-3 border-b border-white/5 last:border-b-0 cursor-pointer hover:bg-white/[0.02] rounded transition-colors"
            >
              <div className="w-[90px] h-[54px] rounded bg-[#2A2A2A] flex items-center justify-center flex-shrink-0 overflow-hidden">
                <svg className="w-6 h-6 text-txv-text-tertiary" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM10 8l5 4-5 4V8z"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-[13px] truncate">{item.title}</p>
                <p className="text-txv-text-tertiary text-[11px] mt-0.5">{item.tag}</p>
              </div>
              <span className="text-txv-orange text-[12px] flex-shrink-0">{item.rating}分</span>
            </div>
          ))}
        </div>
      )}

      {/* 相关短视频 */}
      <div className="px-4 pt-3 pb-4 border-t border-white/5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-white text-[13px] font-medium">相关短视频</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { title: '彩蛋1', tag: '花絮' },
            { title: '彩蛋2', tag: '预告' },
            { title: '彩蛋3', tag: '幕后' },
            { title: '彩蛋4', tag: '混剪' },
          ].map((item, i) => (
            <div key={i} className="rounded-lg overflow-hidden cursor-pointer hover:opacity-80 transition-opacity">
              <div className="aspect-video bg-[#2A2A2A] flex items-center justify-center relative">
                <svg className="w-5 h-5 text-txv-text-tertiary" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
                <span className="absolute bottom-1 right-1 text-[9px] text-white/60 bg-black/60 px-1 rounded">{item.tag}</span>
              </div>
              <p className="text-txv-text-secondary text-[11px] mt-1 truncate">{item.title}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
