import { type PoolClient } from 'pg';
import { type User, type UserRepository, anonymizeUser } from '@sovran/domain';

export class PgUserRepository implements UserRepository {
  async create(
    tx: unknown,
    user: { id: string; username: string; displayName: string; passwordHash: string },
  ): Promise<User> {
    const client = tx as PoolClient;
    const result = await client.query(
      `INSERT INTO users (id, username, display_name, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, display_name, password_hash, created_at, updated_at, deleted_at`,
      [user.id, user.username, user.displayName, user.passwordHash],
    );
    return mapUserRow(result.rows[0]);
  }

  async findByUsername(tx: unknown, username: string): Promise<User | null> {
    const client = tx as PoolClient;
    const result = await client.query(
      `SELECT id, username, display_name, password_hash, created_at, updated_at, deleted_at
       FROM users
       WHERE username = $1 AND deleted_at IS NULL`,
      [username],
    );
    return result.rows[0] ? mapUserRow(result.rows[0]) : null;
  }

  async findById(tx: unknown, id: string): Promise<User | null> {
    const client = tx as PoolClient;
    const result = await client.query(
      `SELECT id, username, display_name, password_hash, created_at, updated_at, deleted_at
       FROM users
       WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? mapUserRow(result.rows[0]) : null;
  }

  async softDelete(tx: unknown, id: string): Promise<void> {
    const client = tx as PoolClient;
    const anon = anonymizeUser(id);
    await client.query(
      `UPDATE users
       SET username = $2,
           display_name = $3,
           password_hash = $4,
           deleted_at = NOW(),
           updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL`,
      [id, anon.username, anon.displayName, anon.passwordHash],
    );
  }
}

function mapUserRow(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    username: String(row.username),
    displayName: String(row.display_name),
    passwordHash: String(row.password_hash),
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
    deletedAt: (row.deleted_at as Date | null) ?? null,
  };
}
