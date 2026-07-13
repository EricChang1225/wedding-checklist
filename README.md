# 婚禮管家 V3.0.1｜Firebase 連線修正版

## 真正原因
新版 Header 拿掉了原本的 `id="appTitle"`，但主程式啟動時仍會在該元素綁定管理模式長按事件。

因此 JavaScript 在 Firebase `start()` 執行前就停止，畫面會一直停在：
- 準備連線
- 尚未設定婚禮日期
- 資料空白

## 本版修正
- 恢復 Header 的 `id="appTitle"`
- 管理模式事件加入防呆
- 即使 UI 元件缺少，也不會再阻止 Firebase 啟動
- app.js 與 style.css 使用 v3001 快取版本
- 已通過 JavaScript 語法檢查

## 部署
將 ZIP 內全部檔案覆蓋 GitHub Repository 根目錄。

測試網址：
https://ericchang1225.github.io/wedding-checklist/?v=3001

Firebase rules 不需要修改。
