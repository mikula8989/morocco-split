export const RATE_URL = 'https://open.er-api.com/v6/latest/EUR';
const HOUR = 60 * 60 * 1000;
export function validRate(rate) {
  return Boolean(rate && Number.isSafeInteger(rate.rateMicros) && rate.rateMicros > 0 && rate.rateMicros <= 1000000000 && Number.isFinite(rate.updatedAt) && Number.isFinite(rate.nextUpdateAt) && Number.isFinite(rate.fetchedAt) && rate.nextUpdateAt > rate.updatedAt);
}
export function parseRate(data, now = Date.now()) {
  const mad = data?.rates?.MAD;
  const updatedAt = data?.time_last_update_unix * 1000;
  const nextUpdateAt = data?.time_next_update_unix * 1000;
  if(data?.result !== 'success' || data.base_code !== 'EUR' || typeof mad !== 'number' || !Number.isFinite(mad) || mad <= 0 || mad > 1000 || !Number.isFinite(updatedAt) || updatedAt <= 0 || updatedAt > now + 300000 || !Number.isFinite(nextUpdateAt) || nextUpdateAt <= updatedAt || nextUpdateAt - updatedAt > 48 * HOUR) throw new Error('Kurso šaltinis grąžino netinkamus duomenis.');
  const rate = {rateMicros:Math.round(mad * 1000000), updatedAt, nextUpdateAt, fetchedAt:now};
  if(!validRate(rate)) throw new Error('Neteisingas MAD kursas.');
  return rate;
}
export async function latestRate(cached, {fetchImpl = fetch, now = Date.now(), online = true, timeoutMs = 8000} = {}) {
  const usable = validRate(cached) ? cached : null;
  // Provider updates daily. Respect its next publication time and never poll more than hourly.
  if(usable && (!online || now < Math.max(usable.fetchedAt + HOUR, usable.nextUpdateAt))) return {rate:usable, refreshed:false, refreshFailed:false};
  if(!online) throw new Error('Pirmą kartą MAD kursui gauti reikia interneto. EUR įrašai veikia ir be jo.');
  const controller = new AbortController(), timeout = setTimeout(()=>controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(RATE_URL, {signal:controller.signal, credentials:'omit', cache:'no-store'});
    if(!response.ok) throw new Error('Kurso šaltinis nepasiekiamas.');
    const rate = parseRate(await response.json(), now);
    // Do not replace a newer cached publication with an older upstream response.
    return usable && rate.updatedAt < usable.updatedAt ? {rate:usable, refreshed:false, refreshFailed:true} : {rate, refreshed:true, refreshFailed:false};
  } catch(error) {
    if(usable) return {rate:usable, refreshed:false, refreshFailed:true};
    throw new Error('Nepavyko gauti MAD kurso. Palik įrašą ir pabandyk su internetu dar kartą.');
  } finally {clearTimeout(timeout);}
}
