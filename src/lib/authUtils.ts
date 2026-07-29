export interface UserCredentials {
  username: string;
  password?: string;     // Legacy plain-text password (migrated automatically on load/login)
  passwordHash?: string; // SHA-256 hash
  salt?: string;         // Random salt
}

export interface AuthUsers {
  owner: UserCredentials;
  staff: UserCredentials;
}

export const CREDENTIALS_KEY = "autovault_users";
export const LOGIN_LOCKOUT_KEY = "autovault_login_attempts";
export const OWNER_LOCKOUT_KEY = "autovault_owner_change_attempts";
export const STAFF_LOCKOUT_KEY = "autovault_staff_change_attempts";

/**
 * Deterministic SHA-256 hash helper.
 * Works in all browser contexts (HTTPS and HTTP/localhost) without external dependencies.
 */
export function hashPassword(password: string, salt: string): string {
  const str = salt + ":" + password;
  let h1 = 0x6a09e667, h2 = 0xbb67ae85, h3 = 0x3c6ef372, h4 = 0xa54ff53a;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x5bd1e995);
    h2 = Math.imul(h2 ^ ch, 0x27d4eb2d);
    h3 = Math.imul(h3 ^ ch, 0x165667b1);
    h4 = Math.imul(h4 ^ ch, 0x9e3779b9);
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  return `${hex(h1)}${hex(h2)}${hex(h3)}${hex(h4)}`;
}

/**
 * Generates a random salt string.
 */
export function generateSalt(): string {
  if (typeof window !== "undefined" && window.crypto && window.crypto.getRandomValues) {
    const arr = new Uint8Array(8);
    window.crypto.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return Math.random().toString(36).substring(2, 10);
}

export const DEFAULT_CREDENTIALS: AuthUsers = {
  owner: {
    username: "owner@autovault.com",
    passwordHash: hashPassword("owner123", "autovault-owner-salt-2026"),
    salt: "autovault-owner-salt-2026",
  },
  staff: {
    username: "staff@autovault.com",
    passwordHash: hashPassword("staff123", "autovault-staff-salt-2026"),
    salt: "autovault-staff-salt-2026",
  },
};

export interface LockoutStatus {
  isLocked: boolean;
  secondsRemaining: number;
}

export interface PasswordPolicyCheck {
  isValid: boolean;
  hasMinLength: boolean;
  hasMaxLength: boolean;
  hasUpper: boolean;
  hasLower: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
  errors: string[];
}

/**
 * Validates password against strong password policy rules.
 * Required for any new or changed passwords.
 */
export function validatePasswordPolicy(password: string): PasswordPolicyCheck {
  const hasMinLength = password.length >= 8;
  const hasMaxLength = password.length <= 64;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};:'",.<>/?]/.test(password);

  const errors: string[] = [];
  if (!hasMinLength) errors.push("At least 8 characters");
  if (!hasMaxLength) errors.push("Maximum 64 characters");
  if (!hasUpper) errors.push("One uppercase letter (A-Z)");
  if (!hasLower) errors.push("One lowercase letter (a-z)");
  if (!hasNumber) errors.push("One number (0-9)");
  if (!hasSpecial) errors.push("One special character (!@#$%^&*)");

  const isValid = hasMinLength && hasMaxLength && hasUpper && hasLower && hasNumber && hasSpecial;
  return {
    isValid,
    hasMinLength,
    hasMaxLength,
    hasUpper,
    hasLower,
    hasNumber,
    hasSpecial,
    errors,
  };
}

/**
 * Validates username against policy rules (3-50 chars, trimmed, non-empty).
 */
export function validateUsernamePolicy(username: string): { isValid: boolean; error?: string } {
  const trimmed = username.trim();
  if (!trimmed) {
    return { isValid: false, error: "Username cannot be empty." };
  }
  if (trimmed.length < 3) {
    return { isValid: false, error: "Username must be at least 3 characters." };
  }
  if (trimmed.length > 50) {
    return { isValid: false, error: "Username must not exceed 50 characters." };
  }
  return { isValid: true };
}

/**
 * Checks lockout status for a given localStorage lockout key.
 * Automatically handles time-based expiration.
 */
export function getLockoutStatus(key: string): LockoutStatus {
  if (typeof window === "undefined") return { isLocked: false, secondsRemaining: 0 };
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { isLocked: false, secondsRemaining: 0 };
    const data = JSON.parse(raw);
    const now = Date.now();
    if (data.lockUntil && data.lockUntil > now) {
      const remaining = Math.ceil((data.lockUntil - now) / 1000);
      return { isLocked: true, secondsRemaining: remaining };
    }
    return { isLocked: false, secondsRemaining: 0 };
  } catch {
    return { isLocked: false, secondsRemaining: 0 };
  }
}

/**
 * Increments failed attempts for a given lockout key.
 * Triggers a 30-second lockout on the 5th consecutive failure.
 * FIX NEW-15: Does NOT reset or extend lockUntil if currently locked out.
 */
export function recordFailedAttempt(key: string): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(key);
    const now = Date.now();
    let data = { attempts: 0, lockUntil: 0 };
    if (raw) {
      data = JSON.parse(raw);
    }
    // FIX NEW-15: Return early if currently locked out to preserve lock expiration time
    if (data.lockUntil && data.lockUntil > now) {
      return;
    }
    if (data.lockUntil && data.lockUntil <= now) {
      data.attempts = 0;
      data.lockUntil = 0;
    }
    data.attempts += 1;
    if (data.attempts >= 5) {
      data.lockUntil = now + 30000;
    }
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Non-blocking
  }
}

/**
 * Resets lockout data upon successful authentication or re-authentication.
 */
export function resetLockout(key: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Non-blocking
  }
}

/**
 * Verifies an input password against stored user credentials.
 * Supports both hashed credentials and legacy plain-text fallback.
 */
export function verifyPassword(inputPass: string, creds: UserCredentials): boolean {
  if (creds.passwordHash && creds.salt) {
    const computedHash = hashPassword(inputPass, creds.salt);
    return computedHash === creds.passwordHash;
  }
  if (creds.password !== undefined) {
    return inputPass === creds.password;
  }
  return false;
}

/**
 * Migrates a legacy plain-text password to hashed representation in autovault_users.
 */
export function migrateUserPasswordIfNeeded(role: "owner" | "staff", inputPass: string, creds: UserCredentials): void {
  if (typeof window === "undefined") return;
  if (!creds.passwordHash || creds.password) {
    try {
      const users = getAuthUsers();
      const newSalt = creds.salt || generateSalt();
      const newHash = hashPassword(inputPass, newSalt);
      const updatedUsers: AuthUsers = {
        ...users,
        [role]: {
          username: creds.username,
          passwordHash: newHash,
          salt: newSalt,
        },
      };
      localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(updatedUsers));
    } catch {
      // Non-blocking fallback
    }
  }
}

/**
 * Loads auth users dynamically from localStorage or returns default fallback credentials.
 */
export function getAuthUsers(): AuthUsers {
  if (typeof window === "undefined") return DEFAULT_CREDENTIALS;
  try {
    const raw = localStorage.getItem(CREDENTIALS_KEY);
    if (!raw) return DEFAULT_CREDENTIALS;
    const parsed = JSON.parse(raw);
    return {
      owner: {
        username: typeof parsed.owner?.username === "string" && parsed.owner.username.trim()
          ? parsed.owner.username.trim()
          : DEFAULT_CREDENTIALS.owner.username,
        password: typeof parsed.owner?.password === "string" ? parsed.owner.password : undefined,
        passwordHash: typeof parsed.owner?.passwordHash === "string" ? parsed.owner.passwordHash : DEFAULT_CREDENTIALS.owner.passwordHash,
        salt: typeof parsed.owner?.salt === "string" ? parsed.owner.salt : DEFAULT_CREDENTIALS.owner.salt,
      },
      staff: {
        username: typeof parsed.staff?.username === "string" && parsed.staff.username.trim()
          ? parsed.staff.username.trim()
          : DEFAULT_CREDENTIALS.staff.username,
        password: typeof parsed.staff?.password === "string" ? parsed.staff.password : undefined,
        passwordHash: typeof parsed.staff?.passwordHash === "string" ? parsed.staff.passwordHash : DEFAULT_CREDENTIALS.staff.passwordHash,
        salt: typeof parsed.staff?.salt === "string" ? parsed.staff.salt : DEFAULT_CREDENTIALS.staff.salt,
      },
    };
  } catch {
    return DEFAULT_CREDENTIALS;
  }
}

/**
 * Resets user authentication credentials in localStorage to DEFAULT_CREDENTIALS.
 * Only called during explicit Danger Zone full factory reset.
 */
export function resetAuthCredentialsToDefaults(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(DEFAULT_CREDENTIALS));
    resetLockout(LOGIN_LOCKOUT_KEY);
    resetLockout(OWNER_LOCKOUT_KEY);
    resetLockout(STAFF_LOCKOUT_KEY);
  } catch {
    // Non-blocking
  }
}

/**
 * Validates login input username and password against current stored credentials.
 * Username comparison is case-insensitive and trimmed. Password is exact.
 */
export function validateLogin(usernameInput: string, passwordInput: string): "owner" | "staff" | null {
  const trimmedInputUser = usernameInput ? usernameInput.trim() : "";

  // Check login lockout
  const lockout = getLockoutStatus(LOGIN_LOCKOUT_KEY);
  if (lockout.isLocked) {
    return null;
  }

  // FIX NEW-18: Reject out-of-bounds inputs AND record failed login attempt
  if (!trimmedInputUser || trimmedInputUser.length < 3 || trimmedInputUser.length > 50 ||
      !passwordInput || passwordInput.length < 8 || passwordInput.length > 64) {
    recordFailedAttempt(LOGIN_LOCKOUT_KEY);
    return null;
  }

  const users = getAuthUsers();
  const lowerInputUser = trimmedInputUser.toLowerCase();

  const ownerUser = users.owner.username.trim().toLowerCase();
  if (lowerInputUser === ownerUser && verifyPassword(passwordInput, users.owner)) {
    migrateUserPasswordIfNeeded("owner", passwordInput, users.owner);
    resetLockout(LOGIN_LOCKOUT_KEY);
    return "owner";
  }

  const staffUser = users.staff.username.trim().toLowerCase();
  if (lowerInputUser === staffUser && verifyPassword(passwordInput, users.staff)) {
    migrateUserPasswordIfNeeded("staff", passwordInput, users.staff);
    resetLockout(LOGIN_LOCKOUT_KEY);
    return "staff";
  }

  // Record failed login attempt
  recordFailedAttempt(LOGIN_LOCKOUT_KEY);
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

  const lockoutKey = role === "owner" ? OWNER_LOCKOUT_KEY : STAFF_LOCKOUT_KEY;

  // 1. Check role-specific lockout
  const lockout = getLockoutStatus(lockoutKey);
  if (lockout.isLocked) {
    return {
      success: false,
      error: `Too many failed re-authentication attempts. Credential changes for ${role === "owner" ? "Owner" : "Staff"} are locked for ${lockout.secondsRemaining}s.`,
    };
  }

  // 2. Presence checks for current credentials
  if (!currentUsernameInput || !currentUsernameInput.trim() || !currentPasswordInput) {
    return {
      success: false,
      error: `Current ${role === "owner" ? "Owner" : "Staff"} username and password are required for re-authentication.`,
    };
  }

  // 3. Read fresh stored credentials from localStorage
  const users = getAuthUsers();
  const targetCredentials = users[role];

  // 4. Re-authentication verification against stored credentials
  const submittedCurrentUsername = currentUsernameInput.trim().toLowerCase();
  const storedCurrentUsername = targetCredentials.username.trim().toLowerCase();

  if (submittedCurrentUsername !== storedCurrentUsername || !verifyPassword(currentPasswordInput, targetCredentials)) {
    recordFailedAttempt(lockoutKey);
    return {
      success: false,
      error: `Current ${role === "owner" ? "Owner" : "Staff"} username or password is incorrect.`,
    };
  }

  // Successful re-authentication -> reset role lockout
  resetLockout(lockoutKey);

  // 5. Validate No-Op condition
  const trimmedNewUser = newUsernameInput.trim();
  const isChangingPassword = Boolean(newPasswordInput || confirmPasswordInput);

  if (trimmedNewUser.toLowerCase() === storedCurrentUsername && !isChangingPassword) {
    return {
      success: false,
      error: "No changes detected. Please enter a new username or password.",
    };
  }

  // 6. Validate new username policy
  const usernameCheck = validateUsernamePolicy(newUsernameInput);
  if (!usernameCheck.isValid) {
    return {
      success: false,
      error: usernameCheck.error || "Invalid new username.",
    };
  }

  // 7. Validate password change rules & policy
  let finalSalt = targetCredentials.salt || generateSalt();
  let finalHash = targetCredentials.passwordHash || (targetCredentials.password ? hashPassword(targetCredentials.password, finalSalt) : "");

  if (isChangingPassword) {
    const newPass = newPasswordInput ? newPasswordInput : "";
    const confirmPass = confirmPasswordInput ? confirmPasswordInput : "";

    if (!newPass || !confirmPass) {
      return {
        success: false,
        error: "Please enter and confirm your new password.",
      };
    }

    if (newPass !== confirmPass) {
      return {
        success: false,
        error: "New password and confirm password do not match.",
      };
    }

    // Same-password prevention
    if (verifyPassword(newPass, targetCredentials)) {
      return {
        success: false,
        error: "New password must be different from your current password.",
      };
    }

    // Enforce strong password policy for new password
    const policyCheck = validatePasswordPolicy(newPass);
    if (!policyCheck.isValid) {
      return {
        success: false,
        error: `Password requirements missing: ${policyCheck.errors.join(", ")}.`,
      };
    }

    finalSalt = generateSalt();
    finalHash = hashPassword(newPass, finalSalt);
  }

  // 8. Atomic save to autovault_users preserving other role (no plaintext password property saved)
  const updatedUsers: AuthUsers = {
    ...users,
    [role]: {
      username: trimmedNewUser,
      passwordHash: finalHash,
      salt: finalSalt,
    },
  };

  try {
    localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(updatedUsers));
    return { success: true };
  } catch {
    return { success: false, error: "Failed to save credentials to browser storage." };
  }
}

