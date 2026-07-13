# 婚禮管家 3.0.3｜全新程式檔名修正版

Console 顯示：

Unexpected end of input
app.js:728

但壓縮包內的 app.js 已通過語法檢查，表示 GitHub 上實際載入的 app.js 並不是完整的新檔，可能是舊檔、上傳中斷或快取混用。

本版不再覆蓋原本的 app.js，而是新增一個全新的：

app-v303.js

index.html 只會載入 app-v303.js，因此不會再讀取先前有問題的 app.js。

## 更新方式

請將 ZIP 內所有檔案一起上傳到 GitHub 根目錄，確認 GitHub 中同時出現：

- index.html
- app-v303.js
- style.css
- firebase-config.js

舊的 app.js 可以保留，不影響網站。

部署後請開：

https://ericchang1225.github.io/wedding-checklist/?v=303

Firebase rules 不用修改。
