import type {
  ClassRepository,
  GuardianRepository,
  LevelRepository,
  LessonRepository,
  MembershipRepository,
  StudentRepository,
  TrackRepository,
} from '../repositories/core';

export class DomainValidationError extends Error {}
const ensure = (condition: unknown, message: string): void => {
  if (!condition) throw new DomainValidationError(message);
};

export async function validateLevelBelongsToTrack(
  repos: { levels: LevelRepository },
  organizationId: string,
  levelId: string,
  trackId: string,
): Promise<void> {
  const level = await repos.levels.findById(organizationId, levelId);
  ensure(level?.track_id === trackId, 'Level must belong to the selected track.');
}
export async function validateLessonBelongsToLevel(
  repos: { lessons: LessonRepository },
  organizationId: string,
  lessonId: string,
  levelId: string,
): Promise<void> {
  const lesson = await repos.lessons.findById(organizationId, lessonId);
  ensure(lesson?.level_id === levelId, 'Lesson must belong to the selected level.');
}
export async function validateTeacherForClass(
  repos: { classes: ClassRepository; memberships: MembershipRepository },
  organizationId: string,
  classId: string,
  teacherUserId: string,
): Promise<void> {
  ensure(
    await repos.classes.findById(organizationId, classId),
    'Class must belong to the organization.',
  );
  ensure(
    await repos.memberships.findTeacherMembership(organizationId, teacherUserId),
    'Teacher must belong to the same organization as the class.',
  );
}
export async function validateStudentAndClass(
  repos: { students: StudentRepository; classes: ClassRepository },
  organizationId: string,
  studentId: string,
  classId: string,
): Promise<void> {
  ensure(
    await repos.students.findById(organizationId, studentId),
    'Student must belong to the organization.',
  );
  ensure(
    await repos.classes.findById(organizationId, classId),
    'Class must belong to the organization.',
  );
}
export async function validateGuardianAndStudent(
  repos: { guardians: GuardianRepository; students: StudentRepository },
  organizationId: string,
  guardianId: string,
  studentId: string,
): Promise<void> {
  ensure(
    await repos.guardians.findById(organizationId, guardianId),
    'Guardian must belong to the organization.',
  );
  ensure(
    await repos.students.findById(organizationId, studentId),
    'Student must belong to the organization.',
  );
}
export async function validateStudentTrackLevel(
  repos: { tracks: TrackRepository; levels: LevelRepository; students: StudentRepository },
  organizationId: string,
  studentId: string,
  trackId: string,
  levelId: string,
): Promise<void> {
  ensure(
    await repos.students.findById(organizationId, studentId),
    'Student must belong to the organization.',
  );
  ensure(
    await repos.tracks.findById(organizationId, trackId),
    'Track must belong to the organization.',
  );
  await validateLevelBelongsToTrack({ levels: repos.levels }, organizationId, levelId, trackId);
}
export function validateHistoricalReferenceDeactivation(operation: 'deactivate' | 'delete'): void {
  ensure(
    operation === 'deactivate',
    'Historically referenced records must be deactivated rather than deleted.',
  );
}
