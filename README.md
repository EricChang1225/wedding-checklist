# Wedding Control Center 2.1 核心版

## 新增：準備中心
原本的「前置準備」改名為「準備中心」，仍保留：
- 工作
- 準備物品
- 細項
- DRI
- 連結婚禮流程
- 完成率

## 新增：名單中心
可以手動建立：
- 喝茶名單
- 招待名單
- 伴郎伴娘
- 收禮金人員
- 送客名單
- 其他工作名單

每份名單可設定：
- 名單名稱
- 集合時間
- 集合地點
- 關聯婚禮流程
- 共同工作內容
- 備註

成員從「人員」中選取，不需要重複建立姓名。

每位成員可設定：
- 順序
- 個人工作
- 備註

目前使用者加入的名單，會自動顯示在「今天」。

## Firebase
本版新增：
- wccRosters
- wccRosterMembers

因此必須重新發布 firestore.rules。

## 更新
將 ZIP 內所有檔案覆蓋上傳 GitHub，並重新發布 firestore.rules。

測試網址：
https://ericchang1225.github.io/wedding-checklist/?v=210
