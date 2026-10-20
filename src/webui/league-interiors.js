// The champions directory's per-champion sigil (leagueChampions in league-world.js).
function armorySigil(id) {
  const paths={
    ahri:'M50 83C25 73 14 45 17 17c16 9 25 20 33 38 8-18 17-29 33-38 3 28-8 56-33 66ZM50 83C12 86 2 59 8 35c6 13 17 20 28 24M50 83c38 3 48-24 42-48-6 13-17 20-28 24M50 55V15M43 24l7-12 7 12M35 42l-4-19M65 42l4-19',
    lux:'M50 9v19m0 44v19M9 50h19m44 0h19M21 21l14 14m30 30 14 14M21 79l14-14m30-30 14-14M50 25l8 17 17 8-17 8-8 17-8-17-17-8 17-8ZM37 13L17 37v26l20 24m26 0 20-24V37L63 13',
    yasuo:'M12 35c20-30 53-25 57-9 5 16-24 20-25 6M7 54h63c24 0 24-30 9-30M13 65h42c22 0 26 25 11 26M23 77h20M61 10 29 89M39 64l18 8'
  };
  return `<svg class="armory-sigil" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="50" cy="50" r="46" stroke-opacity=".3"/><path d="${paths[id]||paths.lux}"/></svg>`;
}
