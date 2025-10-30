import express from 'express';
import puppeteer from 'puppeteer';
import { z } from 'zod';

const DEFAULT_PORT = process.env.PORT ? Number(process.env.PORT) : 4100;
const DEFAULT_PIXEL_RATIO = Number(process.env.DEFAULT_PIXEL_RATIO || '2');

const SlideSchema = z.object({
  id: z.string().min(1),
  html: z.string().min(1),
  width: z.number().positive(),
  height: z.number().positive(),
  pixelRatio: z.number().positive().max(4).optional(),
});

const StylesSchema = z.object({
  inline: z.array(z.string()).default([]),
  external: z.array(z.string()).default([]),
  baseUrl: z.string().url().optional(),
});

const RenderRequestSchema = z.object({
  slides: z.array(SlideSchema).min(1),
  styles: StylesSchema.default({ inline: [], external: [] }),
  pixelRatio: z.number().positive().max(4).optional(),
});

const app = express();
app.use(express.json({ limit: '25mb' }));

let browserPromise = null;

const getBrowser = async () => {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return browserPromise;
};

const closeBrowser = async () => {
  if (browserPromise) {
    try {
      const browser = await browserPromise;
      await browser.close();
    } catch (error) {
      console.error('[Renderer] Failed to close browser', error);
    }
    browserPromise = null;
  }
};

const buildDocumentHtml = (slide, styles) => {
  const inlineStyles = (styles.inline || [])
    .map(content => `<style>${content}</style>`)
    .join('\n');
  const externalLinks = (styles.external || [])
    .map(href => `<link rel="stylesheet" href="${href}" />`)
    .join('\n');

  const baseTag = styles.baseUrl ? `<base href="${styles.baseUrl}">` : '';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    ${baseTag}
    <style>
      html, body {
        margin: 0;
        padding: 0;
        background: transparent;
      }
      body {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
      }
      #slide-root {
        width: ${Math.max(1, Math.round(slide.width))}px;
        height: ${Math.max(1, Math.round(slide.height))}px;
        overflow: hidden;
        position: relative;
      }
    </style>
    ${externalLinks}
    ${inlineStyles}
  </head>
  <body>
    <div id="slide-root">${slide.html}</div>
  </body>
</html>`;
};

const renderSlide = async (browser, slide, styles, defaultPixelRatio) => {
  const page = await browser.newPage();
  const pixelRatio = Math.min(Math.max(slide.pixelRatio || defaultPixelRatio || DEFAULT_PIXEL_RATIO || 2, 1), 4);

  await page.setViewport({
    width: Math.round(slide.width),
    height: Math.round(slide.height),
    deviceScaleFactor: pixelRatio,
  });

  const html = buildDocumentHtml(slide, styles);
  await page.setContent(html, { waitUntil: 'networkidle0' });

  try {
    await page.evaluate(async () => {
      if ('fonts' in document) {
        await document.fonts.ready;
      }
    });
  } catch (error) {
    console.warn('[Renderer] Font readiness check failed', error);
  }

  await page.waitForTimeout(80);

  const buffer = await page.screenshot({
    type: 'png',
    clip: {
      x: 0,
      y: 0,
      width: Math.round(slide.width),
      height: Math.round(slide.height),
    },
    omitBackground: false,
  });

  await page.close();

  return {
    id: slide.id,
    dataUrl: `data:image/png;base64,${buffer.toString('base64')}`,
    width: Math.round(slide.width * pixelRatio),
    height: Math.round(slide.height * pixelRatio),
    cssWidth: slide.width,
    cssHeight: slide.height,
    pixelRatio,
  };
};

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/render/batch', async (req, res) => {
  const parseResult = RenderRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Invalid render request payload',
      details: parseResult.error.flatten(),
    });
    return;
  }

  const { slides, styles, pixelRatio } = parseResult.data;

  try {
    const browser = await getBrowser();
    const screenshots = [];
    for (const slide of slides) {
      try {
        const screenshot = await renderSlide(browser, slide, styles, pixelRatio);
        screenshots.push(screenshot);
      } catch (error) {
        console.error(`[Renderer] Failed to render slide ${slide.id}`, error);
        screenshots.push({ id: slide.id, error: 'render_failed' });
      }
    }
    res.json({ screenshots });
  } catch (error) {
    console.error('[Renderer] Unexpected rendering error', error);
    res.status(500).json({ error: 'Failed to render slides' });
  }
});

process.on('SIGTERM', async () => {
  await closeBrowser();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await closeBrowser();
  process.exit(0);
});

app.listen(DEFAULT_PORT, () => {
  console.log(`[Renderer] Listening on port ${DEFAULT_PORT}`);
});
