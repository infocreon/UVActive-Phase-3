/**
 * UV Active — Pre-Session Countdown Overlay
 *
 * Full-screen 10→1 countdown shown right before a scheduled session
 * actually starts, giving members a moment to get in position / settle
 * their sensor strap once the trainer confirms Start. Calls onDone()
 * when it reaches zero — the caller is responsible for firing the real
 * start-session API call at that point.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';

interface Props {
  seconds?: number;      // default 10
  onDone: () => void;
  onCancel: () => void;
}

export function CountdownOverlay({ seconds = 10, onDone, onCancel }: Props) {
  const [count, setCount] = useState(seconds);
  const scale = useRef(new Animated.Value(1)).current;
  const doneRef = useRef(false);

  useEffect(() => {
    if (count <= 0) {
      if (!doneRef.current) { doneRef.current = true; onDone(); }
      return;
    }
    scale.setValue(1.4);
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 4 }).start();
    const t = setTimeout(() => setCount(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [count]);

  return (
    <View style={S.overlay}>
      <Text style={S.label}>Starting in…</Text>
      <Animated.Text style={[S.count, { transform: [{ scale }] }]}>
        {count > 0 ? count : 'GO'}
      </Animated.Text>
      <TouchableOpacity style={S.cancelBtn} onPress={onCancel}>
        <Text style={S.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

const S = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  label:   { color: '#999', fontSize: 16, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  count:   { color: '#EF4444', fontSize: 96, fontWeight: '900' },
  cancelBtn:  { marginTop: 40, borderWidth: 1, borderColor: '#333', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  cancelText: { color: '#ccc', fontWeight: '700', fontSize: 14 },
});
