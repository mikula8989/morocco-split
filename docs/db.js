let connection;
export function openDB() {
  return connection ||= new Promise((resolve, reject) => {
    const request = indexedDB.open('morocco-split-v1', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('expenses', {keyPath:'id'});
      request.result.createObjectStore('outbox', {keyPath:'id'});
      request.result.createObjectStore('settings');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Uždaryk kitas programėlės korteles ir bandyk dar kartą.'));
  });
}
export async function transact(stores, mode, operation) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    const request = operation(tx);
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Nepavyko išsaugoti.'));
  });
}
export const all = store => transact([store], 'readonly', tx => tx.objectStore(store).getAll());
export const getSettings = () => transact(['settings'], 'readonly', tx => tx.objectStore('settings').get('profile'));
export const saveSettings = value => transact(['settings'], 'readwrite', tx => tx.objectStore('settings').put(value, 'profile'));
export const getFxRate = () => transact(['settings'], 'readonly', tx => tx.objectStore('settings').get('eur-mad-rate'));
export const saveFxRate = value => transact(['settings'], 'readwrite', tx => tx.objectStore('settings').put(value, 'eur-mad-rate'));
export async function enqueue(expense, previous = null) {
  await transact(['expenses','outbox'], 'readwrite', tx => {
    if(previous) {
      const request=tx.objectStore('expenses').get(expense.id);
      request.onsuccess=()=>{
        if(JSON.stringify(request.result)!==JSON.stringify(previous)) {tx.abort();return;}
        tx.objectStore('expenses').put(expense);tx.objectStore('outbox').put(expense);
      };
    } else {
      tx.objectStore('expenses').add(expense);
      tx.objectStore('outbox').add(expense);
    }
  });
}
export async function applySync(response, sent) {
  const allowed = new Set(sent.map(e => e.id));
  if (response?.ok !== true || !Array.isArray(response.records) || !Array.isArray(response.acked)) throw new Error(response?.error || 'Serveris nepatvirtino sinchronizavimo.');
  if (response.acked.some(id => !allowed.has(id))) throw new Error('Neteisingas serverio patvirtinimas.');
  for (const record of response.records) {
    if(record?.deleted===true && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(record.id) && ['Mikas','Alfonsas','Linas'].includes(record.recordedBy)) continue;
    if (!record || typeof record.id !== 'string' || !Number.isSafeInteger(record.eurCents) || record.eurCents <= 0 || !['Mikas','Alfonsas','Linas'].includes(record.payer) || !Array.isArray(record.participants) || !record.participants.length || record.participants.some(p=>!['Mikas','Alfonsas','Linas'].includes(p))) throw new Error('Serverio duomenys neatpažinti.');
  }
  const ids = new Set(response.records.map(e=>e.id));
  if (response.acked.some(id=>!ids.has(id))) throw new Error('Trūksta patvirtinto įrašo.');
  await transact(['expenses','outbox'], 'readwrite', tx => {
    const outbox = tx.objectStore('outbox');
    // A new entry may be added while the request is in flight. Never overwrite its pending version.
    for (const record of response.records) {
      const request = outbox.get(record.id);
      request.onsuccess = () => {
        const confirmed=response.acked.includes(record.id) && JSON.stringify(request.result)===JSON.stringify(sent.find(e=>e.id===record.id));
        if(confirmed) outbox.delete(record.id);
        // A server tombstone wins over stale edits on another phone as well.
        if(record.deleted) {outbox.delete(record.id);tx.objectStore('expenses').delete(record.id);}
        else if (!request.result || confirmed) tx.objectStore('expenses').put(record);
      };
    }
  });
}
