import { type PoolClient } from 'pg';
import { type Member, type MemberRole, type MemberRepository } from '@sovran/domain';

export class PgMemberRepository implements MemberRepository {
  async add(
    tx: unknown,
    member: { serverId: string; userId: string; role: MemberRole },
  ): Promise<void> {
    const client = tx as PoolClient;
    await client.query(
      `INSERT INTO members (server_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (server_id, user_id) DO NOTHING`,
      [member.serverId, member.userId, member.role],
    );
  }

  async remove(tx: unknown, serverId: string, userId: string): Promise<void> {
    const client = tx as PoolClient;
    await client.query(
      `DELETE FROM members WHERE server_id = $1 AND user_id = $2`,
      [serverId, userId],
    );
  }

  async findMember(tx: unknown, serverId: string, userId: string): Promise<Member | null> {
    const client = tx as PoolClient;
    const result = await client.query(
      `SELECT server_id, user_id, role, created_at
       FROM members WHERE server_id = $1 AND user_id = $2`,
      [serverId, userId],
    );
    return result.rows[0] ? mapMemberRow(result.rows[0]) : null;
  }

  async listByServerId(tx: unknown, serverId: string): Promise<Member[]> {
    const client = tx as PoolClient;
    const result = await client.query(
      `SELECT server_id, user_id, role, created_at
       FROM members WHERE server_id = $1
       ORDER BY created_at ASC`,
      [serverId],
    );
    return result.rows.map(mapMemberRow);
  }

  async updateRole(tx: unknown, serverId: string, userId: string, role: MemberRole): Promise<void> {
    const client = tx as PoolClient;
    await client.query(
      `UPDATE members SET role = $3 WHERE server_id = $1 AND user_id = $2`,
      [serverId, userId, role],
    );
  }
}

function mapMemberRow(row: Record<string, unknown>): Member {
  return {
    serverId: String(row.server_id),
    userId: String(row.user_id),
    role: String(row.role) as MemberRole,
    createdAt: row.created_at as Date,
  };
}
