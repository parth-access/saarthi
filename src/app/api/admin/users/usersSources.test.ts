import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { USERS_INDEX_REQUIREMENTS } from '@/domains/admin/usersTriage';

/**
 * The users screens' filtered pages depend on exactly one composite index.
 * This is the same plan↔file agreement pin the activity query uses: if the
 * query plan drifts from firestore.indexes.json, the filter fails at runtime
 * with a Firestore index error, and the operator sees a "could not be read"
 * gap instead of a list. Better to fail this test.
 */
describe('users query plan agrees with firestore.indexes.json', () => {
  it('declares every composite index the query plan needs', () => {
    const indexesFile = JSON.parse(
      readFileSync(join(process.cwd(), 'firestore.indexes.json'), 'utf-8')
    ) as { indexes: Array<{ collectionGroup: string; fields: Array<{ fieldPath: string; order: string }> }> };

    for (const requirement of USERS_INDEX_REQUIREMENTS) {
      const match = indexesFile.indexes.find(
        (index) =>
          index.collectionGroup === requirement.collectionGroup &&
          index.fields.length === requirement.fields.length &&
          requirement.fields.every(
            (field, position) =>
              index.fields[position]?.fieldPath === field.fieldPath &&
              index.fields[position]?.order === field.order
          )
      );
      expect(
        match,
        `${requirement.collectionGroup} composite on ${requirement.fields
          .map((field) => field.fieldPath)
          .join(',')} is missing from firestore.indexes.json`
      ).toBeDefined();
    }
  });
});
