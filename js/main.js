const menuToggle = document.querySelector('.menu-toggle');
const primaryNav = document.querySelector('#primary-navigation');

if (menuToggle && primaryNav) {
  menuToggle.addEventListener('click', () => {
    const expanded = menuToggle.getAttribute('aria-expanded') === 'true';
    menuToggle.setAttribute('aria-expanded', String(!expanded));
    primaryNav.classList.toggle('is-open');
  });
}

const page = document.body.dataset.page;
const navLinks = document.querySelectorAll('.primary-nav a');

navLinks.forEach((link) => {
  if (link.dataset.page === page) {
    link.classList.add('active');
    link.setAttribute('aria-current', 'page');
  }

  link.addEventListener('click', () => {
    if (primaryNav && primaryNav.classList.contains('is-open')) {
      primaryNav.classList.remove('is-open');
      if (menuToggle) {
        menuToggle.setAttribute('aria-expanded', 'false');
      }
    }
  });
});

const initializeMenuPdf = async () => {
  if (document.body.dataset.page !== 'menu') {
    return;
  }

  const menuPages = document.querySelector('#menu-pages');
  const menuStatus = document.querySelector('#menu-status');

  if (!menuPages || !menuStatus || !window.pdfjsLib) {
    return;
  }

  const pdfPath = './uploads/menu.pdf';
  const workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const loadingMessage = 'Indlæser menu...';
  const errorMessage = 'Menuen kan ikke vises lige nu. Brug knappen herover eller kontakt os.';
  let pdfDocument = null;
  let resizeTimeout = null;
  let renderCycle = 0;

  const showErrorState = () => {
    menuStatus.textContent = errorMessage;
    menuStatus.classList.add('menu-status-error');
    menuStatus.hidden = false;
    menuPages.innerHTML = '';
  };

  const renderPages = async () => {
    if (!pdfDocument) {
      return;
    }

    renderCycle += 1;
    const activeRenderCycle = renderCycle;

    menuPages.innerHTML = '';
    menuStatus.textContent = loadingMessage;
    menuStatus.classList.remove('menu-status-error');
    menuStatus.hidden = false;

    const containerWidth = menuPages.clientWidth;
    if (!containerWidth) {
      return;
    }

    const computedStyles = window.getComputedStyle(menuPages);
    const gap = Number.parseFloat(computedStyles.columnGap || computedStyles.gap || '0') || 0;
    const gridTemplateColumns = computedStyles.gridTemplateColumns.split(' ').filter(Boolean).length || 1;
    const pageCellWidth = Math.max((containerWidth - gap * (gridTemplateColumns - 1)) / gridTemplateColumns, 1);

    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const pageHandle = await pdfDocument.getPage(pageNumber);
      const baseViewport = pageHandle.getViewport({ scale: 1 });

      const pageWrapper = document.createElement('div');
      pageWrapper.className = 'menu-page';
      menuPages.appendChild(pageWrapper);

      const wrapperStyles = window.getComputedStyle(pageWrapper);
      const wrapperHorizontalPadding =
        (Number.parseFloat(wrapperStyles.paddingLeft || '0') || 0) +
        (Number.parseFloat(wrapperStyles.paddingRight || '0') || 0);
      const renderWidth = Math.max(pageCellWidth - wrapperHorizontalPadding, 1);
      const scale = renderWidth / baseViewport.width;
      const viewport = pageHandle.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.className = 'menu-page-canvas';
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.setAttribute('aria-label', `Menu side ${pageNumber}`);

      const context = canvas.getContext('2d', { alpha: false });
      await pageHandle.render({ canvasContext: context, viewport }).promise;

      if (activeRenderCycle !== renderCycle) {
        return;
      }

      pageWrapper.appendChild(canvas);
    }

    menuStatus.hidden = true;
  };

  try {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
    const loadingTask = window.pdfjsLib.getDocument(pdfPath);
    pdfDocument = await loadingTask.promise;
    await renderPages();

    window.addEventListener('resize', () => {
      window.clearTimeout(resizeTimeout);
      resizeTimeout = window.setTimeout(() => {
        renderPages().catch(showErrorState);
      }, 180);
    });
  } catch (error) {
    showErrorState();
  }
};

initializeMenuPdf();
