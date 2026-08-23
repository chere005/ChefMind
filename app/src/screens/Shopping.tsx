/**
 * The shopping list, and the pantry beside it (Sean, 2026-08-21 / 2026-08-22).
 *
 * ONE SCREEN, TWO TABS. Both are a flat list of things named in a line of
 * text, both are ordinary `reminder` records, and the only difference between
 * them is which folder flag they read — so they are one component taking a
 * flag rather than two files that have to be kept in step. The pantry is a
 * list of what you HAVE; the shopping list is what you need. See the `pantry`
 * flag's own comment in core's types.ts.
 *
 * The shopping list fills from the Recipes tab: pick several in edit mode and
 * their ingredients arrive here, combined by core's shoppingLines — which
 * leaves out anything already in the pantry. Typing straight into the field at
 * the top works on both, because the thing you forgot is never in a recipe.
 *
 * BY AISLE, not by the order you dragged them (Sean, 2026-08-22: "shopping
 * should separate ingredients by the categories you might find them in the
 * grocery store"). A shopping list is walked, so the useful order is the route
 * through the shop. Dragging still works and still writes `ord` — but the
 * display sorts by aisle FIRST, so a drag reorders within its own aisle and a
 * row dragged into another one returns to its own. That is deliberate: the
 * aisle is derived from what the row says, so moving the row cannot change it,
 * and pretending otherwise would mean a row that silently snapped back with no
 * reason given.
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AISLES, byRecOrd, ingredientAisle, ingredientParts, newId, ordBetween, type Aisle, type Rec } from '@calmind/core';
import { useStore } from '../store';
import { themed, T } from '../theme';
import { TopBar } from '../chrome';
import { useRowDrag } from '../components/rowdrag';
import { useSwipeLeft } from '../components/swiperow';
import { EditExit } from '../components/EditExit';
import { useToast } from '../components/Toast';
import { CircleBtn, ConfirmDelete, Field, Scroll, TOPBAR_CTRL, WebHitSlop } from '../ui';

type Row = Rec<'reminder'>;

/** A row lifted from one index and set down at another. */
function moveAt<T>(rows: T[], from: number, to: number): T[] {
  const out = rows.slice();
  const [row] = out.splice(from, 1);
  if (row === undefined) return rows;
  out.splice(to, 0, row);
  return out;
}

/** The aisle a row's text belongs to — its ingredient name and its unit, the
 *  same two things core files a recipe line by. */
function aisleOf(text: string): Aisle {
  const p = ingredientParts(text);
  return ingredientAisle(p.name || text, p.unit);
}

const AISLE_INDEX = new Map<Aisle, number>(AISLES.map((a, i) => [a, i]));

type Kind = 'shopping' | 'pantry';

const COPY: Record<Kind, { title: string; add: string; empty: string; prefix: string }> = {
  shopping: {
    title: 'Shopping',
    add: 'Add an item',
    empty: 'Nothing to buy. Pick recipes in the Recipes tab to fill this in.',
    prefix: 'shopping',
  },
  pantry: {
    title: 'Pantry',
    add: 'Add something you have',
    // Says what the list DOES, because an empty pantry is indistinguishable
    // from a broken one otherwise — and the consequence (nothing is skipped)
    // is the thing worth knowing before you go shopping.
    empty: 'Nothing on hand yet. Anything listed here is left off the shopping list.',
    prefix: 'pantry',
  },
};

export function Shopping() { return <FlagList kind="shopping" />; }
export function Pantry() { return <FlagList kind="pantry" />; }

function FlagList({ kind }: { kind: Kind }) {
  const { recs, mutate } = useStore();
  const toast = useToast();
  const copy = COPY[kind];
  const [field, setField] = useState('');
  const [pageEdit, setPageEdit] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const swipe = useSwipeLeft();

  const { folder, section, rows, groups } = useMemo(() => {
    const f = recs.find(
      (r): r is Rec<'folder'> => r.type === 'folder' && !r.deleted && r.payload[kind] === true,
    );
    const sec = f
      ? recs.filter((r): r is Rec<'section'> => r.type === 'section' && !r.deleted && r.payload.folderId === f.id).sort(byRecOrd)[0]
      : undefined;
    const list = sec
      ? recs.filter((r): r is Row => r.type === 'reminder' && !r.deleted && r.payload.sectionId === sec.id).sort(byRecOrd)
      : [];
    // Aisle first, stored order within it. A stable sort is what makes the
    // second half of that true — Array.prototype.sort has been stable since
    // ES2019, and the list arrives already sorted by ord.
    const withAisle = list.map((r) => ({ r, aisle: aisleOf(r.payload.text) }));
    const ordered = withAisle
      .slice()
      .sort((a, b) => (AISLE_INDEX.get(a.aisle) ?? 99) - (AISLE_INDEX.get(b.aisle) ?? 99));
    // Runs, not a map: the display walks them in order and each needs its
    // heading drawn once, above the first row that belongs to it.
    const runs: { aisle: Aisle; rows: Row[] }[] = [];
    for (const { r, aisle } of ordered) {
      const last = runs[runs.length - 1];
      if (last && last.aisle === aisle) last.rows.push(r);
      else runs.push({ aisle, rows: [r] });
    }
    return { folder: f, section: sec, rows: ordered.map((x) => x.r), groups: runs };
  }, [recs, kind]);

  /**
   * Reordering writes a key per row from its new neighbour, walking forward —
   * exactly as the recipes-to-shopping import does, and for the same reason:
   * ordBetween(prev, null) is deterministic, so asking it the same question
   * for every row hands them all one key.
   *
   * It runs over the DISPLAY order, which is already aisle-major, so the keys
   * it writes agree with what is on screen and a drag inside an aisle lands
   * where it was dropped.
   */
  const drag = useRowDrag(rows.length, (from, to) => {
    swipe.clear();
    const next = moveAt(rows, from, to);
    mutate((e) => {
      let prev: string | null = null;
      for (const r of next) {
        prev = ordBetween(prev, null);
        if (r.payload.ord !== prev) e.put({ ...r, payload: { ...r.payload, ord: prev } });
      }
    });
  });

  const add = () => {
    const text = field.trim();
    setField('');
    if (!text || !folder || !section) return;
    const last = rows[rows.length - 1];
    mutate((e) =>
      e.put({
        id: newId(),
        type: 'reminder',
        updated: 0,
        payload: {
          text, due: null, time: null, done: false, repeat: null,
          folderId: folder.id, sectionId: section.id, indent: 0,
          ord: ordBetween(last?.payload.ord ?? null, null),
        },
      }),
    );
  };

  /**
   * A tick here is a plain flip, not core's reminderToggle.
   *
   * reminderToggle rolls a repeat forward and re-dates the row, which is right
   * for a reminder and meaningless for a thing to buy — these carry no date
   * and no repeat by construction. Flipping `done` is the whole behaviour, and
   * nothing about it can surprise a list that has none of the other fields.
   */
  const tick = (r: Row) => mutate((e) => e.put({ ...r, payload: { ...r.payload, done: !r.payload.done } }));

  const commitEdit = (r: Row) => {
    const text = editText.trim();
    setEditing(null);
    // An emptied line deletes it, the way an empty add adds nothing.
    if (text === '') mutate((e) => e.del(r.id));
    else if (text !== r.payload.text) mutate((e) => e.put({ ...r, payload: { ...r.payload, text } }));
  };

  const ticked = rows.filter((r) => r.payload.done);
  const clearTicked = () => {
    if (ticked.length === 0) return;
    mutate((e) => { for (const r of ticked) e.del(r.id); });
    toast(`${ticked.length} cleared.`);
  };

  // The flat display index of a row, which is what the drag hook counts in.
  const idxOf = (id: string) => rows.findIndex((r) => r.id === id);

  return (
    <View style={s.page}>
      <TopBar
        title={copy.title}
        controls={
          <>
            {/* Only offered when there IS something ticked: a control that
                does nothing is a control you learn to distrust. */}
            {ticked.length > 0 && (
              <CircleBtn
                testID={`${copy.prefix}-clear`}
                // NOT '␡'. That codepoint has no glyph in the app's font and
                // renders as a literal 'DEL' box — seen in the browser the
                // first time this bar drew.
                glyph="🧹"
                label={`Clear ${ticked.length} ticked`}
                size={TOPBAR_CTRL}
                color={T.dim}
                onPress={clearTicked}
              />
            )}
            <CircleBtn
              testID={`${copy.prefix}-edit`}
              glyph="✎"
              label={pageEdit ? 'Leave edit mode' : 'Edit mode — reorder'}
              size={TOPBAR_CTRL}
              color={pageEdit ? T.accent : T.dim}
              onPress={() => setPageEdit(!pageEdit)}
            />
          </>
        }
      />
      <Scroll contentContainerStyle={s.scrollWrap} scrollEnabled={drag.dragIdx === null}>
        <EditExit
          active={pageEdit || swipe.swiped !== null}
          onExit={() => { if (swipe.swiped !== null) swipe.clear(); else setPageEdit(false); }}
          style={s.scroll}
        >
          <View style={s.addRow}>
            <Field
              testID={`${copy.prefix}-add`}
              value={field}
              onChangeText={setField}
              placeholder={copy.add}
              onSubmitEditing={add}
              style={s.addField}
            />
            <CircleBtn testID={`${copy.prefix}-add-go`} glyph="+" label="Add" color={T.accent} size={26} onPress={add} />
          </View>

          {rows.length === 0 && <Text style={s.empty}>{copy.empty}</Text>}

          {groups.map((g) => (
            <View key={g.aisle}>
              {/* One heading per run. Drawn even when a single row is under
                  it: a list where some rows wear an aisle and others do not
                  reads as a bug rather than as a tidy shortcut. */}
              <Text testID={`${copy.prefix}-aisle-${g.aisle}`} style={s.aisle}>{g.aisle}</Text>
              {g.rows.map((r) => {
                const i = idxOf(r.id);
                return (
                  <View key={r.id}>
                    {drag.slot === i && <View style={s.dropLine} />}
                    <View
                      ref={drag.registerRow(i)}
                      {...(pageEdit ? {} : swipe.handlersFor(r.id))}
                      style={[s.row, drag.dragIdx === i && { opacity: 0.55, transform: [{ translateY: drag.dragDy }] }]}
                    >
                      <View
                        testID={`${copy.prefix}-grip`}
                        {...(pageEdit ? drag.handleFor(i) : {})}
                        style={[s.grip, !pageEdit && s.gripHidden]}
                        pointerEvents={pageEdit ? 'auto' : 'none'}
                        hitSlop={6}
                      >
                        <WebHitSlop slop={6} />
                        <Text style={s.gripText}>≡</Text>
                      </View>
                      <Pressable
                        testID={`${copy.prefix}-tick`}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: r.payload.done }}
                        accessibilityLabel={r.payload.text}
                        onPress={() => { if (!swipe.justSwiped()) tick(r); }}
                        hitSlop={8}
                        style={s.boxWrap}
                      >
                        <WebHitSlop slop={8} />
                        <View style={[s.box, r.payload.done && s.boxOn]}>
                          {r.payload.done && <Text style={s.boxTick}>✓</Text>}
                        </View>
                      </Pressable>
                      {editing === r.id ? (
                        <Field
                          testID={`${copy.prefix}-edit-field`}
                          value={editText}
                          onChangeText={setEditText}
                          autoFocus
                          onBlur={() => commitEdit(r)}
                          onSubmitEditing={() => commitEdit(r)}
                          style={s.editField}
                        />
                      ) : (
                        <Pressable
                          testID={`${copy.prefix}-row`}
                          style={s.rowBody}
                          onPress={() => {
                            if (swipe.justSwiped()) return;
                            if (swipe.swiped) { swipe.clear(); return; }
                            setEditing(r.id);
                            setEditText(r.payload.text);
                          }}
                        >
                          <Text style={[s.rowText, r.payload.done && s.rowDone]}>{r.payload.text}</Text>
                        </Pressable>
                      )}
                      {swipe.swiped === r.id && !pageEdit && (
                        <ConfirmDelete testID={`${copy.prefix}-del`} onDelete={() => { swipe.clear(); mutate((e) => e.del(r.id)); }} />
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
          {drag.slot === rows.length && <View style={s.dropLine} />}
          {pageEdit && <Pressable style={s.editBackdropFill} onPress={() => setPageEdit(false)} />}
        </EditExit>
      </Scroll>
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  page: { flex: 1, backgroundColor: T.bg },
  scrollWrap: { flexGrow: 1 },
  scroll: { paddingHorizontal: 12, paddingBottom: 24, flexGrow: 1 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  addField: { flex: 1 },
  empty: { color: T.muted, fontSize: 14, marginTop: 18, textAlign: 'center', lineHeight: 20 },
  // Quieter than a row and clearly above one: this is a signpost in a shop,
  // not a thing to buy, so it must never be mistaken for a line item.
  aisle: {
    color: T.dim, fontSize: 11, fontWeight: '700', letterSpacing: 0.8,
    textTransform: 'uppercase', marginTop: 14, marginBottom: 2, paddingLeft: 2,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, gap: 2 },
  grip: { width: 22, alignItems: 'center' },
  gripHidden: { opacity: 0, width: 0 },
  gripText: { color: T.muted, fontSize: 16 },
  boxWrap: { paddingRight: 10, paddingLeft: 2 },
  box: {
    width: 20, height: 20, borderRadius: 5,
    borderWidth: 2, borderColor: T.muted,
    alignItems: 'center', justifyContent: 'center',
  },
  boxOn: { backgroundColor: T.accent, borderColor: T.accent },
  boxTick: { color: T.accentInk, fontSize: 12, fontWeight: '700', lineHeight: 14 },
  rowBody: { flex: 1, paddingVertical: 2 },
  rowText: { color: T.text, fontSize: 16 },
  // Struck through and dimmed, kept in place: a bought item that JUMPS to the
  // bottom takes your eye off the shelf you are standing at.
  rowDone: { color: T.muted, textDecorationLine: 'line-through' },
  editField: { flex: 1 },
  dropLine: { height: 2, backgroundColor: T.accent, borderRadius: 1, marginVertical: 2 },
  editBackdropFill: { flexGrow: 1, minHeight: 160 },
}));
