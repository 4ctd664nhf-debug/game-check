# 每日自律 PWA（免費部署版）

這是一個可安裝到 iPhone 主畫面的 PWA 網頁 App。無須購買固定 IP、網域或租用伺服器。

## 功能
- 最多 20 項自訂任務，可新增、修改、刪除及勾選完成
- 自動計算完成數量與百分比
- 一鍵重置今日勾選，不影響歷史紀錄
- 封存當日紀錄；隔天開啟時也會自動封存前一天並重置勾選
- IndexedDB 本機儲存
- 支援離線開啟（首次需在線載入）
- JSON 備份與還原

## 免費發布：GitHub Pages

1. 到 https://github.com 註冊或登入。
2. 建立一個新的 Repository，例如 `daily-discipline`。
3. 將本資料夾內的所有檔案與 `icons` 資料夾上傳到 Repository 根目錄。
4. 進入 Repository 的 **Settings → Pages**。
5. 在 **Build and deployment** 選擇 **Deploy from a branch**。
6. Branch 選 `main`，資料夾選 `/(root)`，按 Save。
7. 等待部署完成，GitHub 會提供網址，格式類似：
   `https://你的帳號.github.io/daily-discipline/`

不需要購買 IP 或網域。GitHub Pages 會提供 HTTPS 網址。

## iPhone 安裝
1. 用 iPhone 的 Safari 開啟 GitHub Pages 網址。
2. 點擊 Safari 的「分享」圖示。
3. 選擇「加入主畫面」。
4. 名稱可設為「每日自律」，按「新增」。
5. 之後從主畫面圖示開啟即可。

## 資料與隱私
- 任務與歷史紀錄保存在該 iPhone 的 Safari 網站資料（IndexedDB）。
- 不會自動上傳到 GitHub，也不會同步到其他裝置。
- 請到「資料管理」定期匯出 JSON 備份。
- 清除 Safari 網站資料、使用無痕模式或更換裝置可能造成資料遺失。
- GitHub Pages 只負責提供程式檔案，不會取得你在 App 內打卡的內容。

## 更新程式
重新上傳檔案後，若手機仍顯示舊版，可關閉 App 後重新開啟，或稍後再試。Service Worker 會更新快取。

## 本機測試
PWA 的 Service Worker 通常需要 HTTPS 或 localhost。可先將檔案部署到 GitHub Pages，再用手機測試。
