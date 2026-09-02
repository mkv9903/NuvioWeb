# Plugin runtime Web TV

Questo documento descrive l'implementazione del sistema plugin nel checkout Web TV effettivo:
`NuvioMedia/NuvioTVSmart`. Il nome `NuvioTV-Web` usato nella richiesta non corrisponde a una
directory presente in questo workspace.

## Decisione di compatibilità

Il contratto di comportamento resta quello Android, ma il codice eseguibile Web è limitato al
tipo `NUVIO_JS`.

| Tipo sorgente           | Web TV                              | Comportamento                                                                                                                               |
| ----------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `NUVIO_JS`              | supportato solo dopo i gate runtime | manifest e codice JavaScript vengono validati, messi in cache ed eseguiti nel Worker QuickJS                                                |
| `EXTERNAL_DEX` / `.cs3` | non eseguibile                      | URL, nome, stato e metadati vengono conservati; il binario non viene scaricato, convertito o eseguito; al sync passa solo la riga tipizzata |
| `LEGACY`                | non eseguibile                      | sorgente storico conservato per compatibilità e mostrato come sola informazione                                                             |
| `UNKNOWN` o tipo futuro | non eseguibile                      | riga opaca conservata; l'esecuzione è disabilitata e non viene reinterpretata in base al contenuto                                          |

Il browser desktop non è un runtime di produzione per i plugin. Add-on, playback, libreria,
profili e sincronizzazione restano indipendenti dal gate dei plugin. Un `.cs3` viene classificato
come `EXTERNAL_DEX` anche se una vecchia riga locale o remota dichiara erroneamente `NUVIO_JS`.

## Contratto Android adottato

Sono stati allineati i punti che influenzano il risultato visibile:

- manifest con `name`, `version`, `description`, `author` e lista `scrapers`;
- provider con `id`, `name`, `version`, `filename`, `supportedTypes`, `enabled`, lingua,
  piattaforme, formati, logo e impostazioni;
- mapping dei tipi media Android (`series/tv/anime` e `other/tv`);
- argomenti pubblici `getStreams(tmdbId, mediaType, season, episode)`;
- `SCRAPER_ID`, `SCRAPER_SETTINGS`, API key TMDB pubblica e polyfill compatibile per
  `fetch`, `AbortController`, `URL`, `URLSearchParams`, Cheerio e CryptoJS;
- normalizzazione dei risultati in stream Nuvio: titolo/qualità, nome provider, dimensione,
  lingua, hash, header proxy e sottotitoli; i campi non presenti nel modello Stream Android
  (come `type`, `seeders` e `peers`) non vengono inventati nel Web;
- il mapper del confine plugin non aggiunge `streamOrigin`, che resta un contesto interno creato
  dalla UI quando serve per ordinamento, resume e playback;
- ordine di completamento dei provider, deduplicazione nel raggruppamento dei risultati e
  consegna progressiva dei gruppi al repository stream.

Il codice Android è stato usato come contratto funzionale, non come autorizzazione a introdurre
DEX o API native Android nel Web.

## Architettura

Il percorso è:

```text
UI Plugin -> PluginManager -> PluginRuntime -> Worker QuickJS/WASM
                                      |                 |
                                      +-> servizio TV --+-> HTTP(S) mediato, come Android
StreamRepository <----- gruppi progressivi / stream normalizzati
```

Il bundle `dist/assets/runtime/plugin-worker.js` contiene il loader del Worker e il bundle
`quickjs-emscripten`; il servizio TV non esegue JavaScript del provider. Il Worker esegue ogni
provider in un contesto QuickJS distinto, con interrupt deadline, limite memoria/stack e
terminazione del Worker su errore o cancellazione. Il loader fidato usa internamente l'API di
caricamento QuickJS; questa API non è esposta al codice del plugin.

Il servizio locale separato media il networking. Espone health/capabilities, `fetch`, `cancel`,
diagnostics e pulizia cache. Le porte attuali sono:

- Tizen: `2711`, con fallback `11471`; EngineFS e subtitle service mantengono le proprie porte;
- webOS: `2721`, separata dal servizio media.

### Lifecycle del servizio Tizen

Il `PluginService` Tizen è un Web Service applicativo separato, avviato solo quando il coordinatore
deve eseguire una chiamata di rete. Il file del servizio espone `module.exports.onStart` come punto
di ingresso, crea il server HTTP una sola volta per lifecycle e chiude il server in `onExit` (con
`onStop` come alias per firmware meno recenti), seguendo lo stesso contratto del servizio EngineFS.
Il WGT carica inoltre `services/tizen/wrt-service-bridge.js` come modulo Tizen dedicato. Il
coordinatore usa la stessa catena di avvio compatibile di EngineFS: `launchAppControl`,
`tizen.application.launch` e infine `wrt:service.startService`; quando `web.service` risulta non
disponibile, salta `launchAppControl` e prova prima il servizio WRT, poi il fallback applicativo.
Il bridge normalizza sia il modulo WRT diretto sia il namespace ES con `default`, perché i firmware
non espongono sempre la stessa forma JavaScript. `web.service=false` resta quindi un segnale di
compatibilità e non una prova che il servizio dichiarato non sia avviabile: la prova operativa è la
risposta del servizio locale.
Ogni metodo è considerato riuscito solo dopo che il servizio ha risposto al health-check: una
chiamata Tizen accettata senza un bind locale non blocca i tentativi successivi. Il coordinatore
mantiene inoltre un budget complessivo di startup e registra metodo, ID, runtime Tizen e capability
`web.service` quando tutti i tentativi falliscono.
Il manifest WGT e il wrapper `sync:tizen` usano un ID nella forma `${packageId}.PluginService`,
`auto-restart="false"` e `on-boot="false"`. Il coordinatore prova prima le porte locali, poi avvia
esplicitamente il servizio e accetta un endpoint solo se `GET /health` conferma nome e versione del
protocollo prima di inviare manifest o richieste provider.

Il bind prova la porta `2711` e usa `11471` solo se la prima è occupata, usando l'overload
`server.listen(port)` già impiegato dal runtime EngineFS funzionante; l'app verifica poi il listener
su `127.0.0.1` e `localhost`. Il servizio resta silenzioso quando il lifecycle e il bind riescono;
registra solo collisioni di porta, errori del server e impossibilità di avviare il listener. Il
coordinatore app considera comunque riuscito un avvio soltanto dopo il proprio `GET /health`.

Il bootstrap del servizio carica soltanto il modulo Node `http`, necessario per il bind e per
`/health`. I moduli opzionali `url`, `net`, `dns`, `https` e `zlib` vengono caricati al primo fetch;
un modulo non disponibile sul runtime Web Service leggero non può quindi impedire l'avvio del
listener e produce un errore limitato alla singola richiesta.

Se il coordinatore non raggiunge `/health`, non prova a interpretare il repository: lo conserva come
`UNKNOWN` e non scarica codice. Un `Failed to fetch` durante il riconoscimento indica quindi un
problema del confine app-servizio Tizen oppure del lifecycle del servizio; un errore HTTP restituito
dal servizio verso il sito remoto conserva invece status e messaggio del provider. Per il playback,
quando la sorgente richiede header che AVPlay non può inoltrare, il coordinatore usa il proxy locale
EngineFS; il proxy viene deciso dalla risposta reale di `/settings`, non dal solo valore
`web.service`.

Il protocollo del servizio è volutamente più piccolo del contratto del plugin: il servizio conosce
solo health/capabilities, richieste HTTP, cancellazione, diagnostics e `cache/clear`; non riceve
repository, manifest o codice JavaScript e non decide l'ordine dei provider. Refresh del manifest,
cache del codice, scelta dei provider, deduplicazione e normalizzazione degli stream restano nel
coordinatore app/Worker. In questo modo il servizio non diventa un interprete remoto del formato
plugin.

Durante la ricerca stream, esecuzioni identiche usano un single-flight condiviso come su Android.
La cancellazione di una schermata interrompe soltanto l'attesa di quella schermata; il lavoro
sottostante continua per gli altri chiamanti e viene abortito solo quando non ne resta alcuno.
La deadline globale resta quella della quota Web prudente, quindi non prolunga il lavoro fino ai
120 secondi Android senza una validazione hardware dedicata.

È una difesa a strati (Worker + servizio di rete + quote), non una sandbox OS completa contro un
pacchetto applicativo già malevolo. Per questo il runtime richiede anche il protocol handshake e
il self-test QuickJS prima di diventare eseguibile.

## Stato, profili e sincronizzazione

Lo stato è versionato e profile-scoped (`pluginState`); il codice è in una cache IndexedDB separata
(`nuvio_plugin_code_cache`) con record per profilo e chiave hashata, limite dimensionale, LRU e
recupero tollerante dagli errori. Se IndexedDB non è disponibile o fallisce, la cache usa memoria
limitata alla sessione con le stesse quote. Le operazioni di pulizia (rimozione, svuotamento
profilo, sign-out) restituiscono `false` e registrano un avviso quando la cancellazione persistente
non può essere verificata; i record restano comunque nascosti per la sessione. In upgrade il
vecchio payload localStorage `pluginCodeCache` viene eliminato una volta in modo idempotente, senza
parsing o migrazione.
Il packaging Tizen dichiara inoltre il privilegio pubblico
`http://tizen.org/privilege/unlimitedstorage`, richiesto dalla documentazione Samsung per l'uso di
IndexedDB su TV; l'assenza dell'API o un rifiuto della quota non interrompe comunque l'app perché
attiva il fallback in memoria.
Il cambiamento rimuove il percorso di persistenza sincrono che causava la regressione di reattività e
quota su LG webOS; il comportamento di plugin, riproduzione e gli altri store localStorage resta
invariato. La stessa cache asincrona viene usata anche sulle altre piattaforme Web TV.

La cache del manifest/provider è il campo `metadata` dello stato del repository, con timestamp
`lastUpdated`: non ha un TTL implicito e viene sostituita solo da un'aggiunta, da un refresh
esplicito o da una riconciliazione cloud valida. Il codice JS è invalidato quando cambia il provider
del manifest, la versione/URL viene risalvata o il repository viene rimosso; l'eviction è LRU e una
scrittura viene verificata rileggendo l'entry, così un limite di storage non lascia un provider
falsamente eseguibile. Uno scraper con `codeAvailable: true` ma cache assente (ad esempio dopo
un'eviction) non blocca l'esecuzione: il codice viene riscaricato al momento dell'uso. Non viene
mantenuta una cache di bytecode compilato: l'asset QuickJS è parte immutabile del package e ogni
esecuzione crea un contesto nuovo.

- Il profilo principale è il profilo `1`.
- Un profilo secondario con `usesPrimaryPlugins` legge il set principale e non può modificarlo o
  pubblicarlo.
- Un profilo secondario indipendente ha repository, provider, impostazioni e cache proprie.
- Disabilitare un provider conserva la riga e il codice; rimuovere un repository elimina solo la
  cache eseguibile associata quando la rimozione è esplicita. Il campo storico `repository.enabled`
  resta persistito per compatibilità/sync ma non è un gate di esecuzione, come nel manager Android.
- I vecchi `pluginSources` e `pluginsEnabled` vengono migrati senza perdere le sorgenti.
- Risultato remoto vuoto o pull fallito non cancella lo stato locale. Una snapshot remota tipizzata,
  valida e non vuota è invece completa: rimuove anche i repository locali assenti, inclusi quelli DEX,
  come il reconcile Android.
- Transizione remota tipizzata JS -> DEX/legacy cancella il codice eseguibile prima di mantenere
  la riga metadata-only. La transizione verso JS reidrata manifest e provider solo se il manifest
  è valido; in caso di errore resta il vecchio stato noto.
- Le righe sconosciute/future sono conservate, non rimosse e non riscritte quando il reconcile non ha
  una snapshot tipizzata completa.
- Un repository `EXTERNAL_DEX` / `.cs3` resta metadata-only e non viene eseguito sul Web TV; la
  rimozione della repository è invece disponibile come su Android e viene propagata al cloud.

Le modifiche al set delle repository (aggiunta, rimozione e `repository.enabled`) vengono marcate
`syncDirty` e accodate con debounce per il profilo effettivo; modifiche ravvicinate producono una sola
RPC. Toggle globali, toggle dei provider, impostazioni dei provider e refresh del manifest restano
locali come su Android e non generano un push del catalogo `plugins`. Il push attende un eventuale
push già in corso, rispetta il backoff globale e usa l'ID del profilo come destinazione. Un profilo
secondario che eredita il principale non può generare un push del set principale. Un pull che trova
una modifica locale pendente la pubblica prima di leggere il remoto e non applica uno snapshot se una
modifica locale arriva durante il pull.

Il pull dei plugin viene eseguito nel ciclo startup completo, nel warm cycle e quando si entra nella
pagina Plugin; le richieste concorrenti per lo stesso profilo vengono accorpate e le riconciliazioni
sono serializzate.

Il pull legge `plugins` con `repo_type` quando presente. Il push usa esclusivamente la RPC
tipizzata `sync_push_plugins` e non usa più una sequenza distruttiva DELETE/UPSERT. Se lo schema
remoto o la RPC non sono ancora distribuiti, il push fallisce in modo conservativo e mantiene il
dirty state. Il deploy del campo `plugins.repo_type` e della RPC è quindi un prerequisito di
rilascio da verificare sul progetto Supabase; la RPC riceve anche `p_origin_client_id` per mantenere
la stessa identità di sincronizzazione del client Android. Ogni push conserva anche le righe DEX
con `repo_type=EXTERNAL_DEX`, così una sincronizzazione Web -> cloud -> Android non le interpreta
come rimosse. Il test di sistema verifica questo round-trip di contratto; la presenza effettiva
della colonna e della RPC distribuite resta da verificare sul backend reale. Nel checkout non è
presente una migration remota da inventare.

## Sicurezza e quote

Il codice del plugin può usare i costrutti dinamici JavaScript supportati dal runtime Android,
inclusi `eval` e `Function`; l'isolamento è fornito dal contesto QuickJS separato, dai limiti di
tempo/memoria/stack e dall'assenza di Node, storage TV, API native e `require` arbitrario. Il
servizio di rete:

- accetta URL HTTP/HTTPS validi come Android, inclusi loopback, reti private/link-local,
  IPv4-mapped IPv6, credenziali nell'URL e porte non standard;
- rivalida ogni redirect, segue fino a 20 passaggi e non impone una policy di rete pubblica;
- conserva gli header stringa del contratto Android, rimuovendo soltanto `Accept-Encoding` e
  aggiungendo lo User-Agent predefinito Android quando manca;
- applica timeout, cancellazione, circuit breaker, limite richieste attive e rate limit per
  provider;
- conta anche risposte senza `Content-Length` e interrompe il body oltre la quota.

La validazione HTTP(S), la normalizzazione dei metodi (`POST`/`PUT`/`DELETE`, altrimenti `GET`),
gli header e gli schemi accettati sono allineati ad Android. Restano volutamente le quote operative
Web indicate sotto (concorrenza, timeout, memoria e dimensione delle risposte), in attesa di test
su modelli TV reali; non sono filtri funzionali del contratto plugin.

Quote applicate per esecuzione:

| Quota                 |  Modern | Limited |
| --------------------- | ------: | ------: |
| provider concorrenti  |       2 |       1 |
| coda                  |   tutti |   tutti |
| manifest              | 256 KiB | 128 KiB |
| codice provider       |   2 MiB |   1 MiB |
| cache                 |  16 MiB |   8 MiB |
| fetch                 |   1 MiB | 512 KiB |
| risultati/provider    |      50 |      25 |
| risultati totali      |     150 |      75 |
| timeout provider      |    30 s |    25 s |
| timeout globale       |    60 s |    45 s |
| memoria QuickJS       |  64 MiB |  32 MiB |
| documenti/provider    |       4 |       2 |
| elementi DOM/provider |  10.000 |   6.000 |

Le quote limited non dichiarano una compatibilità completa: sono il profilo prudente per TV
vecchi o runtime con meno margine.

La coda è sospensiva: tutti gli scraper eleggibili attendono il proprio turno; viene limitato
soltanto il numero di esecuzioni contemporanee.

## Gate di piattaforma

La policy applicativa esistente continua a richiedere Tizen 4.0/2018 e webOS 5.0.0/2020 per
l'applicazione. Questo non implica che il runtime plugin sia disponibile.

| Piattaforma                                  | App/add-on                        | Plugin JS locale                                                               | DEX/`.cs3`    |
| -------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------ | ------------- |
| Tizen 4.0 / Chromium M56 e Tizen 5.0 / M63   | supportati dalla policy app       | non candidato: il precheck WASM non passa                                      | solo metadati |
| Tizen 5.5 / Chromium M69                     | supportati                        | candidato limited; eseguibile solo dopo servizio, handshake e self-test sul TV | solo metadati |
| Tizen 6.0 / M76 e Tizen 6.5 / M85            | supportati                        | candidato modern; eseguibile solo dopo gli stessi gate live                    | solo metadati |
| Tizen 7 / M94, 8 / M108, 9 / M120, 10 / M130 | supportati                        | candidato modern; non hardware-certificato da test desktop                     | solo metadati |
| webOS 5.x / Chromium M68                     | supportati dalla policy app       | candidato limited; eseguibile solo dopo servizio, handshake e self-test live   | solo metadati |
| webOS 6+                                     | supportati dalla policy app       | candidato modern; eseguibile solo dopo gli stessi gate live                    | solo metadati |
| versione/servizio sconosciuti o mancanti     | app secondo la policy disponibile | `localJsPluginSupported=false` finché tutti i controlli non passano            | solo metadati |

Il self-test runtime aggiorna la UI da “checking” a “ready” solo quando il servizio è raggiungibile,
il protocollo è compatibile, il Worker è disponibile e QuickJS esegue correttamente il fixture.
Quindi nessun modello viene dichiarato compatibile soltanto perché supera la soglia Chromium.

Fonti ufficiali consultate il 2026-08-31:

- [Samsung Web Engine specifications](https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html)
  per la mappatura Tizen/Chromium;
- [Samsung WebAssembly overview](https://developer.samsung.com/smarttv/develop/extension-libraries/webassembly/overview.html),
  [memory optimization guide](https://developer.samsung.com/smarttv/develop/guides/web-app-memory-optimization-guide.html)
  e [WASM player/Worker guide](https://developer.samsung.com/smarttv/develop/extension-libraries/webassembly/tizen-wasm-player/wasm-player-usage-guide.html);
- [LG Web API and Web Engine specifications](https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine),
  [JS service basics](https://webostv.developer.lge.com/develop/guides/js-service-basics) e
  [JS service usage](https://webostv.developer.lge.com/develop/guides/js-service-usage);
- [quickjs-emscripten](https://github.com/justjake/quickjs-emscripten/blob/main/README.md)
  per l'API QuickJS-WASM usata dal Worker.

## UI, localizzazioni e packaging

La schermata Plugins è navigabile con il focus/d-pad TV e include stato runtime, abilità globali,
provider, refresh, pulizia cache, test di un provider, errori, sorgenti legacy/unknown e badge
metadata-only per DEX. Il toggle di un provider non diventa attivo quando il runtime non è
eseguibile. Il test usa gli stessi argomenti pubblici del flusso stream con un TMDB fixture, mostra
un riepilogo dei risultati e non è disponibile per DEX o sorgenti opache.

Sono presenti 31 resource directories. Il test di localizzazione verifica radice XML, tag bilanciati,
duplicati, presenza di ogni chiave del flusso plugin, placeholder invariati e assenza di valori
inglesi non intenzionali. Le risorse Web includono materialmente tutte le chiavi operative in ogni
locale; restano condivisi soltanto termini tecnici/prodotto come `movie/tv` e `Plugins`. Le stringhe
sono state allineate alle traduzioni Android quando semanticamente equivalenti e completate per i
messaggi Web-specifici.

`npm run build` genera il Worker QuickJS e le licenze. Il packaging Tizen include il Plugin Network
Service per default e rifiuta un package Store senza di esso; il packaging webOS include il terzo
servizio `space.nuvio.webos.plugin.service`, separato dal servizio media e targettizzato a Node 8.

## Verifica su hardware prima del rilascio

I test desktop non possono certificare compatibilità fisica. Su ogni famiglia TV da supportare va
eseguito almeno questo collaudo:

1. installare il package senza rimuovere i dati, selezionare profilo principale e secondario;
2. verificare che un profilo ereditante sia read-only e che quello indipendente resti isolato;
3. aggiungere un manifest JS HTTP(S) compatibile Android, ricaricarlo, disabilitare/riabilitare i provider;
4. aggiungere un `.cs3` e verificare che non partano download, conversione o esecuzione del DEX;
5. inserire una riga remota con tipo sconosciuto/futuro e verificare conservazione e blocco;
6. interrompere rete, manifest, provider lento, redirect, risposta troppo grande e cancellazione;
7. provare contenuti film, serie/stagione/episodio, lingua, sottotitoli, header e risultati
   duplicati;
8. verificare che add-on normali, playback, libreria, account e sync continuino a funzionare
   quando il plugin gate è negativo;
9. raccogliere modello, versione OS/Web Engine, protocol handshake, memoria, log del servizio e
   risultato QuickJS per ogni generazione;
10. su webOS 5.x, verificare che il salvataggio/lettura del codice provider nella cache IndexedDB
    `nuvio_plugin_code_cache` non produca errori di quota o perdita di reattività, e che il vecchio
    payload `pluginCodeCache` in localStorage non sia più presente.

Finché questa matrice non è eseguita su dispositivi reali, la classificazione corretta è
“candidato al runtime” e non “compatibile hardware”.
