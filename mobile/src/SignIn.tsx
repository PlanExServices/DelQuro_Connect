import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { useSession } from './useSession';
import { Button, colors, Field, Icon, Page, Problem, PublicLinks, ui, useAction } from './ui';

export function TermsCheck({ accepted, onChange }: { accepted: boolean; onChange: (value: boolean) => void }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: accepted }} aria-checked={accepted}
      onPress={() => onChange(!accepted)} style={styles.check}>
      <Icon name={accepted ? 'checkbox' : 'square-outline'} />
      <Text style={[ui.body, { flex: 1 }]}>I agree to the Community Guidelines.</Text>
    </Pressable>
  );
}

export function SignIn({ session, demo, switchWorkspace }: {
  session: ReturnType<typeof useSession>; demo: boolean; switchWorkspace?: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [invite, setInvite] = useState('');
  const [accepted, setAccepted] = useState(false);
  const action = useAction();
  const ready = email.trim() && password && (!creating || (name.trim() && invite.trim() && accepted));

  function submit() {
    void action.run(async () => {
      const credentials = { email: email.trim(), password };
      if (creating) {
        await session.register({ ...credentials, name: name.trim(), code: invite.trim(), community_terms_accepted: true });
      } else {
        await session.signIn(credentials);
      }
    });
  }

  return (
    <Page>
      <View style={styles.brandPanel}>
        <View style={styles.mark}><Icon name="pulse" size={30} color={colors.card} /></View>
        <Text accessibilityRole="header" style={styles.brand}>DelQuro Connect</Text>
        <Text style={styles.brandDescription}>{demo ? 'Demo workspace' : 'Your veterinary team, aligned every shift.'}</Text>
      </View>
      <View style={ui.card}>
        <Text accessibilityRole="header" style={ui.subtitle}>{creating ? 'Use your invitation' : 'Sign in'}</Text>
        {creating && <Field label="Full name" value={name} onChangeText={setName} autoComplete="name" maxLength={100} />}
        <Field label="Work email" value={email} onChangeText={setEmail} autoCapitalize="none"
          autoCorrect={false} keyboardType="email-address" autoComplete="email" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry
          autoCapitalize="none" autoComplete={creating ? 'new-password' : 'current-password'} />
        {creating && <>
          <Text style={ui.muted}>Use at least 8 characters with a letter and a number.</Text>
          <Field label="Invitation code" value={invite} onChangeText={setInvite}
            autoCapitalize="characters" autoCorrect={false} maxLength={32} />
          <TermsCheck accepted={accepted} onChange={setAccepted} />
        </>}
        <Problem message={action.error} />
        <Button label={action.busy ? 'Please wait…' : creating ? 'Create account' : 'Sign in'}
          onPress={submit} disabled={!ready || action.busy} />
        <Button label={creating ? 'Back to sign in' : 'I have an invitation'} quiet disabled={action.busy} onPress={() => {
          setCreating(!creating);
          setPassword('');
          action.setError('');
        }} />
      </View>
      {switchWorkspace && <Button label={demo ? 'Back to team sign in' : 'Open demo workspace'}
        onPress={switchWorkspace} quiet disabled={action.busy} />}
      <PublicLinks workspace={session.workspace} />
    </Page>
  );
}

const styles = StyleSheet.create({
  brandPanel: { backgroundColor: colors.navy, borderRadius: 24, padding: 24, gap: 9 },
  brand: { color: colors.card, fontSize: 31, fontWeight: '800', letterSpacing: -0.55 },
  brandDescription: { color: '#D6E7EC', fontSize: 16, lineHeight: 23 },
  mark: {
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.teal,
    width: 54, height: 54, borderRadius: 17, marginBottom: 5,
  },
  check: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 9 },
});
