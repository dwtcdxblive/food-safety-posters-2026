import * as pdfjsLib from '/vendor/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.mjs';

const { day, screen } = window.TV_CONFIG;
const requestedPage = Number(new URLSearchParams(window.location.search).get('page')) || null;
const status = document.querySelector('#status');
const canvases = [document.querySelector('#poster-a'), document.querySelector('#poster-b')];
let posters = [];
let activeIndex = 0;
let canvasIndex = 0;
let resizeTimer;

boot().catch(showError);

async function boot() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  const assignments = await fetch('/assignments.json', { cache: 'force-cache' }).then(checkResponse).then((response) => response.json());
  const assignment = assignments[`day${day}`]?.find((item) => item.screen === screen);
  if (!assignment) throw new Error(`No poster assignment found for Day ${day}, Screen ${screen}.`);

  status.textContent = assignment.posters.length === 2 ? 'Loading both posters...' : 'Loading poster...';
  posters = await Promise.all(assignment.posters.map(loadPoster));
  await renderPoster(0, canvases[0]);
  canvases[0].classList.add('visible');
  status.classList.add('hidden');

  if (posters.length > 1) {
    await renderPoster(1, canvases[1]);
    window.setInterval(rotate, 30_000);
  }

  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderVisiblePoster, 180);
  });
}

async function loadPoster(poster) {
  const response = await fetch(poster.url, { cache: 'force-cache' }).then(checkResponse);
  const data = await response.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data,
    cMapUrl: '/vendor/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/vendor/standard_fonts/',
    wasmUrl: '/vendor/wasm/',
  });
  const document = await loadingTask.promise;
  const page = await document.getPage(requestedPage ? Math.min(Math.max(1, requestedPage), document.numPages) : document.numPages);
  return { ...poster, document, page };
}

async function rotate() {
  const nextPoster = (activeIndex + 1) % posters.length;
  const nextCanvas = (canvasIndex + 1) % canvases.length;
  await renderPoster(nextPoster, canvases[nextCanvas]);
  canvases[nextCanvas].classList.add('visible');
  canvases[canvasIndex].classList.remove('visible');
  activeIndex = nextPoster;
  canvasIndex = nextCanvas;
}

async function renderVisiblePoster() {
  await renderPoster(activeIndex, canvases[canvasIndex]);
}

async function renderPoster(index, canvas) {
  const page = posters[index].page;
  const base = page.getViewport({ scale: 1 });
  const displayScale = Math.min(window.innerWidth / base.width, window.innerHeight / base.height);
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const viewport = page.getViewport({ scale: displayScale * pixelRatio });
  const cssWidth = viewport.width / pixelRatio;
  const cssHeight = viewport.height / pixelRatio;

  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  await page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport }).promise;
}

function checkResponse(response) {
  if (!response.ok) throw new Error(`Could not load ${response.url} (${response.status}).`);
  return response;
}

function showError(error) {
  console.error(error);
  status.textContent = `Display error: ${error.message}`;
  status.classList.add('error');
}
