# Wedding Control Center v13：流程時間模式

## 新增
建立或修改婚禮流程時，可以選：

1. 不設定時間
2. 單一時間，例如 09:00
3. 時間區間，例如 09:00－10:30

舊資料相容：
- 原本已有 `time` 的流程會自動視為「單一時間」
- 不需要重新建立流程
- 排序、地址、Google 地圖、確認項目與其他資料都會保留

## 更新方式
將 ZIP 內所有檔案上傳 GitHub 根目錄並覆蓋舊檔。

## Firebase
本版沒有新增 collection，也沒有修改 Firestore 權限需求。
如果目前規則已經是 v10 之後的版本，不需要重新發布 firestore.rules。

## 測試網址
https://ericchang1225.github.io/wedding-checklist/?v=130
