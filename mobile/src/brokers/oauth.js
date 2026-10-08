import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { SUPABASE_URL } from '../config';

// Opens the broker's login page. The broker redirects to our Edge Function, which swaps the code
// for a token using the client secret (server-side) and bounces back to the app with the token.
export async function oauthConnect(broker, buildAuthorizeUrl) {
  const returnTo = Linking.createURL('broker-callback');
  const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const state = JSON.stringify({ r: returnTo, n: nonce });
  const redirectUri = `${SUPABASE_URL}/functions/v1/broker-oauth/${broker}`;

  const res = await WebBrowser.openAuthSessionAsync(buildAuthorizeUrl(redirectUri, state), returnTo);
  if (res.type !== 'success') throw new Error('Connection cancelled');
  const { queryParams: q } = Linking.parse(res.url);
  if (q?.n !== nonce) throw new Error('Login response did not match. Try again.');
  if (q?.error) throw new Error(String(q.error));
  if (!q?.token) throw new Error('Broker did not return a token');
  return { access_token: String(q.token), expires_at: q.exp ? Number(q.exp) : null };
}

export const enc = encodeURIComponent;
