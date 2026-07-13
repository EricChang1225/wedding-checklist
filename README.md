# 婚禮管家 3.0.2｜按鈕無反應修正版

真正原因是上一版 app.js 在「準備物品」程式後方，多留了一行不該存在的程式碼。它會讓 JavaScript 在啟動時中斷，所以畫面看得到，但分頁、鎖頭和所有按鈕都不會動。

本版已：
- 移除啟動中斷程式
- app.js、style.css 與婚宴頁加入 v302 快取版本
- 通過 JavaScript 語法檢查

請把 ZIP 裡所有檔案一起覆蓋上傳 GitHub。

測試：
https://ericchang1225.github.io/wedding-checklist/?v=302

Firebase rules 不用修改。
