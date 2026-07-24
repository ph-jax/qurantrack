import { TenantActiveRepository, TenantReadRepository } from './base';
import type { D1DatabaseLike, TenantRecord } from './types';

export type OrganizationRecord = TenantRecord & { slug: string; name: string };
export type TrackRecord = TenantRecord & { code: string; name: string };
export type LevelRecord = TenantRecord & { track_id: string; code: string; name: string };
export type LessonRecord = TenantRecord & { level_id: string; code: string; name: string };
export type ClassRecord = TenantRecord & { name: string };
export type StudentRecord = TenantRecord & { display_name: string };
export type GuardianRecord = TenantRecord & { name: string; email: string };

export class OrganizationRepository {
  constructor(private readonly db: D1DatabaseLike) {}
  async findById(id: string): Promise<OrganizationRecord | null> {
    return this.db
      .prepare('SELECT * FROM organizations WHERE id = ? LIMIT 1')
      .bind(id)
      .first<OrganizationRecord>();
  }
}
export class TrackRepository extends TenantActiveRepository<TrackRecord> {
  constructor(db: D1DatabaseLike) {
    super(db, 'program_tracks');
  }
}
export class LevelRepository extends TenantActiveRepository<LevelRecord> {
  constructor(db: D1DatabaseLike) {
    super(db, 'levels');
  }
}
export class LessonRepository extends TenantActiveRepository<LessonRecord> {
  constructor(db: D1DatabaseLike) {
    super(db, 'lessons');
  }
}
export class ClassRepository extends TenantActiveRepository<ClassRecord> {
  constructor(db: D1DatabaseLike) {
    super(db, 'classes');
  }
}
export class StudentRepository extends TenantActiveRepository<StudentRecord> {
  constructor(db: D1DatabaseLike) {
    super(db, 'students');
  }
}
export class GuardianRepository extends TenantActiveRepository<GuardianRecord> {
  constructor(db: D1DatabaseLike) {
    super(db, 'guardians');
  }
}

export class MembershipRepository {
  constructor(private readonly db: D1DatabaseLike) {}
  async findTeacherMembership(organizationId: string, userId: string) {
    return this.db
      .prepare(
        "SELECT * FROM organization_memberships WHERE organization_id = ? AND user_id = ? AND role = 'teacher' AND active = 1 LIMIT 1",
      )
      .bind(organizationId, userId)
      .first();
  }
}

export class EnrollmentRepository extends TenantActiveRepository<
  TenantRecord & { class_id: string; student_id: string }
> {
  constructor(db: D1DatabaseLike) {
    super(db, 'class_enrollments');
  }
}
export class StudentGuardianRepository extends TenantReadRepository<
  TenantRecord & { student_id: string; guardian_id: string }
> {
  constructor(db: D1DatabaseLike) {
    super(db, 'student_guardians');
  }
}
export class StudentTrackLevelRepository extends TenantReadRepository<
  TenantRecord & { student_id: string; track_id: string; current_level_id: string }
> {
  constructor(db: D1DatabaseLike) {
    super(db, 'student_track_levels');
  }
}
