// Inloggen met mobiel nummer + sms-code (nummerherkenning, FO §5.1).
import { useState } from 'react';
import { Text } from 'react-native';

import { Banner, Button, Card, Field, H1, Muted, Screen } from '../components/ui';
import { formatPhone, isValidPhone, normalizePhone, toE164 } from '../domain/phone';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    setError(null);
    if (!isValidPhone(phone)) {
      setError('Vul een geldig mobiel nummer in, bijv. 06 12345678.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: toE164(phone) });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  async function verify() {
    setError(null);
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ phone: toE164(phone), token: code.trim(), type: 'sms' });
    setBusy(false);
    if (error) setError('Code onjuist of verlopen. Probeer opnieuw.');
  }

  return (
    <Screen>
      <H1>ProjectMelder</H1>
      <Muted style={{ marginBottom: 16 }}>
        Melden met spraak en foto. Je wordt herkend aan je mobiele nummer; meldingen, foto’s en spraakopnames worden
        vastgelegd met je naam, tijd en locatie.
      </Muted>
      {error && <Banner text={error} tone="danger" />}
      <Card>
        {!sent ? (
          <>
            <Field
              label="Mobiel nummer"
              placeholder="06 12345678"
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              value={phone}
              onChangeText={setPhone}
            />
            <Button title="Stuur sms-code" onPress={sendCode} busy={busy} />
          </>
        ) : (
          <>
            <Text style={{ fontSize: 16, marginBottom: 12 }}>
              Code verstuurd naar {formatPhone(normalizePhone(phone))}
            </Text>
            <Field
              label="Sms-code"
              keyboardType="number-pad"
              autoComplete="sms-otp"
              textContentType="oneTimeCode"
              value={code}
              onChangeText={setCode}
              maxLength={8}
            />
            <Button title="Inloggen" onPress={verify} busy={busy} disabled={code.trim().length < 4} />
            <Button title="Ander nummer" variant="secondary" onPress={() => (setSent(false), setCode(''))} />
          </>
        )}
      </Card>
    </Screen>
  );
}
