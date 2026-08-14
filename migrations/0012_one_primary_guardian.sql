-- Resolve legacy duplicate primaries deterministically before enforcing the invariant.
UPDATE student_guardians
SET primary_contact = 0
WHERE primary_contact = 1
  AND id NOT IN (
    SELECT id FROM (
      SELECT id,
             row_number() OVER (
               PARTITION BY organization_id, student_id
               ORDER BY updated_at DESC, id ASC
             ) AS position
      FROM student_guardians
      WHERE primary_contact = 1
    ) ranked
    WHERE position = 1
  );

CREATE UNIQUE INDEX idx_student_guardians_one_primary
ON student_guardians(organization_id, student_id)
WHERE primary_contact = 1;
