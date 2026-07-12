# 婚禮 Checklist｜GitHub Pages + Firebase

這個版本支援：
- iPhone、Android、iPad、電腦瀏覽器
- 不需下載 App
- 不同裝置即時同步勾選狀態
- 顯示完成者與更新時間
- 新增待辦事項
- 匿名登入，不必替每位工作人員建立帳號

## 一、建立 Firebase 專案

1. 開啟 Firebase Console，建立新專案。
2. 在「專案總覽」按 Web 圖示 `</>`，註冊 Web App。
3. 複製畫面中的 `firebaseConfig`。
4. 打開本資料夾的 `firebase-config.js`，替換裡面的內容。

## 二、啟用匿名登入

1. Firebase Console → Authentication。
2. 按「開始使用」。
3. Sign-in method／登入方式。
4. 啟用「匿名」。

## 三、建立 Firestore

1. Firebase Console → Firestore Database。
2. 建立資料庫。
3. 建議選擇離台灣近的區域。
4. 建立後切到「Rules／規則」。
5. 將 `firestore.rules` 的全部內容貼入並按「發布」。

> 不要長期使用 Test mode。此專案附的規則要求使用者必須先匿名登入，並禁止前端刪除資料。

## 四、上傳到 GitHub Pages

將以下檔案放進你 GitHub Repository 的根目錄：
- index.html
- app.js
- firebase-config.js

接著：
1. GitHub Repository → Settings。
2. Pages。
3. Source 選 Deploy from a branch。
4. Branch 選 main，資料夾選 `/root`。
5. 儲存後開啟 GitHub 提供的網址。

## 五、測試同步

1. 用手機開網站，輸入姓名並勾選一項。
2. 再用另一台手機或電腦開相同網址。
3. 第二台裝置應該會即時看到相同勾選狀態。

## 注意

- Firebase Web 設定會存在前端檔案，這是 Firebase Web App 的正常做法；資料保護依靠 Authentication 與 Firestore Security Rules。
- 網址不要公開貼到不相關的公開社群。
- 目前所有取得網址的人都能匿名登入、查看、勾選與新增項目，但不能刪除項目。
- 正式婚禮前，建議先用兩台裝置測試一次。
