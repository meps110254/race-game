import { Award, Wrench, Users, Flame, Flag, Zap, Compass, MessageSquare, Sparkles } from "lucide-react";
import { safeStorage } from "./storage";

export interface Achievement {
  id: string;
  title: string;
  description: string;
  requirement: string;
  category: 'driving' | 'garage' | 'multiplayer' | 'special';
  iconName: string;
  unlocked: boolean;
  unlockedAt?: string;
  rewardText?: string;
}

export const DEFAULT_ACHIEVEMENTS: Achievement[] = [
  {
    id: "first_lobby",
    title: "「初試身手」 Welcome Racer",
    description: "開啟連線大賽廳，準備迎接玩家跨平台 PK！",
    requirement: "進入連線大賽廳",
    category: "multiplayer",
    iconName: "Users",
    unlocked: false,
    rewardText: "解鎖：迎新大廳特殊標記"
  },
  {
    id: "speed_demon",
    title: "「超音速狂飆」 Speed Demon",
    description: "在塞道中全速前進，將儀表板時速拉升突破 100 km/h！",
    requirement: "時速突破 100 km/h",
    category: "driving",
    iconName: "Flame",
    unlocked: false,
    rewardText: "解鎖：流光尾跡粒子特效"
  },
  {
    id: "drift_expert",
    title: "「甩尾藝術家」 Drift Maestro",
    description: "高速轉向時，按下 [空白鍵] 或 [Space] 完美蓄力甩尾！",
    requirement: "在比賽中觸發高速滑行漂移",
    category: "driving",
    iconName: "Sparkles",
    unlocked: false,
    rewardText: "解鎖：輪胎摩擦藍色電光"
  },
  {
    id: "garage_mod",
    title: "「金牌黑手」 Gearhead Phenom",
    description: "進入極速改裝車庫，對車身、烤漆、尾翼或輪胎進行全方位訂製升級！",
    requirement: "升級引擎、大改尾翼或變更樣式",
    category: "garage",
    iconName: "Wrench",
    unlocked: false,
    rewardText: "解鎖：定製賽車黃金輪胎框"
  },
  {
    id: "race_perfect",
    title: "「絕塵單圈者」 Speed King",
    description: "發揮卓越控車技巧，單圈計時低於 30 秒完成大作！",
    requirement: "以少於 30 秒的成績跑完單圈",
    category: "driving",
    iconName: "Zap",
    unlocked: false,
    rewardText: "解鎖：霓虹燈條動態律動"
  },
  {
    id: "race_complete",
    title: "「格子旗招喚者」 Race Finisher",
    description: "順利征服高難度 3D 賽道，成功越過終點線！",
    requirement: "完成任何一場 3D 競速賽",
    category: "driving",
    iconName: "Flag",
    unlocked: false,
    rewardText: "解鎖：勝利之星金黃勳章"
  },
  {
    id: "offroad_master",
    title: "「越野狂鯊」 Offroad Guru",
    description: "配備越野輪胎（Mud/Offroad），並越過非鋪裝跑道（例如沙地與草皮）！",
    requirement: "使用越野輪胎狂飆於塵濘賽道中",
    category: "special",
    iconName: "Compass",
    unlocked: false,
    rewardText: "解鎖：野性飛揚泥沙噴射"
  },
  {
    id: "active_social",
    title: "「極速社交家」 Chatty Driver",
    description: "在賽道聊天室、大廳傳送文字訊息，跟線上好手嘴砲交流！",
    requirement: "在賽事內聊天頻道、大廳發出訊息",
    category: "multiplayer",
    iconName: "MessageSquare",
    unlocked: false,
    rewardText: "解鎖：聊天狂歡泡泡動效"
  },
  {
    id: "track_designer",
    title: "「賽道設計師」 Track Designer",
    description: "發揮豐富想像力，完美設計並保存自己專屬的第一條 3D 賽道與障礙地景！",
    requirement: "自訂賽道編輯器設計完成並存檔",
    category: "special",
    iconName: "Layers",
    unlocked: false,
    rewardText: "解鎖：自訂高空光暈與特殊地景"
  }
];

// Helper to load achievements from LocalStorage
export function loadAchievements(): Achievement[] {
  try {
    const data = safeStorage.getItem("turbo_racing_achievements");
    if (!data) {
      return DEFAULT_ACHIEVEMENTS;
    }
    const parsed = JSON.parse(data) as Achievement[];
    
    // Merge existing defaults with saved items to support hot additions
    return DEFAULT_ACHIEVEMENTS.map(def => {
      const saved = parsed.find(p => p.id === def.id);
      return saved ? { ...def, unlocked: saved.unlocked, unlockedAt: saved.unlockedAt } : def;
    });
  } catch (e) {
    console.error("Failed to load achievements", e);
    return DEFAULT_ACHIEVEMENTS;
  }
}

// Helper to save achievements state to LocalStorage
export function saveAchievements(achievements: Achievement[]) {
  try {
    safeStorage.setItem("turbo_racing_achievements", JSON.stringify(achievements));
  } catch (e) {
    console.error("Failed to save achievements", e);
  }
}

// Function to trigger an achievement check
export function unlockAchievement(id: string): Achievement | null {
  const current = loadAchievements();
  const target = current.find(a => a.id === id);
  
  if (target && !target.unlocked) {
    target.unlocked = true;
    target.unlockedAt = new Date().toLocaleString();
    saveAchievements(current);
    
    // Dispatch custom event to notify React views globally
    const event = new CustomEvent("achievement-unlocked", { detail: target });
    window.dispatchEvent(event);
    
    return target;
  }
  return null;
}

// Reset helper
export function resetAchievements(): Achievement[] {
  saveAchievements(DEFAULT_ACHIEVEMENTS);
  return DEFAULT_ACHIEVEMENTS;
}
