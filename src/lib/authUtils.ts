export interface UserCredentials {
  username: string;
  password: string;
}

export interface AuthUsers {
  owner: UserCredentials;
  staff: UserCredentials;
}

export const CREDENTIALS_KEY = "autovault_users";

export const DEFAULT_CREDENTIALS: AuthUsers = {
  owner: { username: "owner@autovault.com", password: "owner123" },
  staff: { username: "staff@autovault.com", password: "staff123" },
};

/**
 * Loads auth users from localStorage or returns defaults if not configured.
 */
export function getAuthUsers(): AuthUsers {
  if (typeof window === "undefined") return DEFAULT_CREDENTIALS;
  try {
    const raw = localStorage.getItem(CREDENTIALS_KEY);
    if (!raw) return DEFAULT_CREDENTIALS;
    const parsed = JSON.parse(raw);
    return {
      owner: {
        username: typeof parsed.owner?.username === "string" ? parsed.owner.username : DEFAULT_CREDENTIALS.owner.username,
        password: typeof parsed.owner?.password === "string" ? parsed.owner.password : DEFAULT_CREDENTIALS.owner.password,
      },
      staff: {
        username: typeof parsed.staff?.username === "string" ? parsed.staff.username : DEFAULT_CREDENTIALS.staff.username,
        password: typeof parsed.staff?.password === "string" ? parsed.staff.password : DEFAULT_CREDENTIALS.staff.password,
      },
    };
  } catch {
    return DEFAULT_CREDENTIALS;
  }
}

/**
 * Validates input username and password against stored credentials.
 * Username comparison is case-insensitive and trimmed. Password is exact.
 */
export function validateLogin(usernameInput: string, passwordInput: string): "owner" | "staff" | null {
  const users = getAuthUsers();
  const trimmedInputUser = usernameInput.trim().toLowerCase();

  const ownerUser = users.owner.username.trim().toLowerCase();
  if (trimmedInputUser === ownerUser && passwordInput === users.owner.password) {
    return "owner";
  }

  const staffUser = users.staff.username.trim().toLowerCase();
  if (trimmedInputUser === staffUser && passwordInput === users.staff.password) {
    return "staff";
  }

  return null;
}

/**
 * Updates credentials for a specific role after mandatory re-authentication.
 */
export function updateRoleCredentials(params: {
  role: "owner" | "staff";
  currentUsernameInput: string;
  currentPasswordInput: string;
  newUsernameInput: string;
  newPasswordInput?: string;
  confirmPasswordInput?: string;
}): { success: boolean; error?: string } {
  const {
    role,
    currentUsernameInput,
    currentPasswordInput,
    newUsernameInput,
    newPasswordInput,
    confirmPasswordInput,
  } = params;

  const users = getAuthUsers();
  const targetCredentials = users[role];

  // 1. Mandatory re-authentication check
  const trimmedCurrentInputUser = currentUsernameInput.trim().toLowerCase();
  const storedTargetUser = targetCredentials.username.trim().toLowerCase();

  if (trimmedCurrentInputUser !== storedTargetUser || currentPasswordInput !== targetCredentials.password) {
    return {
      success: false,
      error: `Current ${role === "owner" ? "Owner" : "Staff"} username or password is incorrect.`,
    };
  }

  // 2. Validate new username
  const trimmedNewUser = newUsernameInput.trim();
  if (!trimmedNewUser) {
    return {
      success: false,
      error: "New username cannot be empty.",
    };
  }

  // 3. Validate new password if changing password
  let finalPassword = targetCredentials.password;
  const isChangingPassword = Boolean(newPasswordInput || confirmPasswordInput);

  if (isChangingPassword) {
    if (!newPasswordInput) {
      return { success: false, error: "New password cannot be empty." };
    }
    if (newPasswordInput !== confirmPasswordInput) {
      return { success: false, error: "New password and confirm password do not match." };
    }
    finalPassword = newPasswordInput;
  }

  // 4. Save updated credentials to autovault_users
  const updatedUsers: AuthUsers = {
    ...users,
    [role]: {
      username: trimmedNewUser,
      password: finalPassword,
    },
  };

  try {
    localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(updatedUsers));
    return { success: true };
  } catch {
    return { success: false, error: "Failed to save credentials to browser storage." };
  }
}
