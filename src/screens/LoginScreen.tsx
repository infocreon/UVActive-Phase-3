import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Image, ActivityIndicator } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { useAuth } from '../hooks/useAuth';
import { colors, fonts, radius, spacing } from '../theme/tokens';
import { ApiError } from '../services/api';
import { Screen } from '../components/Screen';

const logo = require('../../assets/uvactive-logo.jpg');

export function LoginScreen() {
  const { login } = useAuth();
  const [memberCode, setMemberCode] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    setLoading(true);
    try {
      await login(memberCode.trim(), pin);
      // On success, member state updates and RootNavigator swaps to
      // Main automatically. Session is persisted to SecureStore by
      // login()/tokenStore, so next app open skips this screen.
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']} style={styles.root}>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.content}>
        <View style={styles.brand}>
          <Image source={logo} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>UV Active</Text>
          <Text style={styles.subtitle}>Sign in with the Member ID + PIN your gym gave you</Text>
        </View>

        <Text style={styles.label}>Member ID</Text>
        <TextInput
          style={styles.input}
          value={memberCode}
          onChangeText={setMemberCode}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="UVA-XXXXXX"
          placeholderTextColor={colors.mutedForeground}
          editable={!loading}
        />

        <Text style={styles.label}>PIN</Text>
        <View style={styles.pinRow}>
          <TextInput
            style={[styles.input, styles.pinInput]}
            value={pin}
            onChangeText={(t) => setPin(t.replace(/[^0-9]/g, '').slice(0, 6))}
            secureTextEntry={!showPin}
            keyboardType="number-pad"
            placeholder="••••••"
            placeholderTextColor={colors.mutedForeground}
            editable={!loading}
            onSubmitEditing={submit}
            returnKeyType="go"
            maxLength={6}
          />
          <TouchableOpacity style={styles.eyeButton} onPress={() => setShowPin((v) => !v)} hitSlop={10}>
            {showPin ? <EyeOff size={18} color={colors.mutedForeground} /> : <Eye size={18} color={colors.mutedForeground} />}
          </TouchableOpacity>
        </View>

        {!!error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={submit}
          disabled={loading || !memberCode || pin.length < 4}
        >
          {loading ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={styles.submitText}>Sign In</Text>}
        </TouchableOpacity>

        <Text style={styles.footNote}>Forgot your PIN? Ask a staff member at your gym to reset it.</Text>
      </View>
    </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, justifyContent: 'center' },
  content: { paddingHorizontal: spacing.xl },
  brand: { alignItems: 'center', marginBottom: spacing.xxl },
  logo: { width: 88, height: 88, borderRadius: radius.lg, marginBottom: spacing.md },
  title: { fontFamily: fonts.heading, fontSize: 32, color: colors.foreground },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.mutedForeground, marginTop: spacing.xs, textAlign: 'center' },
  label: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.mutedForeground, marginBottom: spacing.xs, marginTop: spacing.md },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.foreground,
  },
  pinRow: { position: 'relative', justifyContent: 'center' },
  pinInput: { paddingRight: 44, letterSpacing: 4 },
  eyeButton: { position: 'absolute', right: spacing.md },
  error: { color: colors.destructive, fontFamily: fonts.body, fontSize: 13, marginTop: spacing.md },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitText: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: colors.primaryForeground },
  footNote: { color: colors.mutedForeground, textAlign: 'center', marginTop: spacing.lg, fontFamily: fonts.body, fontSize: 12 },
});
