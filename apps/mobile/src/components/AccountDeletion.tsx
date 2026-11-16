import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api } from '../lib/api';
import { theme } from '../theme';

export function AccountDeletion({
  owner,
  disabled,
  onDeleted,
}: {
  owner: string;
  disabled: boolean;
  onDeleted: () => Promise<void>;
}) {
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [deleted, setDeleted] = useState(false);
  useEffect(() => {
    let alive = true;
    api('/account/deletion-status', 'GET', undefined, undefined, owner)
      .then((result) => {
        if (alive) setAvailable(result.available === true);
      })
      .catch(() => {
        if (alive)
          setMessage(
            'Account deletion availability could not be checked. Reopen Profile to retry.',
          );
      });
    return () => {
      alive = false;
    };
  }, [owner]);
  async function remove() {
    if (!confirmed || busy) return;
    setBusy(true);
    setMessage('Deleting your account...');
    try {
      if (!deleted) {
        const result = await api(
          '/account',
          'DELETE',
          { confirmation: 'DELETE' },
          undefined,
          owner,
        );
        if (result?.deleted !== true)
          throw new Error('Deletion was not confirmed. Please retry.');
        setDeleted(true);
      }
      await onDeleted();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Deletion could not be confirmed. Please retry.',
      );
    } finally {
      setBusy(false);
    }
  }
  const button = {
    padding: 14,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.line,
  };
  return (
    <View style={{ gap: 12, paddingHorizontal: 4, paddingVertical: 8 }}>
      {open && (
        <Text
          accessibilityRole="header"
          style={{ fontSize: 20, fontWeight: '600' }}
        >
          Delete account
        </Text>
      )}
      {!available ? (
        <Text style={{ color: theme.muted, fontSize: 12 }}>
          Account deletion is currently unavailable.
        </Text>
      ) : !open ? (
        <Pressable
          accessibilityRole="button"
          disabled={disabled}
          style={{ minHeight: 44, justifyContent: 'center' }}
          onPress={() => setOpen(true)}
        >
          <Text style={{ color: '#8A4935', fontSize: 13 }}>
            Delete my account
          </Text>
        </Pressable>
      ) : (
        <>
          <Text>
            This permanently deletes your account, private recipes, saved
            recipes, plans, pantry, grocery lists and spending records. It
            cannot be undone. Unsynced edits will also be removed from this
            device. Offline copies on other devices are not remotely erased by
            this action. Backup copies may remain until their retention period
            ends.
          </Text>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel="I understand account deletion is permanent"
            accessibilityState={{ checked: confirmed }}
            disabled={busy || deleted}
            style={button}
            onPress={() => setConfirmed(!confirmed)}
          >
            <Text>
              {confirmed ? '✓ ' : ''}I understand account deletion is permanent
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={disabled || busy || !confirmed}
            style={button}
            onPress={() => void remove()}
          >
            <Text>
              {busy
                ? 'Deleting account...'
                : deleted
                  ? 'Finish clearing this device'
                  : 'Permanently delete account'}
            </Text>
          </Pressable>
          {!deleted && (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              style={button}
              onPress={() => {
                setOpen(false);
                setConfirmed(false);
                setMessage('');
              }}
            >
              <Text>Keep my account</Text>
            </Pressable>
          )}
        </>
      )}
      {!!message && <Text accessibilityRole="alert">{message}</Text>}
    </View>
  );
}
