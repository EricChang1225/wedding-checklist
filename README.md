# 婚禮管家 2.5.1 Beta｜安全資料版

這版重新以最後確認可正常連線、資料完整的 2.3.1 為基礎。

只修改：
- Header 版面
- 婚禮倒數位置
- 我的行程首頁呈現
- 婚禮當天時間軸
- 快捷卡片

完全保留：
- Firebase 初始化
- 匿名登入
- Firestore collections
- 即時監聽
- 人員、名單、流程、準備項目與設定資料
- 管理模式與所有表單

## 部署
請將 ZIP 內的 beta 資料夾完整覆蓋 GitHub 根目錄的 beta 資料夾。

測試網址：
https://ericchang1225.github.io/wedding-checklist/beta/?v=251

請先確認 Header 顯示「已連線・多人即時同步」，再檢查原有婚禮日期、流程、人員與名單。

## Firebase
不需要修改 firestore.rules。
