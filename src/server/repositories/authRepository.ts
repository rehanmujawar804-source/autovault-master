import { pool } from "../db/client";
import { DbClient } from "../db/txRunner";
import { User, UserSession, NewUserInput, NewSessionInput } from "./types";

export const authRepository = {
  /**
   * Finds a user by ID.
   */
  async findUserById(id: string, client: DbClient = pool): Promise<User | null> {
    const res = await client.query(
      `SELECT * FROM users WHERE id = $1`,
      [id]
    );
    return res.rows[0] ? this.mapRowToUser(res.rows[0]) : null;
  },

  /**
   * Finds a user by username (case-insensitive in schema but we do basic lookup here).
   */
  async findUserByUsername(username: string, client: DbClient = pool): Promise<User | null> {
    const res = await client.query(
      `SELECT * FROM users WHERE lower(username) = lower($1)`,
      [username]
    );
    return res.rows[0] ? this.mapRowToUser(res.rows[0]) : null;
  },

  /**
   * Creates a new user.
   */
  async createUser(user: NewUserInput, client: DbClient = pool): Promise<User> {
    const res = await client.query(
      `INSERT INTO users (
        username, password_hash, salt, legacy_hash, role
      ) VALUES (
        $1, $2, $3, $4, $5
      ) RETURNING *`,
      [
        user.username,
        user.passwordHash,
        user.salt || null,
        user.legacyHash,
        user.role
      ]
    );
    return this.mapRowToUser(res.rows[0]);
  },

  /**
   * Creates a new session.
   */
  async createSession(session: NewSessionInput, client: DbClient = pool): Promise<UserSession> {
    const res = await client.query(
      `INSERT INTO user_sessions (
        user_id, token_hash, role, expires_at
      ) VALUES (
        $1, $2, $3, $4
      ) RETURNING *`,
      [
        session.userId,
        session.tokenHash,
        session.role,
        session.expiresAt
      ]
    );
    return this.mapRowToSession(res.rows[0]);
  },

  /**
   * Finds a session by token hash.
   */
  async findSessionByTokenHash(tokenHash: string, client: DbClient = pool): Promise<UserSession | null> {
    const res = await client.query(
      `SELECT * FROM user_sessions WHERE token_hash = $1`,
      [tokenHash]
    );
    return res.rows[0] ? this.mapRowToSession(res.rows[0]) : null;
  },

  /**
   * Deletes a session by token hash.
   */
  async deleteSession(tokenHash: string, client: DbClient = pool): Promise<void> {
    await client.query(
      `DELETE FROM user_sessions WHERE token_hash = $1`,
      [tokenHash]
    );
  },

  /**
   * Deletes expired sessions.
   */
  async deleteExpiredSessions(client: DbClient = pool): Promise<void> {
    await client.query(
      `DELETE FROM user_sessions WHERE expires_at < NOW()`
    );
  },

  mapRowToUser(row: any): User {
    return {
      id: row.id,
      username: row.username,
      passwordHash: row.password_hash,
      salt: row.salt,
      legacyHash: row.legacy_hash,
      role: row.role,
      isActive: row.is_active,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    };
  },

  mapRowToSession(row: any): UserSession {
    return {
      id: row.id,
      userId: row.user_id,
      tokenHash: row.token_hash,
      role: row.role,
      expiresAt: row.expires_at.toISOString(),
      createdAt: row.created_at.toISOString()
    };
  }
};
