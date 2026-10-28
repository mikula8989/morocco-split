export const PEOPLE = ['Mikas', 'Alfonsas', 'Linas'];
export function decimal(value, places = 2) {
  const text = String(value).trim().replace(',', '.');
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`).test(text)) throw new Error('Įvesk teigiamą skaičių be tūkstančių skirtukų.');
  const [whole, fraction = ''] = text.split('.');
  const result = Number(whole) * 10 ** places + Number(fraction.padEnd(places, '0'));
  if (!Number.isSafeInteger(result) || result <= 0) throw new Error('Suma arba kursas turi būti didesnis už nulį.');
  return result;
}
export function normalizeExpense(input) {
  const amountMinor = decimal(input.amount);
  if (amountMinor > 100000000) throw new Error('Didžiausia vieno įrašo suma – 1 000 000.');
  const description = String(input.description || '').trim();
  if (!description || description.length > 160) throw new Error('Aprašymas turi būti 1–160 simbolių.');
  if (!PEOPLE.includes(input.payer)) throw new Error('Pasirink mokėtoją.');
  const participants = PEOPLE.filter(p => input.participants.includes(p));
  if (!participants.length) throw new Error('Pažymėk bent vieną dalyvį.');
  if (!['EUR', 'MAD'].includes(input.currency)) throw new Error('Pasirink EUR arba MAD.');
  const rateMicros = input.currency === 'MAD' ? decimal(input.rate, 6) : 1000000;
  if (rateMicros > 1000000000) throw new Error('Patikrink kursą: 1 EUR = kiek MAD?');
  const eurCents = input.currency === 'EUR' ? amountMinor : Math.round(amountMinor * 1000000 / rateMicros);
  if (eurCents < 1 || eurCents > 100000000) throw new Error('Suma eurais turi būti nuo 0,01 iki 1 000 000.');
  return {amountMinor, currency: input.currency, rateMicros, eurCents, description, payer: input.payer, participants};
}
export function balances(entries) {
  const result = Object.fromEntries(PEOPLE.map(p => [p, 0]));
  for (const entry of entries) {
    result[entry.payer] += entry.eurCents;
    const people = PEOPLE.filter(p => entry.participants.includes(p));
    const share = Math.floor(entry.eurCents / people.length);
    const remainder = entry.eurCents % people.length;
    people.forEach((p, index) => { result[p] -= share + (index < remainder ? 1 : 0); });
  }
  return result;
}
export function settlements(net) {
  const debtors = PEOPLE.filter(p => net[p] < 0).map(p => ({person:p, cents:-net[p]}));
  const creditors = PEOPLE.filter(p => net[p] > 0).map(p => ({person:p, cents:net[p]}));
  const result = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const cents = Math.min(debtors[i].cents, creditors[j].cents);
    result.push({from:debtors[i].person, to:creditors[j].person, cents});
    debtors[i].cents -= cents; creditors[j].cents -= cents;
    if (!debtors[i].cents) i++;
    if (!creditors[j].cents) j++;
  }
  return result;
}
export const money = cents => new Intl.NumberFormat('lt-LT', {style:'currency', currency:'EUR'}).format(cents / 100);
