/**
 * The bar at the foot of a screen in edit mode: how many are picked, a way to
 * unpick them, a two-press Delete, and the one thing the selection is FOR.
 *
 * ONE COMPONENT, TWO SCREENS. Recipes ends it with "Add to shopping list" and
 * the two lists end it with "Refresh"; everything to the left of that is the
 * same bar, and Sean asked for it that way (2026-08-22: "shopping selection
 * pane should look similar"). It was Recipes' own inline JSX until then, and
 * copying it across would have been two bars drifting apart from the first
 * change onwards.
 *
 * ChefMind only — upstream's Notes screen has no selection to act on, so
 * there is no twin of this file in CalMind to keep it in step with.
 */
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { themed, T } from '../theme';
import { WebHitSlop } from '../ui';

export function PickBar({
  prefix, count, onClear, onDelete, action,
}: {
  /** Names the testIDs, so each screen's controls stay findable by name. */
  prefix: string;
  count: number;
  onClear: () => void;
  onDelete: () => void;
  action: { label: string; testID: string; onPress: () => void };
}) {
  /**
   * Two presses, and the first one turns it red — the suite's delete gesture,
   * in a bar wide enough for the word rather than the round × the rows wear.
   * Sean, 2026-08-22: "a delete button that when tapped turns red to confirm".
   *
   * It disarms itself after 2.5s, so a bar left armed on a screen you walked
   * away from cannot delete on the next stray tap. Leaving edit mode unmounts
   * the whole bar, which disarms it by construction — Recipes needed an
   * effect for that when this state lived up in the screen.
   */
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const armOrDelete = () => {
    if (!armed) {
      setArmed(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setArmed(false), 2500);
      return;
    }
    clearTimeout(timer.current);
    setArmed(false);
    onDelete();
  };

  return (
    <View style={s.bar}>
      <Text style={s.count}>{count} selected</Text>
      <Pressable testID={`${prefix}-clear`} onPress={onClear} hitSlop={8} style={s.clear}>
        <WebHitSlop slop={8} />
        <Text style={s.clearText}>Clear</Text>
      </Pressable>
      {/* Delete sits BEFORE the primary action and in its own colour, so the
          thumb heading for the accent pill never lands on it. */}
      <Pressable
        testID={`${prefix}-delete`}
        accessibilityRole="button"
        accessibilityLabel={armed ? `Confirm deleting ${count}` : `Delete ${count}`}
        onPress={armOrDelete}
        style={[s.del, armed && s.delArmed]}
      >
        <Text style={[s.delText, armed && s.delTextArmed]}>{armed ? `Delete ${count}?` : 'Delete'}</Text>
      </Pressable>
      <Pressable testID={action.testID} onPress={action.onPress} style={s.go}>
        <Text style={s.goText}>{action.label}</Text>
      </Pressable>
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: T.line, backgroundColor: T.surface,
  },
  count: { color: T.dim, fontSize: 14 },
  clear: { paddingHorizontal: 6, paddingVertical: 4 },
  clearText: { color: T.muted, fontSize: 14 },
  // Delete carries the marginLeft:auto, so it and the primary action sit
  // together at the right rather than one of them floating in the middle.
  del: {
    marginLeft: 'auto', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9,
    borderWidth: 1, borderColor: T.line,
  },
  delArmed: { backgroundColor: T.danger, borderColor: T.danger },
  delText: { color: T.muted, fontSize: 14, fontWeight: '600' },
  delTextArmed: { color: '#fff' },
  go: { backgroundColor: T.accent, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  goText: { color: T.accentInk, fontSize: 14, fontWeight: '700' },
}));
