# 婚禮管家 2.4 Beta

這是獨立測試版，不會覆蓋正式版 2.3.1。

## 測試功能
- 新增「工作中心」
- 接送、採買、聯絡、協助等工作可以獨立建立
- 可設定開始／結束時間、地點、重要程度與負責人
- 不必連動婚禮流程
- 指派給目前使用者後，會出現在「我的行程 → 今天要做」
- 地點可直接開啟 Google 地圖

## 部署方式
將整個 beta 資料夾上傳到 GitHub Repository 根目錄。

測試網址：
https://ericchang1225.github.io/wedding-checklist/beta/?v=240

正式版網址不會受到影響：
https://ericchang1225.github.io/wedding-checklist/

## Firebase
沿用 wccTasks collection，沒有新增 collection，不需要修改 firestore.rules。
