import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Eye, EyeOff, LogOut, KeyRound, User, Ruler } from 'lucide-react-native';
import { colors, fonts, radius, spacing } from '../theme/tokens';
import { useAuth } from '../hooks/useAuth';
import { membersApi, type MemberFullProfile, type Sex } from '../services/membersApi';
import { changePin, ApiError } from '../services/api';
import { Screen } from '../components/Screen';

export function SettingsScreen() {
  const { member, logout } = useAuth();
  const [profile, setProfile] = useState<MemberFullProfile | null>(null);

  const load = useCallback(() => {
    membersApi.me().then(setProfile).catch(() => {});
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <Screen edges={['top']} style={styles.root}>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Settings</Text>

      <IdentityCard profile={profile} fallbackName={member?.name} />
      {profile && <BioCard profile={profile} onSaved={setProfile} />}
      <ChangePinCard />

      <TouchableOpacity style={styles.signOutButton} onPress={() => logout()}>
        <LogOut size={18} color={colors.destructive} />
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
    </Screen>
  );
}

// ── Read-only identity — name/phone/email/member ID only change via
// the Branch Portal / Admin Panel, never from the Member App. ──────────
function IdentityCard({ profile, fallbackName }: { profile: MemberFullProfile | null; fallbackName?: string }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <User size={16} color={colors.primary} />
        <Text style={styles.cardTitle}>Profile</Text>
      </View>
      <ReadOnlyRow label="Name" value={profile?.name ?? fallbackName ?? '—'} />
      <ReadOnlyRow label="Member ID" value={profile?.memberCode ?? '—'} />
      <ReadOnlyRow label="Phone" value={profile?.phone ?? '—'} />
      <ReadOnlyRow label="Email" value={profile?.email ?? '—'} />
      <ReadOnlyRow label="Gym" value={profile?.currentGym?.name ?? 'Unassigned'} />
      <Text style={styles.note}>To change your name, phone, or email, ask staff at your gym's front desk.</Text>
    </View>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.readOnlyRow}>
      <Text style={styles.readOnlyLabel}>{label}</Text>
      <Text style={styles.readOnlyValue}>{value}</Text>
    </View>
  );
}

// ── Bio fields — the only things a member can self-edit ────────────────
function BioCard({ profile, onSaved }: { profile: MemberFullProfile; onSaved: (p: MemberFullProfile) => void }) {
  const [sex, setSex] = useState<Sex>(profile.sex ?? 'male');
  const [age, setAge] = useState(profile.ageYears?.toString() ?? '');
  const [heightCm, setHeightCm] = useState(profile.heightCm?.toString() ?? '');
  const [weightKg, setWeightKg] = useState(profile.weightKg?.toString() ?? '');
  const [restingHr, setRestingHr] = useState(profile.restingHr?.toString() ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSex(profile.sex ?? 'male');
    setAge(profile.ageYears?.toString() ?? '');
    setHeightCm(profile.heightCm?.toString() ?? '');
    setWeightKg(profile.weightKg?.toString() ?? '');
    setRestingHr(profile.restingHr?.toString() ?? '');
  }, [profile]);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await membersApi.updateBio({
        sex,
        ageYears: age ? Number(age) : undefined,
        heightCm: heightCm ? Number(heightCm) : undefined,
        weightKg: weightKg ? Number(weightKg) : undefined,
        restingHr: restingHr ? Number(restingHr) : undefined,
      });
      onSaved(updated);
      Alert.alert('Saved', 'Your details were updated. This keeps your zone, calorie, and EPOC numbers accurate.');
    } catch (e) {
      Alert.alert('Could not save', e instanceof ApiError ? e.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ruler size={16} color={colors.primary} />
        <Text style={styles.cardTitle}>Body Stats</Text>
      </View>
      <Text style={styles.note}>Used to calculate your heart-rate zones, calories, and afterburn (EPOC) accurately.</Text>

      <Text style={styles.label}>Sex</Text>
      <View style={styles.segmentRow}>
        {(['male', 'female', 'other'] as Sex[]).map((s) => (
          <TouchableOpacity key={s} style={[styles.segment, sex === s && styles.segmentActive]} onPress={() => setSex(s)}>
            <Text style={[styles.segmentText, sex === s && styles.segmentTextActive]}>{s[0].toUpperCase() + s.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Age (years)</Text>
      <TextInput style={styles.input} value={age} onChangeText={setAge} keyboardType="number-pad" placeholderTextColor={colors.mutedForeground} />

      <Text style={styles.label}>Height (cm)</Text>
      <TextInput style={styles.input} value={heightCm} onChangeText={setHeightCm} keyboardType="decimal-pad" placeholderTextColor={colors.mutedForeground} />

      <Text style={styles.label}>Weight (kg)</Text>
      <TextInput style={styles.input} value={weightKg} onChangeText={setWeightKg} keyboardType="decimal-pad" placeholderTextColor={colors.mutedForeground} />

      <Text style={styles.label}>Resting heart rate (bpm)</Text>
      <TextInput style={styles.input} value={restingHr} onChangeText={setRestingHr} keyboardType="number-pad" placeholderTextColor={colors.mutedForeground} />

      <TouchableOpacity style={styles.saveButton} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={styles.saveButtonText}>Save</Text>}
      </TouchableOpacity>
    </View>
  );
}

// ── Change PIN — member-initiated, requires current PIN ─────────────────
function ChangePinCard() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  const mismatch = confirm.length > 0 && next !== confirm;
  const tooShort = next.length > 0 && next.length !== 6;
  const valid = current.length > 0 && next.length === 6 && next === confirm;

  const submit = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await changePin(current, next);
      setCurrent(''); setNext(''); setConfirm('');
      Alert.alert('PIN updated', 'Use your new PIN next time you sign in.');
    } catch (e) {
      Alert.alert('Could not update PIN', e instanceof ApiError ? e.message : 'Check your current PIN.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <KeyRound size={16} color={colors.primary} />
        <Text style={styles.cardTitle}>Change PIN</Text>
      </View>

      <Text style={styles.label}>Current PIN</Text>
      <PinField value={current} onChangeText={setCurrent} show={show} setShow={setShow} />

      <Text style={styles.label}>New PIN (6 digits)</Text>
      <PinField value={next} onChangeText={setNext} show={show} setShow={setShow} />
      {tooShort && <Text style={styles.errorText}>PIN must be exactly 6 digits.</Text>}

      <Text style={styles.label}>Confirm new PIN</Text>
      <PinField value={confirm} onChangeText={setConfirm} show={show} setShow={setShow} />
      {mismatch && <Text style={styles.errorText}>PINs don't match.</Text>}

      <TouchableOpacity style={[styles.saveButton, !valid && styles.saveButtonDisabled]} onPress={submit} disabled={!valid || saving}>
        {saving ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={styles.saveButtonText}>Update PIN</Text>}
      </TouchableOpacity>
    </View>
  );
}

function PinField({ value, onChangeText, show, setShow }: { value: string; onChangeText: (t: string) => void; show: boolean; setShow: (v: boolean) => void }) {
  return (
    <View style={styles.pinRow}>
      <TextInput
        style={[styles.input, styles.pinInput]}
        value={value}
        onChangeText={(t) => onChangeText(t.replace(/[^0-9]/g, '').slice(0, 6))}
        secureTextEntry={!show}
        keyboardType="number-pad"
        maxLength={6}
        placeholderTextColor={colors.mutedForeground}
      />
      <TouchableOpacity style={styles.eyeButton} onPress={() => setShow(!show)} hitSlop={10}>
        {show ? <EyeOff size={17} color={colors.mutedForeground} /> : <Eye size={17} color={colors.mutedForeground} />}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  heading: { fontFamily: fonts.heading, fontSize: 24, color: colors.foreground, marginBottom: spacing.sm },
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  cardTitle: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.foreground },

  readOnlyRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  readOnlyLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.mutedForeground },
  readOnlyValue: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.foreground },

  label: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.mutedForeground, marginTop: spacing.sm, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontFamily: fonts.body, fontSize: 14, color: colors.foreground,
  },
  segmentRow: { flexDirection: 'row', gap: spacing.xs },
  segment: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingVertical: spacing.sm, alignItems: 'center' },
  segmentActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  segmentText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.mutedForeground },
  segmentTextActive: { color: colors.primaryForeground },

  pinRow: { position: 'relative', justifyContent: 'center' },
  pinInput: { paddingRight: 40, letterSpacing: 3 },
  eyeButton: { position: 'absolute', right: spacing.sm },
  errorText: { color: colors.destructive, fontFamily: fonts.body, fontSize: 11, marginTop: 4 },
  saveButton: { backgroundColor: colors.primary, borderRadius: radius.sm, paddingVertical: spacing.sm, alignItems: 'center', marginTop: spacing.md },
  saveButtonDisabled: { opacity: 0.5 },
  saveButtonText: { fontFamily: fonts.bodySemiBold, color: colors.primaryForeground, fontSize: 14 },
  note: { fontFamily: fonts.body, fontSize: 11, color: colors.mutedForeground, marginTop: spacing.xs, marginBottom: spacing.xs },

  signOutButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    borderWidth: 1, borderColor: colors.destructive, borderRadius: radius.md, paddingVertical: spacing.md, marginTop: spacing.md,
  },
  signOutText: { color: colors.destructive, fontFamily: fonts.bodySemiBold, fontSize: 15 },
});
