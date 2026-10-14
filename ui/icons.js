// Static 16px icons. Trusted markup: never interpolate user data into these strings.
const stroke=d=>`<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`;
const fill=d=>`<path d="${d}" fill="currentColor"/>`;
const dot=(x,y,r=1.15)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor"/>`;
const ring=(x,y,r)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="currentColor" stroke-width="1.4"/>`;
const file='M4 1.75h5L12.25 5v9.25H4zM9 1.75V5h3.25';
const folder='M1.75 4.5c0-.6.45-1 1-1h3.1l1.4 1.5h5.75c.55 0 1 .4 1 1v6.25c0 .55-.45 1-1 1H2.75c-.55 0-1-.45-1-1z';
const tray='M2.5 10.5v2c0 .55.45 1 1 1h9c.55 0 1-.45 1-1v-2';
const shapes={
  filter:stroke('M2 3.5h12L9.5 8v4l-3 1V8z'),
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
  trash:stroke('M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.75h5.8l.6-8.75M6.8 7v3.75M9.2 7v3.75'),
  edit:stroke('M2.75 13.25l.6-2.9L11 2.7l2.3 2.3-7.65 7.65zM9.6 4.1l2.3 2.3'),
  warning:stroke('M8 2.4 14.2 13H1.8zM8 6.6v3')+dot(8,11.3,.8),
  error:ring(8,8,6)+stroke('M6 6l4 4M10 6l-4 4'),
  info:ring(8,8,6)+stroke('M8 7.4v3.4')+dot(8,5.3,.8),
  archive:stroke('M2.5 3h11v3h-11zM3.5 6v7h9V6M6.5 8.75h3'),
  template:stroke('M2.5 2.5h11v11h-11zM2.5 6h11M6.5 6v7.5'),
  target:ring(8,8,5.6)+dot(8,8,2.1),
  check:stroke('M3.5 8.5 6.5 11.5 12.5 4.5'),
  search:ring(7,7,4.2)+stroke('M10.2 10.2 13.5 13.5'),
  chevronUp:stroke('M3.5 10 8 5.5 12.5 10'),
  fit:stroke('M2.25 3.5v9M13.75 3.5v9M5 8h6M6.6 6.1 4.7 8l1.9 1.9M9.4 6.1 11.3 8l-1.9 1.9'),
  copy:stroke('M5.5 5.5h7.25v8H5.5zM3.25 10.5v-8h6.5'),
  history:ring(8,8,5.75)+stroke('M8 4.75V8l2.25 1.5'),
  outline:stroke('M5.75 4h7.75M5.75 8h7.75M5.75 12h7.75')+dot(2.9,4,.9)+dot(2.9,8,.9)+dot(2.9,12,.9),
  sigma:stroke('M11.5 3.5h-7L8.5 8l-4 4.5h7'),
  keyboard:stroke('M1.75 4.25h12.5v7.5H1.75zM4.25 6.9h.4M6.6 6.9h.4M9 6.9h.4M11.35 6.9h.4M5 9.4h6'),
  pages:stroke('M5.25 2.25h7.5v9.5h-7.5zM3.25 4.75v9h6.5'),
  hash:stroke('M6 2.5 5 13.5M11 2.5l-1 11M2.8 6h10.7M2.5 10h10.7'),
};
export const icon=(name,size=16)=>`<svg class="icon icon-${name}" viewBox="0 0 16 16" width="${size}" height="${size}" aria-hidden="true">${shapes[name]||''}</svg>`;
