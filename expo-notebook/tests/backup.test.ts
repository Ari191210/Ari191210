import Dexie from 'dexie';
import JSZip from 'jszip';
import { afterEach, describe, expect, it } from 'vitest';
import { ExpoDB } from '../src/db/schema';
import { blankNote, blankSupplier } from '../src/db/repo';
import { buildBackup, importBackup, suppliersToCsv } from '../src/lib/backup';

const dbs: ExpoDB[] = [];
function freshDb() {
  const d = new ExpoDB(`backup-test-${Date.now()}-${dbs.length}`);
  dbs.push(d);
  return d;
}
afterEach(async () => {
  for (const d of dbs.splice(0)) {
    d.close();
    await Dexie.delete(d.name);
  }
});

const jpeg = (tag: string) => new Blob([`\xFF\xD8${tag}`], { type: 'image/jpeg' });

async function seed(d: ExpoDB) {
  await d.suppliers.bulkAdd([
    { ...blankSupplier('s1', 1000), company: 'SkyForge Robotics', priority: 'hot', follow_up: true, notes: 'MOQ 50, "fast"' },
    { ...blankSupplier('s2', 2000), company: 'SkyForge Robotics', person: 'Second booth' },
  ]);
  await d.notes.add({ ...blankNote('n1', 3000), title: 'Hall B map', text: 'Lots of props' });
  await d.photos.bulkAdd([
    { id: 'p1', owner_type: 'supplier', owner_id: 's1', blob: jpeg('a'), thumb_blob: jpeg('ta'), width: 1600, height: 1200, created_at: 10 },
    { id: 'p2', owner_type: 'supplier', owner_id: 's2', blob: jpeg('b'), thumb_blob: jpeg('tb'), width: 800, height: 600, created_at: 11 },
    { id: 'p3', owner_type: 'note', owner_id: 'n1', blob: jpeg('c'), thumb_blob: jpeg('tc'), width: 100, height: 100, created_at: 12 },
  ]);
}

describe('backup round-trip', () => {
  it('exports everything and restores it into an empty database', async () => {
    const src = freshDb();
    await seed(src);
    const { blob, filename } = await buildBackup(src);
    expect(filename).toMatch(/^expo-notebook-backup-.*\.zip$/);

    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const names = Object.keys(zip.files);
    expect(names).toEqual(
      expect.arrayContaining([
        'data.json',
        'suppliers.csv',
        'photos/SkyForge_Robotics_1.jpg',
        'photos/SkyForge_Robotics_2.jpg',
        'photos/note_Hall_B_map_1.jpg',
      ]),
    );

    const dst = freshDb();
    const stats = await importBackup(blob, dst);
    expect(stats).toEqual({ added: 3, updated: 0, skipped: 0, photosAdded: 3 });
    expect(await dst.suppliers.get('s1')).toEqual(await src.suppliers.get('s1'));
    expect(await dst.notes.get('n1')).toEqual(await src.notes.get('n1'));
    const p1 = await dst.photos.get('p1');
    expect(p1).toMatchObject({ owner_type: 'supplier', owner_id: 's1', width: 1600, height: 1200 });
    expect(new Uint8Array(await p1!.blob.arrayBuffer())).toEqual(new Uint8Array(await jpeg('a').arrayBuffer()));
    expect(await p1!.thumb_blob.text()).toBe(await jpeg('ta').text());
  });

  it('merges by id: newer updated_at wins, older is skipped, photos are not duplicated', async () => {
    const src = freshDb();
    await seed(src);
    const { blob } = await buildBackup(src);

    const dst = freshDb();
    await seed(dst);
    await dst.suppliers.update('s1', { company: 'Local edit (newer)', updated_at: 99_999 });
    await dst.suppliers.update('s2', { company: 'Local (older)', updated_at: 1 });
    await dst.suppliers.add({ ...blankSupplier('local-only', 5), company: 'Only here' });

    const stats = await importBackup(blob, dst);
    expect(stats).toEqual({ added: 0, updated: 1, skipped: 2, photosAdded: 0 });
    expect((await dst.suppliers.get('s1'))?.company).toBe('Local edit (newer)');
    expect((await dst.suppliers.get('s2'))?.company).toBe('SkyForge Robotics');
    expect(await dst.suppliers.get('local-only')).toBeDefined();
    expect(await dst.photos.count()).toBe(3);
  });

  it('rejects files that are not backups', async () => {
    const dst = freshDb();
    await expect(importBackup(new Blob(['nope']), dst)).rejects.toThrow(/not a valid/);
    const zip = new JSZip();
    zip.file('data.json', JSON.stringify({ hello: 1 }));
    await expect(importBackup(await zip.generateAsync({ type: 'blob' }), dst)).rejects.toThrow(/Not an Expo Notebook/);
  });
});

describe('suppliersToCsv', () => {
  it('escapes quotes/commas and neutralises formulas', () => {
    const csv = suppliersToCsv([{ ...blankSupplier('x', 0), company: '=HYPERLINK("x")', notes: 'a, "b"' }]);
    const line = csv.split('\r\n')[1];
    expect(line.startsWith(`"'=HYPERLINK(""x"")"`)).toBe(true);
    expect(line).toContain('"a, ""b"""');
  });
});
