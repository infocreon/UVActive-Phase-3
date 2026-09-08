/**
 * UV Active — Session Control Bar v3.0 (Phase 2)
 * Phase 1 PRESERVED + Break button added.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface Props {
  isActive: boolean; isPaused: boolean; breakActive: boolean;
  onStart: () => void; onEnd: () => void; onPauseResume: () => void;
  onBreak: () => void; onBreakEnd: () => void;
}
export function SessionControlBar({ isActive, isPaused, breakActive, onStart, onEnd, onPauseResume, onBreak, onBreakEnd }: Props) {
  if (!isActive) return (
    <View style={S.bar}>
      <TouchableOpacity style={S.startBtn} onPress={onStart} activeOpacity={0.8}>
        <Text style={S.startIcon}>▶</Text>
        <Text style={S.startText}>Start Session</Text>
      </TouchableOpacity>
    </View>
  );
  if (breakActive) return (
    <View style={S.bar}>
      <View style={S.breakBadge}><Text style={S.breakBadgeTxt}>☕ BREAK</Text></View>
      <TouchableOpacity style={[S.btn, S.breakEndBtn]} onPress={onBreakEnd} activeOpacity={0.8}>
        <Text style={S.btnTxt}>▶  End Break</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[S.btn, S.endBtn]} onPress={onEnd} activeOpacity={0.8}>
        <Text style={S.btnTxt}>⏹  End Session</Text>
      </TouchableOpacity>
    </View>
  );
  return (
    <View style={S.bar}>
      <TouchableOpacity style={[S.btn, S.pauseBtn]} onPress={onPauseResume} activeOpacity={0.8}>
        <Text style={S.btnTxt}>{isPaused ? '▶  Resume' : '⏸  Pause'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[S.btn, S.breakBtn]} onPress={onBreak} activeOpacity={0.8}>
        <Text style={S.btnTxt}>☕  Break</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[S.btn, S.endBtn]} onPress={onEnd} activeOpacity={0.8}>
        <Text style={S.btnTxt}>⏹  End</Text>
      </TouchableOpacity>
    </View>
  );
}
const S = StyleSheet.create({
  bar:        { flexDirection:'row', paddingHorizontal:10, paddingVertical:7, backgroundColor:'#111', gap:8, borderBottomWidth:1, borderBottomColor:'#1a1a1a' },
  startBtn:   { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', backgroundColor:'#EF4444', borderRadius:8, paddingVertical:10, gap:6 },
  startIcon:  { color:'#fff', fontSize:14 },
  startText:  { color:'#fff', fontWeight:'800', fontSize:14, letterSpacing:0.5 },
  btn:        { flex:1, alignItems:'center', justifyContent:'center', borderRadius:8, paddingVertical:10 },
  pauseBtn:   { backgroundColor:'#374151' },
  breakBtn:   { backgroundColor:'#78350F' },
  breakEndBtn:{ backgroundColor:'#166534' },
  endBtn:     { backgroundColor:'#7F1D1D' },
  btnTxt:     { color:'#fff', fontWeight:'700', fontSize:13 },
  breakBadge: { backgroundColor:'#78350F', borderRadius:8, paddingHorizontal:10, alignItems:'center', justifyContent:'center' },
  breakBadgeTxt: { color:'#F59E0B', fontWeight:'900', fontSize:10, letterSpacing:1 },
});
