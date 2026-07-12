// 到 Firebase Console → 專案設定 → 你的應用程式 → SDK 設定與配置
// 將下方內容替換成 Firebase 提供的 firebaseConfig。
// apiKey 是網站端識別資訊，不是管理員密碼；真正的資料權限由 Firestore Rules 控制。
export const firebaseConfig = {
  apiKey: "PASTE_YOUR_API_KEY",
  authDomain: "PASTE_YOUR_PROJECT.firebaseapp.com",
  projectId: "PASTE_YOUR_PROJECT_ID",
  storageBucket: "PASTE_YOUR_PROJECT.firebasestorage.app",
  messagingSenderId: "PASTE_YOUR_SENDER_ID",
  appId: "PASTE_YOUR_APP_ID"
};
