# 婚禮管家 2.5 Beta｜新版首頁介面

這版把真正的 HTML/CSS/JavaScript 首頁改成婚禮 App 版面，不是圖片。

## 主要修改
- 「距離婚禮」整合進婚禮管家 Header
- 目前使用者與切換按鈕整合進 Header
- 首頁主標題改成「7/18（婚禮當天）我的行程」
- 下一個行程只從婚禮當天的個人行程中選擇
- 婚禮行程改成直式時間軸
- 新增三張快捷卡：今天要做、工作中心、我的名單
- 保留原本 Firebase 資料與勾選功能
- 正式版 2.3.1 不會受到影響

## 部署
將 ZIP 裡的 beta 資料夾完整覆蓋 GitHub 根目錄現有的 beta 資料夾。

測試網址：
https://ericchang1225.github.io/wedding-checklist/beta/?v=250

## Firebase
沒有新增 collection，不需要修改 firestore.rules。
