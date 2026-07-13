# Wedding Control Center v8

## v8 新增：前置項目內的展開式勾選清單
適合「十二禮準備、新娘包、攝影包」等內容很多的項目。

- 每個前置項目可按「加細項」
- 細項可逐一勾選、修改、刪除
- 父項目顯示完成度，例如 8/12
- 細項全部完成時，父項目自動完成
- 勾選父項目時，可一次完成／取消全部細項
- 細項可展開或收合，避免清單過長
- 婚禮流程若連結此項目，會顯示細項完成度與「尚缺」內容
- CSV 匯出會包含細項

## 資料保留
沿用 v7 所有既有資料與 collections，人員、流程、分類、前置項目都不會被清除。
本版只新增：
- wccTaskItems

## 部署
1. 將 ZIP 內 6 個檔案全部上傳 GitHub 根目錄並覆蓋舊檔。
2. Firebase Firestore Rules 必須更新一次，因為新增 `wccTaskItems`。
3. GitHub Pages 更新後測試：
   https://ericchang1225.github.io/wedding-checklist/?v=80
