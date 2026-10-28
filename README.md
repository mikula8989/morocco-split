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

**Settings → Pages → Source: Deploy from a branch → Branch: main → Folder: /docs → Save.** Jokių paslapčių, papildomų paslaugų ar build sistemos nereikia. Publikuojamas tik `docs/`, serverio testai ir Apps Script kodas nepridedami prie PWA failų rinkinio.

## Duomenų principas

- IndexedDB viena transakcija įrašo išlaidą ir siuntimo eilės elementą. Išsaugojimo patvirtinimas rodomas tik užbaigus transakciją. Neištrinti svetainės duomenų ar programėlės, kol eilė neišsiųsta; atsarginės kopijos mygtukas eksportuoja išlaidas ir laukiančius ID, be raktų.
- Sinchronizacija vyksta atidarius, grįžus ryšiui, grįžus į programėlę, kas minutę matomame ekrane ir paspaudus „Atnaujinti“. Klaidos kartojamos su augančia 30 s–5 min pauze. Uždarytos programėlės foninio siuntimo, ypač iPhone, nežadame.
- POST `text/plain` JSON nenaudoja slapto rakto URL, JSONP, `no-cors` ar nepatvirtintų siuntimų. Google ContentService grąžina JSON per peradresavimą; fetch leidžia peradresavimą, bet eilė šalinama tik gavus ir patikrinus `ok`, dalyvį, ID patvirtinimus ir serverio įrašus. Jei naršyklė ar Google paskyros politika blokuoja atsakymą, įrašai lieka telefone, rodomas klaidos pranešimas. Tikro paskelbto `/exec` patikra būtina galutiniam sujungimui.
- Serveris naudoja ScriptLock ir patikrina visą paketą prieš rašymą. Unikalus UUID yra idempotentiškumo raktas. Tas pats ID ir turinys patvirtinamas dar kartą, pakeistas turinys su tuo pačiu ID atmetamas. Serveris perskaičiuoja EUR sumą ir dalyvius, nepasitiki kliento skaičiavimu. Sėkmė siunčiama po `SpreadsheetApp.flush()`.
- Raktų SHA-256 maišos laikomos Script Properties. Pats raktas laikomas tik dalyvio telefone ir vieną kartą rodomas savininko lange. Kiekvienas raktas leidžia perskaityti bendras kelionės išlaidas ir pridėti įrašą savo vardu. Mokėtoju galima pasirinkti bet kurį iš trijų. Pametus raktą jį galima atskirai pakeisti. Raktas suteikia prieigą kelionės įrašams, todėl jo neskelbti viešai.
- EUR centai ir valiutos smulkieji vienetai yra sveikieji skaičiai. MAD kursas yra **1 EUR = X MAD**, iki 6 skaičių po kablelio. Kursą įveda žmogus pagal savo keitimą; jis fiksuojamas įraše. Centų likučiai dalijami vardų tvarka Mikas, Alfonsas, Linas. Kiekvienos išlaidos ir visos kelionės balansas yra nulinės sumos.
- Įrašai nekoreguojami ir netrinami per PWA: taip išvengiama tylaus offline konfliktų perrašymo. Ši versija skirta išlaidoms; siūlomi grąžinimai nėra bankiniai pavedimai ar jų apskaita. Sheet rankiniu būdu neperrašyti ID, sumų, dalyvių ar antraščių. Sugadinta schema stabdo siuntimą išsaugant vietinę eilę.

## Patikra

Reikia Node.js 22 ar naujesnės versijos. `npm test` – skaičiavimo ir serverio idempotentiškumo, autentifikavimo, paketo atomiškumo bei formulių neutralizavimo patikros. `npm start` – vietinė peržiūra `http://127.0.0.1:4173/morocco-split/`. Papildomos priklausomybės reikalingos tik piktogramoms generuoti (`sharp`) ir naršyklės integracijos testams (`playwright`). PWA veikimui priklausomybių nėra.
