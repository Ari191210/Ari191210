import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { ExpoDB, SCHEMA_V1 } from '../src/db/schema';
import {
  addPhoto,
  blankSupplier,
  changesSinceBackup,
  deleteOwner,
  discardIfEmpty,
  getMeta,
  saveSupplier,
  setMeta,
} from '../src/db/repo';

let counter = 0;
const names: string[] = [];
function freshName() {
  const n = `test-db-${Date.now()}-${counter++}`;
  names.push(n);
  return n;
}

afterEach(async () => {
  while (names.length) await Dexie.delete(names.pop()!);
});

describe('Dexie migrations', () => {
  it('upgrades a v1 database to the current version without losing data', async () => {
    const name = freshName();

    // Simulate an install that only ever ran schema v1, with a legacy-shaped row.
    const v1 = new Dexie(name);
    v1.version(1).stores(SCHEMA_V1);
    await v1.open();
    await v1.table('suppliers').add({
      id: 's1',
      company: 'SkyForge Robotics',
      person: 'Asha',
      priority: 'HOT', // invalid legacy value
      follow_up: 1, // truthy legacy value
      created_at: 1000,
      // updated_at, most text fields missing
    });
    await v1.table('notes').add({ id: 'n1', title: 'Hall B', text: 'x', created_at: 1, updated_at: 2 });
    await v1.table('photos').add({
      id: 'p1',
      owner_type: 'supplier',
      owner_id: 's1',
      blob: new Blob(['a']),
      thumb_blob: new Blob(['b']),
      width: 10,
      height: 10,
      created_at: 5,
    });
    v1.close();

    const db = new ExpoDB(name);
    await db.open();
    expect(db.verno).toBe(2);

    const s = await db.suppliers.get('s1');
    expect(s).toMatchObject({
      company: 'SkyForge Robotics',
      person: 'Asha',
      role: '',
      email: '',
      priority: null,
      follow_up: true,
      updated_at: 1000,
    });
    expect(await db.notes.get('n1')).toMatchObject({ title: 'Hall B' });
    expect(await db.photos.count()).toBe(1);

    // New table from v2 is usable.
    await setMeta('lastBackupAt', 123, db);
    expect(await getMeta('lastBackupAt', db)).toBe(123);
    db.close();
  });

  it('re-opening the current version is a no-op', async () => {
    const name = freshName();
    const a = new ExpoDB(name);
    await saveSupplier({ ...blankSupplier('x'), company: 'Acme' }, a);
    a.close();
    const b = new ExpoDB(name);
    expect((await b.suppliers.get('x'))?.company).toBe('Acme');
    b.close();
  });
});

describe('repo', () => {
  it('discards untouched entries but keeps ones with photos', async () => {
    const db = new ExpoDB(freshName());
    await saveSupplier(blankSupplier('empty'), db);
    await saveSupplier(blankSupplier('with-photo'), db);
    await addPhoto(
      {
        id: 'p',
        owner_type: 'supplier',
        owner_id: 'with-photo',
        blob: new Blob(['x']),
        thumb_blob: new Blob(['y']),
        width: 1,
        height: 1,
        created_at: Date.now(),
      },
      db,
    );
    expect(await discardIfEmpty('supplier', 'empty', db)).toBe(true);
    expect(await discardIfEmpty('supplier', 'with-photo', db)).toBe(false);
    expect(await db.suppliers.count()).toBe(1);

    await deleteOwner('supplier', 'with-photo', db);
    expect(await db.suppliers.count()).toBe(0);
    expect(await db.photos.count()).toBe(0);
    db.close();
  });

  it('counts changes since the last backup', async () => {
    const db = new ExpoDB(freshName());
    await saveSupplier({ ...blankSupplier('a'), company: 'A' }, db);
    expect(await changesSinceBackup(db)).toBe(1);
    await setMeta('lastBackupAt', Date.now() + 1, db);
    expect(await changesSinceBackup(db)).toBe(0);
    db.close();
  });
});
