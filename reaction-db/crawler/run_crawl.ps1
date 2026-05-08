# 多平台 Reaction 数据爬取脚本
# 使用方法: 在 PowerShell 中执行 .\run_crawl.ps1

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  多平台 Reaction 数据爬取工具" -ForegroundColor Cyan
Write-Host "  支持: B站 | 腾讯视频 | 爱奇艺" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# 设置工作目录
Set-Location $PSScriptRoot

# 设置B站 Cookie 环境变量（用于获取字幕等需要登录的数据）
$env:BILIBILI_COOKIE = "DedeUserID=98820231; DedeUserID__ckMd5=56c2a57e2e0e0321; Hm_lvt_8a6e55dbd2870f0f5bc9194cddf32a02=1746014542; buvid_fp=c760b87d59c4dea2a399a7e10b7e8ed4; buvid3=BDBADB2C-3FC1-6B47-CC4A-E1E8F30B90AC24810infoc; b_nut=100; header_theme_version=CLOSE; enable_web_push=DISABLE; home_feed_column=5; _uuid=B81015BC1-EBC6-CD57-6210B-2A2FA8FCA3F625421infoc; CURRENT_FNVAL=4048; rpdid=0zbfAH0H2G|2ksZ8twPB|3WB|3w1SFjsF; buvid4=53E33D8D-CAD3-D43B-65AD-D5CBC2CE32C727002-024042400-Jqh%2FA7Yba%2BIJW0b9lRxwRg%3D%3D; bili_ticket=eyJhbGciOiJIUzI1NiIsImtpZCI6InMwMyIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NDYzMTQzMzksImlhdCI6MTc0NjA1NTA3OSwicGx0IjotMX0.EPE4FMhQsaLDBIQCQEeb4a9M4C8tORADMfaC3YQKiho; bili_ticket_expires=1746314279; SESSDATA=cc5ad78b%2C1793434753%2C8892c*51CjCPqTInLy3MiY_i6tUTnf5KfdfqR4qcVvU92GCi5gRbYt-7Gq-pxnWtVfGLKCB_e1YSVnBlbnlfbWQ5X3NrdUwza1ZUQ29LRFFLTTJ4QzV1UkZxaU1MSWV5dGJCTVVoRW5jMkg4Vmp6UVlhb0duQW5GcE5hb2NFRjdjdkNBZ190NUlrZmpSNUZnIIEC; bp_t_offset_98820231=1052024979367469056; b_lsid=AE5A6FF5_196580C3E91; browser_resolution=1474-860; PVID=1; CURRENT_QUALITY=80; sid=73dfblnx"

Write-Host "[INFO] Cookie 已设置" -ForegroundColor Green
Write-Host ""

# 检查数据库
$dbPath = Join-Path $PSScriptRoot "..\database\reaction.db"
if (-not (Test-Path $dbPath)) {
    Write-Host "[ERROR] 数据库不存在，正在初始化..." -ForegroundColor Red
    python (Join-Path $PSScriptRoot "..\database\quick_init.py")
}

Write-Host "[STEP 1] 开始多平台批量爬取..." -ForegroundColor Yellow
Write-Host ""

# 执行爬取（默认跳过已完成的视频）
python batch_crawl.py

Write-Host ""
Write-Host "[STEP 2] 执行自动质量筛选..." -ForegroundColor Yellow
Write-Host ""

# 自动质量筛选
python auto_filter.py

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  全部完成！" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "查看数据库统计: python batch_crawl.py --stats"
Write-Host ""

# 暂停
Read-Host "按回车键退出"
