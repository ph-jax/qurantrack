import type { D1DatabaseLike, TenantRecord } from './types';

export class TenantReadRepository<T extends TenantRecord> {
  constructor(
    protected readonly db: D1DatabaseLike,
    protected readonly table: string,
  ) {}

  async findById(organizationId: string, id: string): Promise<T | null> {
    return this.db
      .prepare(`SELECT * FROM ${this.table} WHERE organization_id = ? AND id = ? LIMIT 1`)
      .bind(organizationId, id)
      .first<T>();
  }
}

export class TenantActiveRepository<T extends TenantRecord> extends TenantReadRepository<T> {
  async listActive(organizationId: string): Promise<T[]> {
    const result = await this.db
      .prepare(
        `SELECT * FROM ${this.table} WHERE organization_id = ? AND active = 1 ORDER BY created_at ASC`,
      )
      .bind(organizationId)
      .all<T>();
    return result.results ?? [];
  }

  async deactivate(organizationId: string, id: string, updatedAt: string): Promise<void> {
    await this.db
      .prepare(
        `UPDATE ${this.table} SET active = 0, updated_at = ? WHERE organization_id = ? AND id = ?`,
      )
      .bind(updatedAt, organizationId, id)
      .run();
  }
}
