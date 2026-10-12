// Static 16px icons. Trusted markup: never interpolate user data into these strings.
const stroke=d=>`<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`;
const fill=d=>`<path d="${d}" fill="currentColor"/>`;
const dot=(x,y,r=1.15)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor"/>`;
const ring=(x,y,r)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="currentColor" stroke-width="1.4"/>`;
const file='M4 1.75h5L12.25 5v9.25H4zM9 1.75V5h3.25';
const folder='M1.75 4.5c0-.6.45-1 1-1h3.1l1.4 1.5h5.75c.55 0 1 .4 1 1v6.25c0 .55-.45 1-1 1H2.75c-.55 0-1-.45-1-1z';
const tray='M2.5 10.5v2c0 .55.45 1 1 1h9c.55 0 1-.45 1-1v-2';
const shapes={
  bolt:fill('M9.4 1 3 9.1h4.1L6.2 15l6.8-8.4H8.7z'),
  file:stroke(file),
  tex:stroke(file)+stroke('M6 8.5h4M6 11h2.5'),
  image:stroke('M2.5 3.25h11v9.5h-11zM2.5 10.75l3.25-3 2.5 2.25 2-1.75 3.25 2.75')+dot(5.6,6.1,1),
  folder:stroke(folder),
  fileAdd:stroke(file)+stroke('M8.1 7.4v4M6.1 9.4h4'),
  folderAdd:stroke(folder)+stroke('M8 7.4v3.6M6.2 9.2h3.6'),
  chevronRight:stroke('M6 3.5 10.5 8 6 12.5'),
  chevronDown:stroke('M3.5 6 8 10.5 12.5 6'),
  upload:stroke('M8 10.5v-8M4.75 5.5 8 2.25l3.25 3.25')+stroke(tray),
  download:stroke('M8 2.5v8M4.75 7.5 8 10.75l3.25-3.25')+stroke(tray),
  play:fill('M4.75 2.9c0-.6.65-.95 1.15-.63l7.6 5.1c.44.3.44.96 0 1.26l-7.6 5.1c-.5.32-1.15-.03-1.15-.63z'),
  stop:'<rect x="3.75" y="3.75" width="8.5" height="8.5" rx="1.6" fill="currentColor"/>',
  settings:stroke('M2 4.75h6M12 4.75h2M2 11.25h2M8 11.25h6')+ring(10,4.75,1.9)+ring(6,11.25,1.9),
  close:stroke('M4.25 4.25l7.5 7.5M11.75 4.25l-7.5 7.5'),
  more:dot(3.5,8)+dot(8,8)+dot(12.5,8),
  sidebar:stroke('M2 3h12v10H2zM6 3v10'),
  plus:stroke('M8 3.5v9M3.5 8h9'),
  minus:stroke('M3.5 8h9'),
  fit:stroke('M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10'),
  trash:stroke('M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.75h5.8l.6-8.75M6.8 7v3.75M9.2 7v3.75'),
  edit:stroke('M2.75 13.25l.6-2.9L11 2.7l2.3 2.3-7.65 7.65zM9.6 4.1l2.3 2.3'),
  star:stroke('M8 2l1.8 3.75 4.1.55-3 2.85.75 4.1L8 11.25l-3.65 2 .75-4.1-3-2.85 4.1-.55z'),
  check:stroke('M3.25 8.5l3 3 6.5-7'),
  warning:stroke('M8 2.4 14.2 13H1.8zM8 6.6v3')+dot(8,11.3,.8),
  error:ring(8,8,6)+stroke('M6 6l4 4M10 6l-4 4'),
  info:ring(8,8,6)+stroke('M8 7.4v3.4')+dot(8,5.3,.8),
  log:stroke('M2 3h12v10H2zM4.75 6.5l2 2-2 2M8.25 10.5h3'),
  archive:stroke('M2.5 3h11v3h-11zM3.5 6v7h9V6M6.5 8.75h3'),
  template:stroke('M2.5 2.5h11v11h-11zM2.5 6h11M6.5 6v7.5'),
  spinner:'<path d="M8 2a6 6 0 1 0 6 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
};
export const icon=(name,size=16)=>`<svg class="icon icon-${name}" viewBox="0 0 16 16" width="${size}" height="${size}" aria-hidden="true">${shapes[name]||''}</svg>`;
