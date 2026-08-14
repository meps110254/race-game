import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from "firebase/auth";
import firebaseConfig from "../../firebase-applet-config.json";

// Initialize Firebase using the generated applet configuration
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Configure Google Auth provider with Drive scopes
const provider = new GoogleAuthProvider();
provider.addScope("https://www.googleapis.com/auth/drive.file");
provider.addScope("https://www.googleapis.com/auth/drive.metadata.readonly");

// In-memory access token cache (NOT in localStorage, per guidelines)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

// Event listeners to handle auth state changes in the UI reactively
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // If logged in but cache is empty (such as after reload), we prompt a sign-in or wait
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Start Google sign-in
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error("無法從 Firebase Auth 取得 Google Access Token");
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error("Sign in error:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

// Sign out
export const googleSignOut = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

// Get current cached access token
export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

const FILE_NAME = "giga_racer_profile.json";

interface BackupFileMeta {
  id: string;
  name: string;
  modifiedTime: string;
}

// 1. Check if the backup tile exists on Google Drive
export const findBackupFile = async (token: string): Promise<BackupFileMeta | null> => {
  const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`嘗試讀取 Google 雲端硬碟檔案失敗: ${response.statusText} (${errText})`);
  }

  const result = await response.json();
  if (result.files && result.files.length > 0) {
    return result.files[0]; // Get newest one
  }
  return null;
};

// 2. Upload Profile Data (Multi-part upload for creating, direct media upload for updating)
export const saveBackupToDrive = async (token: string, profileData: any): Promise<void> => {
  try {
    // Check if file already exists
    const existingFile = await findBackupFile(token);

    if (existingFile) {
      // Perform an UPDATE (PATCH)
      const url = `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`;
      const response = await fetch(url, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(profileData)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`更新雲端備份檔案失敗: ${response.statusText} (${errText})`);
      }
    } else {
      // Perform a CREATION (POST Multipart)
      const metadata = {
        name: FILE_NAME,
        mimeType: "application/json",
        description: "Giga Racer 酷幻極速 3D - 玩家個人雲端備份設定與成就檔案"
      };

      const boundary = "gigaracerboundary31415";
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelim = `\r\n--${boundary}--`;

      const body =
        delimiter +
        "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
        JSON.stringify(metadata) +
        delimiter +
        "Content-Type: application/json\r\n\r\n" +
        JSON.stringify(profileData) +
        closeDelim;

      const url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`
        },
        body: body
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`上傳全新雲端備份檔案失敗: ${response.statusText} (${errText})`);
      }
    }
  } catch (error) {
    console.error("儲存雲端硬碟備份時出錯:", error);
    throw error;
  }
};

// 3. Download Profile Data from File ID
export const downloadBackupFromDrive = async (token: string, fileId: string): Promise<any> => {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`下載雲端編號為 ${fileId} 的檔案失敗: ${response.statusText} (${errText})`);
  }

  return response.json();
};
