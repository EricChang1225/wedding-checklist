# Wedding Control Center v7

## 新增功能
- 婚禮流程可輸入地點、地址、Google Maps 連結
- 只輸入地址時，系統會自動產生 Google 地圖搜尋連結
- 前置項目可直接選擇要連動的婚禮流程
- 儲存前置項目後，對應流程會自動建立「現場確認」項目
- 我的任務改成「我的工作」與「我的準備物品」
- 移除「我的流程」
- 婚禮流程增加群組與收合功能
- 人員可用 ☰ 拖曳上下排序
- 原本建立的人員沿用同一個 wccPeople collection，不會被清除

## 部署
1. 把 6 個檔案全部上傳到 GitHub Repository 根目錄並覆蓋舊檔。
2. Firebase Firestore Rules 必須更新成這版 firestore.rules，因為新增了 wccFlowGroups。
3. GitHub Pages 更新後測試：
   https://ericchang1225.github.io/wedding-checklist/?v=70

## 資料保留
沿用 v6 的：
- wccTasks
- wccCategories
- wccFlows
- wccFlowChecks
- wccPeople
- wccSettings

因此 v6 已建立的人員與主要資料都會保留。舊流程沒有群組時會顯示在「未分組」。
