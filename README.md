# 婚禮管家 3.0.1｜介面無反應修正版

## 修正原因
上一版可能發生瀏覽器同時載入：
- 舊的 index.html
- 新的 app.js

新程式尋找新版 Header 元件時會中斷，因此所有分頁看起來都沒有反應。

## 本版修正
- CSS 與 JavaScript 加入 v301 快取版本
- Header 元件加入相容保護
- 分頁與工作表單加入防呆
- 避免新舊檔案短暫混用時整個網站停止運作

## 更新方式
請把 ZIP 內所有檔案一起覆蓋上傳 GitHub，不要只上傳 app.js。

上傳後開啟：
https://ericchang1225.github.io/wedding-checklist/?v=301

若仍看到舊畫面：
1. 按 Ctrl + F5 強制重新整理
2. 或用無痕視窗開啟測試網址

## Firebase
不需要修改 firestore.rules。
