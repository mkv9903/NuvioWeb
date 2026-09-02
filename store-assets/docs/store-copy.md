# Store copy draft

This copy is deliberately conservative: it describes the app as an organizer/player for user-configured sources and does not promise a catalog, a specific codec, a DRM system, or a platform privilege that still depends on certification.

## English — recommended base locale

### Title

`Nuvio TV`

### Short description

`Discover, organize and watch your own movie and TV sources on the big screen.`

### Long description

`Nuvio TV is a modern media organizer for movies and TV shows, designed for the big screen.`

`Discover titles, build your library, save favorites, track progress and keep your watch history in sync with supported services. Browse Home, Search and Library with a remote-friendly interface, then open a configured source in the TV player.`

`Bring your own sources: catalogs, add-ons and supported services provide the content and playable links you choose. Nuvio TV does not host or provide video content. Source availability, playback features, audio, subtitles and advanced services can vary by source, TV model and platform version.`

`Nuvio TV is free and open source. Learn more at https://nuvio.tv.`

### Suggested feature bullets

- Discover movies and TV shows from configured catalogs.
- Save favorites and keep a personal library.
- Track progress and continue where you stopped.
- Use a TV-first interface built for remote navigation.
- Connect supported services for optional cloud libraries and synchronization.

## Italiano — draft locale

### Titolo

`Nuvio TV`

### Descrizione breve

`Scopri, organizza e riproduci le tue sorgenti di film e serie sul grande schermo.`

### Descrizione lunga

`Nuvio TV è un moderno organizzatore multimediale per film e serie TV, progettato per il grande schermo.`

`Scopri nuovi titoli, crea la tua libreria, salva i preferiti, segui i progressi e sincronizza la cronologia con i servizi supportati. Usa Home, Ricerca e Libreria con un’interfaccia pensata per il telecomando, poi apri nel player una sorgente configurata.`

`Usa le tue sorgenti: cataloghi, add-on e servizi supportati forniscono i contenuti e i link riproducibili che scegli. Nuvio TV non ospita né fornisce contenuti video. La disponibilità delle sorgenti, la riproduzione, l’audio, i sottotitoli e i servizi avanzati possono variare in base alla sorgente, al modello di TV e alla versione della piattaforma.`

`Nuvio TV è gratuito e open source. Scopri di più su https://nuvio.tv.`

## Fields that must not be guessed

- Seller account ownership and any legal entity fields that differ from the Google Play publisher profile.
- Age/content rating and regional certificates.
- Countries, languages and TV model groups.
- Test account and the exact provider/add-on configuration used by QA.

## Distribution decision

- Countries/regions: use the same production country list currently enabled for `com.nuvio.app` on Google Play. The exact list must be copied from Play Console because it is account-specific and is not exposed by the public listing.
- Samsung model groups: select the Tizen model groups for 2018 onward (Tizen 4+) that Seller Office offers for this package architecture.
- LG targets: select the webOS 5.x and later model coverage (2020 onward) that Seller Lounge offers for the submitted IPK.

## Publisher and support reference — copied from Google Play as requested

Use these values as the starting point for Samsung Seller Office and LG Seller Lounge, then verify that the signed-in store account presents the same publisher identity before submitting:

- Developer/publisher: `Nuvio Media`
- Legal developer name: `Muhammed Nayif Rahman`
- Country: `India`
- Support email: `nayiftapframe@gmail.com`
- Support website: `https://nuvioapp.space`
- Canonical project website: `https://nuvio.tv`
- Privacy policy: `https://nuvio.tv/privacy-policy`
- Android reference rating: `Everyone` (Samsung/LG ratings must still be completed in their own portals.)

Reference listing: https://play.google.com/store/apps/details?id=com.nuvio.app

The Google Play data-safety panel currently states that no data is shared with third parties, the app may collect personal information, data is encrypted in transit, and users can request deletion. Treat those statements as the Android declaration to reconcile with the TV builds and the current Samsung/LG forms; do not copy them blindly if a TV-specific flow differs.

## Supported Nuvio TV interface languages

The web build currently ships UI translations for 30 locales:

`English`, `Arabic`, `Bosnian`, `Czech`, `German`, `Greek`, `Spanish`, `Spanish (Latin America)`, `French`, `Hebrew`, `Hindi`, `Hungarian`, `Indonesian`, `Italian`, `Japanese`, `Lithuanian`, `Dutch`, `Norwegian`, `Polish`, `Portuguese (Brazil)`, `Portuguese (Portugal)`, `Romanian`, `Russian`, `Slovak`, `Slovenian`, `Swedish`, `Tamil`, `Turkish`, `Vietnamese`, and `Chinese (Simplified)`.

This is the app UI locale list, not a promise that every store portal accepts localized metadata for every locale. The language selections and translated store descriptions can be completed after the base English submission is accepted.
