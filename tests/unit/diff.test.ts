import { describe, it, expect } from 'vitest';
import { parseGitDiff } from '../../src/services/repository/diff';

describe('Git Diff Parser Unit Tests', () => {
  it('parses raw git diff chunks into structured changed files and line ranges', () => {
    const rawDiff = `diff --git a/src/controllers/user.ts b/src/controllers/user.ts
index 123456..789abc 100644
--- a/src/controllers/user.ts
+++ b/src/controllers/user.ts
@@ -40,3 +40,5 @@
 const query = "SELECT * FROM users WHERE id = " + req.query.id;
+const result = await db.query(query);
+res.json(result);
`;

    const parsed = parseGitDiff(rawDiff);
    expect(parsed.length).toBe(1);
    expect(parsed[0].file).toBe('src/controllers/user.ts');
    expect(parsed[0].addedLines).toContain(41);
  });
});
