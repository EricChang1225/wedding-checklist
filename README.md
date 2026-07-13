# Wedding Control Center v6

包含：Dashboard、前置準備、婚禮流程、我的任務（工作／流程分開）、人員、分類與流程排序、CSV 匯出、列印、Firebase 即時同步。

部署：
1. 將 6 個檔案上傳 GitHub 根目錄並覆蓋舊檔。
2. Firebase Firestore Rules 必須更新成此版 firestore.rules。
3. 測試網址：https://ericchang1225.github.io/wedding-checklist/?v=60

此版使用新集合：wccTasks、wccCategories、wccFlows、wccFlowChecks、wccPeople、wccSettings。舊版資料不會被刪除，但不會自動搬入。
