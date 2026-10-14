# 霓虹城寨 — 灰盒原型
# Neon Walled City — Graybox Prototype

九龍城寨類魂動作遊戲垂直切片：**渠底巷**（鎖喉 Boss、阿婆茶檔、消防喉捷徑）。  
Kowloon Walled City Souls-like vertical slice: **渠底巷 / Canal Alley** (the Chokehold boss, Granny’s tea stall, and the fire-hose shortcut).

瀏覽器可玩（HTML + Three.js），唔使 Godot / Unity。  
Playable in the browser (HTML + Three.js). No Godot or Unity.

設計文件 / Design doc：[`docs/霓虹城寨-GDD.md`](docs/霓虹城寨-GDD.md)

## 點樣跑 / How to run

喺專案根目錄：

```bash
npm start
# 等同 / same as:
python3 -m http.server 5173
```

瀏覽器打開 `http://localhost:5173`。純靜態檔，亦可用 `npx serve` 或其他 static server。  
Open `http://localhost:5173`. Static files only; `npx serve` or any other static server also works.

## 操作 / Controls

| 鍵 / Key | 功能 / Action |
|----------|----------------|
| **W A S D** | 移動 / Move |
| **滑鼠 / Mouse** | 視角（點擊畫面鎖定指針）/ Look (click to lock pointer) |
| **Shift** | 衝刺（耗耐力）/ Sprint (costs stamina) |
| **滑鼠左鍵 / LMB** | 輕擊 / Light attack |
| **F** | 重擊（破架）/ Heavy attack (breaks guard) |
| **滑鼠右鍵 / RMB** | 架擋（按住；著地瞬間＝完美架擋）/ Block (hold; block on landing = perfect block) |
| **Space** | 迴避滾（有短暫無敵）/ Dodge roll (brief i-frames) |
| **E** | 互動（拾取／篝火／捷徑／鐵閘）/ Interact (pickup / bonfire / shortcut / gate) |
| **R** | 用香火燈芯回血 / Heal with an incense wick |

耐力空晒就只能慢行。鎖喉嘅**抓取唔可以擋**，一定要滾走。敵人架勢清空後走近輕擊可「斬名」。  
Empty stamina forces a slow walk. The Chokehold’s **grab cannot be blocked** — roll away. When an enemy’s posture breaks, step in and light-attack to “cut the name”.

## 關卡路線 / Route（渠底巷）

A 渠口 → B 直巷（街坊殘影×2）→ B1 儲物間戰利品 → C 十字 → C1 水鬼 / D 掃蕩隊 → E 機房前室（混合×3）→ E1 消防喉捷徑 → F 門廊 → H **鎖喉** → G **阿婆茶檔** → I 鐵閘（即將開放）

Canal mouth → straight alley (2 echoes) → storeroom loot → crossroads → drowned ghost / sweepers → plant anteroom → fire-hose shortcut → porch → **Chokehold** → **Granny’s tea stall** → iron gate (not yet open).

捷徑開咗之後，喺茶檔左側按 **E** 可跳返渠口。  
After the shortcut is open, press **E** on the left side of the tea stall to return to the canal mouth.

## 資料夾 / Layout

```
index.html
css/style.css
js/main.js      # 主循環 / main loop
js/player.js    # 玩家／鏡頭／戰鬥 / player, camera, combat
js/enemies.js   # 雜兵＋鎖喉 / mobs + Chokehold
js/level.js     # 灰盒關卡／碰撞／互動 / graybox, collision, interact
js/input.js
js/ui.js
docs/霓虹城寨-GDD.md
```
