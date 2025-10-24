const loadedFonts = new Set<string>();
const loadedStylesheets = new Set<string>();

const GOOGLE_FONT_STYLESHEETS: Record<string, readonly string[]> = {
  Arimo: ['https://fonts.googleapis.com/css2?family=Arimo:wght@400;700&display=swap'],
  'DM Sans': ['https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap'],
  Montserrat: ['https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap'],
  'Open Sans': ['https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap'],
  Poppins: ['https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap'],
  'League Spartan': ['https://fonts.googleapis.com/css2?family=League+Spartan:wght@400;600;700&display=swap'],
  Anton: ['https://fonts.googleapis.com/css2?family=Anton&display=swap'],
  'Archivo Black': ['https://fonts.googleapis.com/css2?family=Archivo+Black&display=swap'],
  Roboto: ['https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap'],
  Alice: ['https://fonts.googleapis.com/css2?family=Alice&display=swap'],
  Lora: ['https://fonts.googleapis.com/css2?family=Lora:wght@400;600;700&display=swap'],
  'Great Vibes': ['https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap'],
  Pacifico: ['https://fonts.googleapis.com/css2?family=Pacifico&display=swap'],
  'Playfair Display': ['https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&display=swap'],
  'Scheherazade New': ['https://fonts.googleapis.com/css2?family=Scheherazade+New:wght@400;700&display=swap'],
  Bungee: ['https://fonts.googleapis.com/css2?family=Bungee&display=swap'],
  Fredoka: ['https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&display=swap'],
  'Comic Neue': ['https://fonts.googleapis.com/css2?family=Comic+Neue:wght@400;700&display=swap'],
};

type FontResource = {
  cssFamily: string;
  fontFace?: string;
  stylesheets: readonly string[];
};

const FONT_RESOURCES: Record<string, FontResource> = {
  Arimo: { cssFamily: 'Arimo', fontFace: 'Arimo', stylesheets: GOOGLE_FONT_STYLESHEETS['Arimo'] },
  'DM Sans': { cssFamily: 'DM Sans', fontFace: 'DM Sans', stylesheets: GOOGLE_FONT_STYLESHEETS['DM Sans'] },
  Montserrat: { cssFamily: 'Montserrat', fontFace: 'Montserrat', stylesheets: GOOGLE_FONT_STYLESHEETS['Montserrat'] },
  'Open Sans': { cssFamily: 'Open Sans', fontFace: 'Open Sans', stylesheets: GOOGLE_FONT_STYLESHEETS['Open Sans'] },
  Poppins: { cssFamily: 'Poppins', fontFace: 'Poppins', stylesheets: GOOGLE_FONT_STYLESHEETS['Poppins'] },
  'League Spartan': {
    cssFamily: 'League Spartan',
    fontFace: 'League Spartan',
    stylesheets: GOOGLE_FONT_STYLESHEETS['League Spartan'],
  },
  Anton: { cssFamily: 'Anton', fontFace: 'Anton', stylesheets: GOOGLE_FONT_STYLESHEETS['Anton'] },
  'Archivo Black': {
    cssFamily: 'Archivo Black',
    fontFace: 'Archivo Black',
    stylesheets: GOOGLE_FONT_STYLESHEETS['Archivo Black'],
  },
  Roboto: { cssFamily: 'Roboto', fontFace: 'Roboto', stylesheets: GOOGLE_FONT_STYLESHEETS['Roboto'] },
  Alice: { cssFamily: 'Alice', fontFace: 'Alice', stylesheets: GOOGLE_FONT_STYLESHEETS['Alice'] },
  Lora: { cssFamily: 'Lora', fontFace: 'Lora', stylesheets: GOOGLE_FONT_STYLESHEETS['Lora'] },
  'Great Vibes': {
    cssFamily: 'Great Vibes',
    fontFace: 'Great Vibes',
    stylesheets: GOOGLE_FONT_STYLESHEETS['Great Vibes'],
  },
  Pacifico: { cssFamily: 'Pacifico', fontFace: 'Pacifico', stylesheets: GOOGLE_FONT_STYLESHEETS['Pacifico'] },
  'Playfair Display': {
    cssFamily: 'Playfair Display',
    fontFace: 'Playfair Display',
    stylesheets: GOOGLE_FONT_STYLESHEETS['Playfair Display'],
  },
  'Scheherazade New': {
    cssFamily: 'Scheherazade New',
    fontFace: 'Scheherazade New',
    stylesheets: GOOGLE_FONT_STYLESHEETS['Scheherazade New'],
  },
  Bungee: { cssFamily: 'Bungee', fontFace: 'Bungee', stylesheets: GOOGLE_FONT_STYLESHEETS['Bungee'] },
  Fredoka: { cssFamily: 'Fredoka', fontFace: 'Fredoka', stylesheets: GOOGLE_FONT_STYLESHEETS['Fredoka'] },
  'Comic Neue': {
    cssFamily: 'Comic Neue',
    fontFace: 'Comic Neue',
    stylesheets: GOOGLE_FONT_STYLESHEETS['Comic Neue'],
  },
  'Migra': {
    cssFamily: 'Playfair Display',
    fontFace: 'Playfair Display',
    stylesheets: GOOGLE_FONT_STYLESHEETS['Playfair Display'],
  },
  'The Seasons': {
    cssFamily: 'Playfair Display',
    fontFace: 'Playfair Display',
    stylesheets: GOOGLE_FONT_STYLESHEETS['Playfair Display'],
  },
  'XB Niloofar': {
    cssFamily: 'Scheherazade New',
    fontFace: 'Scheherazade New',
    stylesheets: GOOGLE_FONT_STYLESHEETS['Scheherazade New'],
  },
  'Dream Avenue': {
    cssFamily: 'Great Vibes',
    fontFace: 'Great Vibes',
    stylesheets: GOOGLE_FONT_STYLESHEETS['Great Vibes'],
  },
  'BROWN SUGAR': { cssFamily: 'Bungee', fontFace: 'Bungee', stylesheets: GOOGLE_FONT_STYLESHEETS['Bungee'] },
  'HK Grotesk': {
    cssFamily: 'Montserrat',
    fontFace: 'Montserrat',
    stylesheets: GOOGLE_FONT_STYLESHEETS['Montserrat'],
  },
  'Canva Sans': { cssFamily: 'DM Sans', fontFace: 'DM Sans', stylesheets: GOOGLE_FONT_STYLESHEETS['DM Sans'] },
  'Clear Sans': { cssFamily: 'Open Sans', fontFace: 'Open Sans', stylesheets: GOOGLE_FONT_STYLESHEETS['Open Sans'] },
  'Times New Roman MT': {
    cssFamily: '"Times New Roman", Times, serif',
    fontFace: 'Times New Roman',
    stylesheets: [],
  },
  'Glacial Indifference': {
    cssFamily: 'Montserrat',
    fontFace: 'Montserrat',
    stylesheets: GOOGLE_FONT_STYLESHEETS['Montserrat'],
  },
  Garet: { cssFamily: 'Poppins', fontFace: 'Poppins', stylesheets: GOOGLE_FONT_STYLESHEETS['Poppins'] },
  'Open Sauce': { cssFamily: 'Open Sans', fontFace: 'Open Sans', stylesheets: GOOGLE_FONT_STYLESHEETS['Open Sans'] },
  Brittany: { cssFamily: 'Great Vibes', fontFace: 'Great Vibes', stylesheets: GOOGLE_FONT_STYLESHEETS['Great Vibes'] },
  'Arial MT Pro': {
    cssFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
    fontFace: 'Arial',
    stylesheets: [],
  },
  'GAGALN': { cssFamily: 'Anton', fontFace: 'Anton', stylesheets: GOOGLE_FONT_STYLESHEETS['Anton'] },
  'Prastice': { cssFamily: 'Pacifico', fontFace: 'Pacifico', stylesheets: GOOGLE_FONT_STYLESHEETS['Pacifico'] },
  'Comic Sans': {
    cssFamily: '"Comic Sans MS", "Comic Sans", cursive',
    fontFace: 'Comic Sans MS',
    stylesheets: [],
  },
};

const formatFontFaceName = (fontFamily: string) =>
  fontFamily.includes(' ') || fontFamily.includes(',') ? `"${fontFamily.replace(/"/g, '\\"')}"` : fontFamily;

const ensureStylesheetLoaded = (url: string) => {
  if (loadedStylesheets.has(url)) {
    return;
  }

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
  loadedStylesheets.add(url);
};

const getFontResource = (fontFamily: string): FontResource | undefined => FONT_RESOURCES[fontFamily];

export const resolveFontFamily = (fontFamily: string) =>
  getFontResource(fontFamily)?.cssFamily ?? fontFamily;

export const ensureFontLoaded = (fontFamily: string | null | undefined) => {
  if (typeof document === 'undefined' || !fontFamily) {
    return;
  }

  const normalized = fontFamily.trim();
  if (!normalized || loadedFonts.has(normalized)) {
    return;
  }

  const resource = getFontResource(normalized);
  const resolvedFamily = resource?.cssFamily ?? normalized;

  resource?.stylesheets.forEach(ensureStylesheetLoaded);

  const fontFaceName = resource?.fontFace ?? (resource?.stylesheets.length ? resolvedFamily : null);

  const fontFaceSet = (document as Document & { fonts?: { load?: (font: string) => Promise<unknown> } }).fonts;

  if (fontFaceName) {
    fontFaceSet?.load?.(`1em ${formatFontFaceName(fontFaceName)}`).catch(() => {
      // Ignore failures – the browser will fall back to system fonts if necessary.
    });
  }

  loadedFonts.add(normalized);
};
