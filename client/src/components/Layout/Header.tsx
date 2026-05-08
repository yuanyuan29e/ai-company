import React, { useState } from 'react';

const NAV_ITEMS = ['首页', '电视剧', '电影', '综艺', '动漫', '少儿', '短剧', '纪录片', '体育', '全部'];

export default function Header() {
  const [activeNav, setActiveNav] = useState('电视剧');
  const [searchText, setSearchText] = useState('');

  return (
    <header className="w-full h-[52px] flex-shrink-0 border-b border-white/[0.06] z-50 relative bg-[#1B1B1F]">
      {/* 底部分割线 */}
      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-white/[0.04]" />

      {/* 内容容器 - 限制最大宽度并居中 */}
      <div className="w-full max-w-[1440px] mx-auto h-full flex items-center px-5">
        {/* Logo - 腾讯视频官方Logo */}
        <div className="flex items-center mr-5 flex-shrink-0 cursor-pointer group">
          <img
            src="/tencent-video-logo.svg"
            alt="腾讯视频"
            className="h-[28px] w-auto group-hover:scale-105 transition-transform"
          />
        </div>

        {/* 频道导航 */}
        <nav className="flex items-center gap-0 mr-3 flex-shrink-0">
          {NAV_ITEMS.map(item => (
            <button
              key={item}
              onClick={() => setActiveNav(item)}
              className={`relative px-2.5 py-1.5 text-[13px] rounded transition-all whitespace-nowrap ${
                activeNav === item
                  ? 'text-white font-semibold'
                  : 'text-[#999] hover:text-white/80'
              }`}
            >
              {item}
              {activeNav === item && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-[2px] bg-txv-orange rounded-full" />
              )}
              {item === '全部' && (
                <svg className="inline-block w-3 h-3 ml-0.5 opacity-50" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M7 10l5 5 5-5z"/>
                </svg>
              )}
            </button>
          ))}
        </nav>

        {/* 搜索框 */}
        <div className="flex-1 max-w-[320px] mx-3">
          <div className="flex items-center bg-[#2A2A2E] rounded-full px-3.5 py-1.5 gap-2 border border-[#3A3A3E]/50 focus-within:border-txv-orange/40 transition-all">
            <svg className="w-4 h-4 text-[#666] flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
            <input
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="奔跑吧 第10季"
              className="bg-transparent text-white text-[13px] outline-none w-full placeholder-[#555]"
            />
            <button className="flex-shrink-0 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
              <svg className="w-3.5 h-3.5 text-white/70" fill="currentColor" viewBox="0 0 24 24">
                <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
              </svg>
            </button>
          </div>
        </div>

        {/* 右侧功能 */}
        <div className="flex items-center gap-2.5 ml-auto flex-shrink-0">
          {/* VIP 会员 */}
          <div className="flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity">
            <span className="text-[#FFD700] text-[14px] font-bold italic">VIP</span>
            <span className="text-[#999] text-[12px]">会员</span>
          </div>
          <span className="text-white/10 text-[12px]">|</span>
          {/* 游戏中心 */}
          <button className="text-[#999] text-[12px] hover:text-white/80 transition-colors whitespace-nowrap">
            游戏中心
          </button>
          <span className="text-white/10 text-[12px]">|</span>
          {/* 历史 */}
          <button className="text-[#999] text-[12px] hover:text-white/80 transition-colors whitespace-nowrap">
            历史
          </button>
          <span className="text-white/10 text-[12px]">|</span>
          {/* 帮助 */}
          <button className="text-[#999] text-[12px] hover:text-white/80 transition-colors whitespace-nowrap">
            帮助
          </button>
          <span className="text-white/10 text-[12px]">|</span>
          {/* 下载客户端 */}
          <button className="flex items-center gap-1 text-[#999] text-[12px] hover:text-white/80 transition-colors border border-white/[0.15] rounded px-2 py-0.5 whitespace-nowrap">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
            </svg>
            下载客户端
          </button>
          {/* 头像 */}
          <div className="w-7 h-7 rounded-full bg-txv-orange/15 flex items-center justify-center cursor-pointer hover:bg-txv-orange/25 transition-all">
            <svg className="w-4 h-4 text-[#FF6A00]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
            </svg>
          </div>
        </div>
      </div>
    </header>
  );
}
