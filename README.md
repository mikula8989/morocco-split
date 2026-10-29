# Morocco Split

Miko, Alfonso ir Lino kelionės išlaidų PWA. Programėlės kodas viešas; išlaidos laikomos privačiame Google Sheet ir kiekvieno telefono IndexedDB. Asmeniniai raktai į saugyklą nekeliami.

## Paleidimas telefone

Kai GitHub Pages įjungtas: atidaryti savo saugyklos **Settings → Pages** nurodytą svetainės adresą. Android Chrome meniu → **Add to Home screen / Install app**. iPhone Safari → **Share → Add to Home Screen**. Pirmas atidarymas turi būti su ryšiu; vėliau programėlės failus pateikia service worker.

Nustatymuose pasirinkti savo vardą, įklijuoti bendrą Apps Script `/exec` adresą ir asmeninį 64 simbolių raktą. Mokėtojas ir įrašą įvedęs asmuo yra atskiri laukai. Net be serverio adreso galima pasirinkti savo vardą ir vesti išlaidas offline.

## Vienkartinis savininko paruošimas

1. Esamame [Google Sheet](https://docs.google.com/spreadsheets/d/1v9SBMMI3Ur5kP4p-PqcVCJBU6X2sc3vTrCxxtLixqYg/edit) pasirinkti **Extensions → Apps Script**. Į `Code.gs` įklijuoti visą [apps-script/Code.gs](apps-script/Code.gs) turinį ir išsaugoti. Šis kodas skirtas būtent šiam privačiam Sheet ir esamoms 13 antraščių.
2. Pasirinkti ir paleisti **initialize**. Suteikti savo scenarijui Sheets prieigą. Sugrįžus į Sheet, vienkartiniame lange nukopijuoti tris skirtingus raktus; kiekvienam dalyviui perduoti tik jo raktą privačiai. Žurnaluose ar Sheet raktų nėra. Jei langas uždarytas, perkrauti Sheet ir **Morocco Split → Pakeisti vieno dalyvio raktą**. `initialize` esamų raktų nekeičia. Jei jau buvo sukurtas kitas scenarijus, išsaugoti jo kopiją prieš pakeičiant kodą.
3. Apps Script: **Deploy → New deployment → Web app → Execute as: Me → Who has access: Anyone → Deploy**. Savininkas suteikia prieigą savo scenarijui; dalyviai neduoda Google Drive leidimų. Nukopijuoti tik galutinę `/exec` nuorodą. „Anyone“ būtinas telefonams be Google prisijungimo, o visi duomenų skaitymo ir rašymo POST reikalauja asmeninio rakto. GET rodo tik serviso būseną.
4. Kiekvienas programėlės ⚙ nustatymuose įveda adresą ir savo raktą. Alternatyviai `/exec` adresą (jis nėra slaptas) galima įrašyti į `docs/config.js` kaip `DEFAULT_ENDPOINT`; raktų ten nedėti.

`appsscript.json` pateiktas pilnam projektui / clasp. Kopijuojant vien `Code.gs` Apps Script automatiškai aptinka reikiamus leidimus. Po kodo pakeitimo pasirinkti **Deploy → Manage deployments → Edit → New version → Deploy**, kad `/exec` vykdytų naują kodą.

## GitHub Pages

**Settings → Pages → Source: Deploy from a branch → Branch: main → Folder: /docs → Save.** Jei pasirinktas `/(root)`, šakninis `index.html` automatiškai nukreips į `docs/` programėlę. Abu variantai veikia. Jokių paslapčių, papildomų paslaugų ar build sistemos nereikia. Į PWA offline failų rinkinį patenka tik programėlės failai iš `docs/`.

## Duomenų principas

- IndexedDB viena transakcija įrašo išlaidą ir siuntimo eilės elementą. Išsaugojimo patvirtinimas rodomas tik užbaigus transakciją. Neištrinti svetainės duomenų ar programėlės, kol eilė neišsiųsta; atsarginės kopijos mygtukas eksportuoja išlaidas ir laukiančius ID, be raktų.
- Sinchronizacija vyksta atidarius, grįžus ryšiui, grįžus į programėlę, kas minutę matomame ekrane ir paspaudus „Atnaujinti“. Klaidos kartojamos su augančia 30 s–5 min pauze. Uždarytos programėlės foninio siuntimo, ypač iPhone, nežadame.
- POST `text/plain` JSON nenaudoja slapto rakto URL, JSONP, `no-cors` ar nepatvirtintų siuntimų. Google ContentService grąžina JSON per peradresavimą; fetch leidžia peradresavimą, bet eilė šalinama tik gavus ir patikrinus `ok`, dalyvį, ID patvirtinimus ir serverio įrašus. Jei naršyklė ar Google paskyros politika blokuoja atsakymą, įrašai lieka telefone, rodomas klaidos pranešimas. Tikro paskelbto `/exec` patikra būtina galutiniam sujungimui.
- Serveris naudoja ScriptLock ir patikrina visą paketą prieš rašymą. Unikalus UUID yra idempotentiškumo raktas. Tas pats ID ir turinys patvirtinamas dar kartą, pakeistas turinys su tuo pačiu ID atmetamas. Serveris perskaičiuoja EUR sumą ir dalyvius, nepasitiki kliento skaičiavimu. Sėkmė siunčiama po `SpreadsheetApp.flush()`.
- Raktų SHA-256 maišos laikomos Script Properties. Pats raktas laikomas tik dalyvio telefone ir vieną kartą rodomas savininko lange. Kiekvienas raktas leidžia perskaityti bendras kelionės išlaidas ir pridėti įrašą savo vardu. Mokėtoju galima pasirinkti bet kurį iš trijų. Pametus raktą jį galima atskirai pakeisti. Raktas suteikia prieigą kelionės įrašams, todėl jo neskelbti viešai.
- EUR centai ir valiutos smulkieji vienetai yra sveikieji skaičiai. MAD kursas automatiškai gaunamas iš [ExchangeRate-API](https://www.exchangerate-api.com/docs/free), **1 EUR = X MAD**, iki 6 skaičių po kablelio. Šaltinis atnaujina kursą kasdien; programėlė paiso kito atnaujinimo laiko ir neprašo jo dažniau nei kas valandą. Kursas saugomas atskirai IndexedDB, be ryšio naudojamas paskutinis gautas, aiškiai rodant jo datą. Jei kursas dar niekada negautas, pirmai MAD išlaidai reikia interneto; EUR nuo kurso nepriklauso. Kiekvienos išlaidos kursas fiksuojamas išsaugojant ir vėliau nekeičiamas, įskaitant offline sinchronizavimą. Tai orientacinis šaltinio kursas, ne konkretaus banko ar keityklos pasiūlymas. Centų likučiai dalijami vardų tvarka Mikas, Alfonsas, Linas. Kiekvienos išlaidos ir visos kelionės balansas yra nulinės sumos.
- Savo įvestą išlaidą galima pataisyti istorijoje paspaudus „Taisyti“. Pataisymas išsaugomas ir be ryšio; Google lentelėje atnaujinama ta pati eilutė. Taisant MAD išlaidą išlaikomas pradinis kursas. Serveris tikrina įrašo savininką ir pradinę versiją: konfliktas palieka pataisymą telefone. Senas sinchronizavimo atsakymas neištrina naujesnio pataisymo. Kitų dalyvių įrašų taisyti ar ištrinti negalima. Po išsaugojimo mygtukas trumpam pažaliuoja ir rodo „Išsaugota ✓“; suma bei balansas atsinaujina iš karto.
- „Ištrinti“ prašo patvirtinimo ir iš karto pašalina išlaidą iš istorijos bei balanso. Be ryšio pašalinimas laukia siuntimo eilėje. Google eilutėje išvaloma išlaidos informacija; lieka tik `deleted:ID`, įvedęs dalyvis ir pašalinimo laikas. Ši techninė žyma neleidžia kitam telefonui atkurti išlaidos iš senos kopijos. Gavus patvirtinimą, išlaidos duomenys ištrinami ir iš telefono. Pašalinimas perduodamas tik antros protokolo versijos užklausa: senas serveris jos nepriims ir neišsaugos išlaidos kaip aktyvios. Būtina įkelti naują `Code.gs` ir paskelbti **New version**; būsena `/exec` turi rodyti `deleting: true`. Po atnaujinimo visuose telefonuose uždaryti ir vėl atidaryti PWA.
- Taisymo funkcijai būtina atnaujinti ir `apps-script/Code.gs`, tada **Deploy → Manage deployments → Edit → New version → Deploy** (paliekant tą patį `/exec` adresą). Lentelės schema ir dalyvių raktai nesikeičia, `initialize` kartoti nereikia. Senas serveris jau sinchronizuoto įrašo pataisymą atmes; pataisymas liks telefone iki serverio atnaujinimo.
- Ši versija skirta išlaidoms; siūlomi grąžinimai nėra bankiniai pavedimai ar jų apskaita. Sheet rankiniu būdu neperrašyti ID, sumų, dalyvių ar antraščių. Sugadinta schema stabdo siuntimą išsaugant vietinę eilę.

## Patikra

Reikia Node.js 22 ar naujesnės versijos. `npm test` – skaičiavimo ir serverio idempotentiškumo, autentifikavimo, paketo atomiškumo bei formulių neutralizavimo patikros. `npm start` – vietinė peržiūra `http://127.0.0.1:4173/morocco-split/`; `/tests/db-browser.html` atlieka 8 tikros IndexedDB patikras ir pašalina tik savo bandomus įrašus, `/tests/mobile.html` rodo 390 px telefono išdėstymą. Piktogramoms iš naujo generuoti reikia `sharp`. PWA veikimui priklausomybių nėra.
