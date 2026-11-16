import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { recoveryCredential } from '@meal/contracts';
import { supabase } from '../lib/supabase';

export function AccountRecovery({
  email,
  showTrigger = true,
}: {
  email: string;
  showTrigger?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [address, setAddress] = useState(email),
    [credential, setCredential] = useState(''),
    [password, setPassword] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    setMessage('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        address.trim(),
      );
      if (error) throw error;
      setMessage(
        'If that address has an account, a recovery email is on its way. Copy its recovery link or code here.',
      );
    } catch {
      setMessage('Recovery email could not be requested. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  async function reset() {
    if (password.length < 8) {
      setMessage('Choose a password with at least eight characters.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const token = recoveryCredential(
        credential,
        process.env.EXPO_PUBLIC_SUPABASE_URL || '',
      );
      const verified = await supabase.auth.verifyOtp(
        token.token_hash
          ? { token_hash: token.token_hash, type: 'recovery' }
          : { email: address.trim(), token: token.token!, type: 'recovery' },
      );
      if (verified.error) throw verified.error;
      const result = await supabase.auth.updateUser({ password });
      if (result.error) throw result.error;
      setPassword('');
      setCredential('');
      const signedOut = await supabase.auth.signOut();
      if (signedOut.error) throw signedOut.error;
      setMessage(
        'Password changed. Close this window and sign in with your new password.',
      );
    } catch {
      setMessage(
        'Recovery could not be completed. Check the link/code and request a new email if it expired.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {showTrigger && (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setAddress(email);
            setOpen(true);
          }}
          style={{ padding: 16 }}
        >
          <Text>Forgot password?</Text>
        </Pressable>
      )}
      <Modal
        visible={open}
        onRequestClose={() => {
          if (!busy) {
            setOpen(false);
            setCredential('');
            setPassword('');
          }
        }}
        presentationStyle="pageSheet"
      >
        <ScrollView
          contentContainerStyle={{ padding: 32, gap: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text accessibilityRole="header" style={{ fontSize: 24 }}>
            Recover your account
          </Text>
          <TextInput
            accessibilityLabel="Recovery email"
            autoCapitalize="none"
            keyboardType="email-address"
            value={address}
            onChangeText={setAddress}
            editable={!busy}
            style={{ padding: 14, borderWidth: 1 }}
          />
          <Pressable
            accessibilityRole="button"
            disabled={busy || !address.trim()}
            onPress={() => void send()}
            style={{ padding: 16 }}
          >
            <Text>Send recovery email</Text>
          </Pressable>
          <Text>
            Copy the recovery link from the email without opening it, or enter
            the recovery code if your email includes one.
          </Text>
          <TextInput
            accessibilityLabel="Recovery link or code"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            value={credential}
            onChangeText={setCredential}
            editable={!busy}
            style={{ padding: 14, borderWidth: 1 }}
          />
          <TextInput
            accessibilityLabel="New password"
            secureTextEntry
            autoCapitalize="none"
            value={password}
            onChangeText={setPassword}
            editable={!busy}
            style={{ padding: 14, borderWidth: 1 }}
          />
          <Pressable
            accessibilityRole="button"
            disabled={busy || !credential || !password}
            onPress={() => void reset()}
            style={{ padding: 16 }}
          >
            <Text>{busy ? 'Please wait...' : 'Change password'}</Text>
          </Pressable>
          {!!message && <Text accessibilityRole="alert">{message}</Text>}
          <View>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => {
                setOpen(false);
                setCredential('');
                setPassword('');
              }}
              style={{ padding: 16 }}
            >
              <Text>Close recovery</Text>
            </Pressable>
          </View>
        </ScrollView>
      </Modal>
    </>
  );
}
