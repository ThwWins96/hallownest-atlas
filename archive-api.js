const apiRoot = 'https://pvgoakqldzgwcdpcfvad.supabase.co/rest/v1';
const publishableKey = 'sb_publishable_jlE4yELivrTWfRyp0IKREQ_8AIkJ5jz';

async function archiveRequest(path, body) {
  const response = await fetch(apiRoot + path, {
    method: body ? 'POST' : 'GET',
    headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) {
    const error = new Error('Запрос к общему архиву не прошёл.');
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export async function readArchive(select = 'revision,entries') {
  const [row] = await archiveRequest('/hallownest_archive?id=eq.1&select=' + select);
  if (!row) throw new Error('Общий архив не найден.');
  return row;
}

export function writeArchive(credential, expected = null, entries = null) {
  return archiveRequest('/rpc/hallownest_write_archive', {
    p_credential: credential,
    p_expected: expected,
    p_entries: entries
  });
}
