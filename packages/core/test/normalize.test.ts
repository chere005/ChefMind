import { describe, it, expect } from 'vitest';
import {
  normalize,
  FOLDER_STARTER,
  FOLDER_NOTES_STARTER,
  FOLDER_SHOPPING,
  FOLDER_PANTRY,
  SECTION_DEFAULT,
} from '../src/normalize';
import type { AnyRec, Rec } from '../src/types';

/**
 * ChefMind's shape guarantees, which are NOT CalMind's.
 *
 * Upstream this file also pins a ride-along Calendar folder, a starter
 * calendar and a habit section. This app has none of those tabs, so seeding
 * them would mean records that sync forever and are never drawn — and a
 * Calendar folder sitting in the Reminders tab that nothing can be filed into.
 * What it pins instead is the shopping list and the pantry, which are this
 * app's own.
 */
const folder = (id: string, name: string, app: 'reminders' | 'notes' = 'reminders', ord = 'V'): Rec<'folder'> => ({
  id, type: 'folder', updated: 0, payload: { name, color: '#60a5fa', ord, app },
});
const shopFolder = (id: string, ord = 'W'): Rec<'folder'> => ({
  id, type: 'folder', updated: 0, payload: { name: FOLDER_SHOPPING, color: '#f0b429', ord, app: 'reminders', shopping: true },
});
const pantryFolder = (id: string, ord = 'X'): Rec<'folder'> => ({
  id, type: 'folder', updated: 0, payload: { name: FOLDER_PANTRY, color: '#5fb6ac', ord, app: 'reminders', pantry: true },
});
const section = (id: string, folderId: string, name = 'S', ord = 'V'): Rec<'section'> => ({
  id, type: 'section', updated: 0, payload: { name, folderId, ord },
});
const reminder = (id: string, folderId: string, sectionId: string): Rec<'reminder'> => ({
  id, type: 'reminder', updated: 0,
  payload: { text: 't', due: null, time: null, done: false, repeat: null, folderId, sectionId, indent: 0, ord: 'V' },
});
const note = (id: string, folderId: string, sectionId: string): Rec<'note'> => ({
  id, type: 'note', updated: 0, payload: { title: 'n', body: '', date: null, folderId, sectionId, ord: 'V' },
});

describe('normalize — ChefMind’s shape guarantees', () => {
  it('an empty account grows THREE folders: Recipes’ General, the shopping list, the pantry', () => {
    const { added } = normalize([]);
    const folders = added.filter((r): r is Rec<'folder'> => r.type === 'folder');
    expect(folders.map((f) => f.payload.name).sort())
      .toEqual([FOLDER_NOTES_STARTER, FOLDER_SHOPPING, FOLDER_PANTRY].sort());
    expect(folders.find((f) => f.payload.name === FOLDER_SHOPPING)!.payload.shopping).toBe(true);
    expect(folders.find((f) => f.payload.name === FOLDER_PANTRY)!.payload.pantry).toBe(true);
    expect(folders.find((f) => f.payload.name === FOLDER_NOTES_STARTER)!.payload.app).toBe('notes');
    expect(added.filter((r) => r.type === 'section').length).toBe(3); // one General per folder
  });

  it('the two flags never land on one folder', () => {
    // They mean opposite things — a thing to buy and a thing already had — and
    // a folder wearing both would be counted by every reader on both sides.
    const { added } = normalize([]);
    for (const f of added.filter((r): r is Rec<'folder'> => r.type === 'folder')) {
      expect(f.payload.shopping && f.payload.pantry).toBeFalsy();
    }
  });

  it('and NO folder named Reminders, on any path', () => {
    // The whole point, and asserted by NAME rather than by count so it cannot
    // pass because the shape changed elsewhere. Sean, 2026-08-22: it "should
    // have been removed completely".
    const { added } = normalize([]);
    expect(added.filter((r) => r.type === 'folder').map((f) => (f as Rec<'folder'>).payload.name))
      .not.toContain(FOLDER_STARTER);
  });

  it('seeds no calendar and no habit section — this app has neither', () => {
    const { added } = normalize([]);
    expect(added.filter((r) => r.type === 'calendar')).toEqual([]);
    expect(added.filter((r) => r.type === 'habitsection')).toEqual([]);
    expect(added.filter((r) => r.type === 'folder' && r.payload.rideAlong)).toEqual([]);
  });

  it('the shopping list is permanent, and renaming it never makes a second', () => {
    const renamed: Rec<'folder'> = {
      id: 'sf', type: 'folder', updated: 0,
      payload: { name: 'Groceries', color: '#f0b429', ord: 'W', app: 'reminders', shopping: true },
    };
    const { added } = normalize([folder('f1', 'A'), section('s1', 'f1'), renamed, section('ss', 'sf'), pantryFolder('pf'), section('ps', 'pf'), folder('nf', 'N', 'notes'), section('ns', 'nf')]);
    expect(added.filter((r) => r.type === 'folder')).toEqual([]);
  });

  it('the pantry is permanent too, and renaming IT never makes a second', () => {
    const renamed: Rec<'folder'> = {
      id: 'pf', type: 'folder', updated: 0,
      payload: { name: 'What I have', color: '#5fb6ac', ord: 'X', app: 'reminders', pantry: true },
    };
    const { added } = normalize([shopFolder('sf'), section('ss', 'sf'), renamed, section('ps', 'pf'), folder('nf', 'N', 'notes'), section('ns', 'nf')]);
    expect(added.filter((r) => r.type === 'folder')).toEqual([]);
  });

  it('the pantry is not folded away as a stray reminders folder', () => {
    // It IS a reminders folder by `app`, and the migration below tombstones
    // every general one. Without the flag being excluded there too, the pantry
    // would be created on one load and demolished on the next, for ever.
    const { edited } = normalize([...seed()]);
    expect(edited.filter((r) => r.id === 'seed-pf')).toEqual([]);
  });

  /**
   * The one that would have been silent. Without excluding the shopping list
   * from "does a reminders folder exist?", an account whose only reminders
   * folder IS the shopping list grows no general one — and the re-homing pass
   * then files every ordinary reminder onto the shopping list.
   */
  it('a shopping list IS the reminders side — nothing general is grown beside it', () => {
    // The inversion of what this file used to pin. Upstream a shopping list
    // cannot stand in for the general folder, because CalMind has a Reminders
    // tab whose rows would all be filed onto the shopping list. Here there is
    // no such tab and no such rows: every reminder this app writes IS a
    // shopping row, so the list is the right and only home.
    const { added } = normalize([shopFolder('sf'), section('ss', 'sf'), pantryFolder('pf'), section('ps', 'pf'), folder('nf', 'N', 'notes'), section('ns', 'nf')]);
    expect(added.filter((r) => r.type === 'folder')).toEqual([]);
  });

  it('an account that already grew a Reminders folder has it folded away', () => {
    // The migration, which is the half a fresh-account test cannot reach.
    const recs: AnyRec[] = [
      folder('old-rf', FOLDER_STARTER, 'reminders', 'A'), section('old-rs', 'old-rf'),
      ...seed(),
    ];
    const { edited } = normalize(recs);
    const gone = edited.find((r) => r.id === 'old-rf') as Rec<'folder'>;
    expect(gone.deleted, 'the folder is tombstoned').toBe(true);
    expect((edited.find((r) => r.id === 'old-rs') as Rec<'section'>).deleted,
      'and its section with it').toBe(true);
  });

  it('…and its rows move to the shopping list rather than going with it', () => {
    // NEVER lose a row. This is the only place in the suite that removes a
    // container someone could have filed into, so what was inside has to land
    // somewhere real.
    const recs: AnyRec[] = [
      folder('old-rf', FOLDER_STARTER, 'reminders', 'A'), section('old-rs', 'old-rf'),
      ...seed(),
      reminder('r1', 'old-rf', 'old-rs'),
    ];
    const { edited } = normalize(recs);
    const moved = edited.find((r) => r.id === 'r1') as Rec<'reminder'>;
    expect(moved.deleted, 'the row itself survives').toBeUndefined();
    expect(moved.payload.folderId).toBe('seed-sf');
    expect(moved.payload.sectionId).toBe('seed-ss');
  });

  it('a folder with no section gets its General', () => {
    // A NOTES folder: that is the only app in this build where a person can
    // make one (the UI mounts FolderPick for 'notes' and nothing else), so it
    // is the only place the guarantee can be exercised on a folder that
    // survives the pass below.
    const { added } = normalize([folder('f1', 'Stuff', 'notes'), ...seed()]);
    const sec = added.filter((r): r is Rec<'section'> => r.type === 'section' && r.payload.folderId === 'f1');
    expect(sec.length).toBe(1);
    expect(sec[0]!.payload.name).toBe(SECTION_DEFAULT);
  });

  it('a stray reminders folder is folded away rather than given a section', () => {
    // The other half of the rule above, and the reason it had to move to a
    // notes folder: no reminders folder but the shopping list survives here,
    // so handing one a General section would be furnishing a room that is
    // about to be demolished.
    const { added, edited } = normalize([folder('f1', 'Stuff'), ...seed()]);
    expect(added.filter((r): r is Rec<'section'> => r.type === 'section' && r.payload.folderId === 'f1')).toEqual([]);
    expect((edited.find((r) => r.id === 'f1') as Rec<'folder'>).deleted).toBe(true);
  });

  it('a recipe pointing into a REMINDERS folder is pulled home to a notes folder', () => {
    const recs: AnyRec[] = [
      folder('rf', 'Rem', 'reminders'), section('rs', 'rf'),
      folder('nf', 'Recipes', 'notes'), section('ns', 'nf'),
      shopFolder('sf'), section('ss', 'sf'),
      pantryFolder('pf'), section('ps', 'pf'),
      note('n1', 'rf', 'rs'), // filed across apps — must not stand
    ];
    const { edited } = normalize(recs);
    const n = edited.find((r) => r.id === 'n1') as Rec<'note'>;
    expect(n.payload.folderId).toBe('nf');
    expect(n.payload.sectionId).toBe('ns');
  });

  it('a shopping row stays on the shopping list rather than being re-homed', () => {
    const recs: AnyRec[] = [...seed(), reminder('r1', 'seed-sf', 'seed-ss')];
    const { edited } = normalize(recs);
    expect(edited.find((r) => r.id === 'r1')).toBeUndefined();
  });

  it('a pantry row stays in the pantry', () => {
    // The rehome pass aims strays at the SHOPPING list — deliberately, since a
    // stray is something to do and the pantry is a claim about what you have.
    // A row that is already in the pantry is not a stray and must not move.
    const recs: AnyRec[] = [...seed(), reminder('r1', 'seed-pf', 'seed-ps')];
    const { edited } = normalize(recs);
    expect(edited.find((r) => r.id === 'r1')).toBeUndefined();
  });

  it('a well-formed account is left completely alone', () => {
    const { added, edited } = normalize([...seed(), reminder('r1', 'seed-sf', 'seed-ss'), note('n1', 'seed-nf', 'seed-ns')]);
    expect(added.length + edited.length).toBe(0);
  });
});

/** The starters, so a test can focus on one guarantee at a time. */
function seed(): AnyRec[] {
  return [
    folder('seed-nf', FOLDER_NOTES_STARTER, 'notes', 'B'), section('seed-ns', 'seed-nf'),
    shopFolder('seed-sf', 'C'), section('seed-ss', 'seed-sf'),
    pantryFolder('seed-pf', 'D'), section('seed-ps', 'seed-pf'),
  ];
}
