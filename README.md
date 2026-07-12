# 婚禮 Checklist v3.1

新增：
- 負責人可自由輸入，可一次加入多人
- 已建立的人員會顯示為建議
- 輸入新名字儲存任務時，會自動加入人員清單
- 不再預設建立新郎、新娘、伴郎、伴娘、主持人
- 相容舊版 assigneeIds 資料

部署：覆蓋 GitHub 根目錄的 index.html、app.js、firebase-config.js、firestore.rules、README.md。
Firebase Rules 與上一版相同，不必重新發布。
測試網址：https://ericchang1225.github.io/wedding-checklist/?v=31
