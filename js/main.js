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

const pdfWorkerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const pdfGridRenderers = new Map();
let hasBoundResizeListener = false;
let resizeDebounceHandle = null;

const bindPdfResizeHandler = () => {
  if (hasBoundResizeListener) {
    return;
  }

  window.addEventListener('resize', () => {
    window.clearTimeout(resizeDebounceHandle);
    resizeDebounceHandle = window.setTimeout(() => {
      pdfGridRenderers.forEach((renderer) => {
        if (renderer.isLoaded && !renderer.container.closest('[hidden]')) {
          renderer.renderPages().catch(renderer.showErrorState);
        }
      });
    }, 220);
  });

  hasBoundResizeListener = true;
};

const renderPdfToGrid = async (pdfUrl, containerElement, statusElement, options = {}) => {
  if (!containerElement || !statusElement || !window.pdfjsLib) {
    return null;
  }

  if (pdfGridRenderers.has(containerElement)) {
    return pdfGridRenderers.get(containerElement);
  }

  const loadingMessage = options.loadingMessage || 'Indlæser menu...';
  const idleMessage = options.idleMessage || 'Vælg arrangementet for at indlæse menuen.';
  const errorMessage = options.errorMessage || 'Menuen kan ikke vises lige nu. Brug knapperne herover eller kontakt os.';
  const ariaLabelPrefix = options.ariaLabelPrefix || 'Menu side';
  const encodedPdfUrl = encodeURI(pdfUrl);

  let pdfDocument = null;
  let renderCycle = 0;

  const showErrorState = () => {
    statusElement.textContent = errorMessage;
    statusElement.classList.add('menu-status-error');
    statusElement.hidden = false;
    containerElement.innerHTML = '';
  };

  const renderPages = async () => {
    if (!pdfDocument) {
      return;
    }

    renderCycle += 1;
    const activeRenderCycle = renderCycle;

    containerElement.innerHTML = '';
    statusElement.textContent = loadingMessage;
    statusElement.classList.remove('menu-status-error');
    statusElement.hidden = false;

    const containerWidth = containerElement.clientWidth;
    if (!containerWidth) {
      statusElement.textContent = idleMessage;
      return;
    }

    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const pageHandle = await pdfDocument.getPage(pageNumber);
      const baseViewport = pageHandle.getViewport({ scale: 1 });

      const pageWrapper = document.createElement('div');
      pageWrapper.className = 'menu-page';
      containerElement.appendChild(pageWrapper);

      const wrapperStyles = window.getComputedStyle(pageWrapper);
      const wrapperHorizontalPadding =
        (Number.parseFloat(wrapperStyles.paddingLeft || '0') || 0) +
        (Number.parseFloat(wrapperStyles.paddingRight || '0') || 0);
      const wrapperWidth = pageWrapper.getBoundingClientRect().width || containerWidth;
      const renderWidth = Math.max(wrapperWidth - wrapperHorizontalPadding, 1);
      const scale = renderWidth / baseViewport.width;
      const viewport = pageHandle.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.className = 'menu-page-canvas';
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.setAttribute('aria-label', `${ariaLabelPrefix} ${pageNumber}`);

      const context = canvas.getContext('2d', { alpha: false });
      await pageHandle.render({ canvasContext: context, viewport }).promise;

      if (activeRenderCycle !== renderCycle) {
        return;
      }

      pageWrapper.appendChild(canvas);
    }

    statusElement.hidden = true;
  };

  const loadAndRender = async () => {
    try {
      if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
      }

      if (!pdfDocument) {
        statusElement.textContent = loadingMessage;
        statusElement.classList.remove('menu-status-error');
        statusElement.hidden = false;
        const loadingTask = window.pdfjsLib.getDocument(encodedPdfUrl);
        pdfDocument = await loadingTask.promise;
      }

      await renderPages();
    } catch (error) {
      showErrorState();
    }
  };

  const renderer = {
    container: containerElement,
    status: statusElement,
    showErrorState,
    renderPages,
    ensureRendered: loadAndRender,
    get isLoaded() {
      return Boolean(pdfDocument);
    },
  };

  pdfGridRenderers.set(containerElement, renderer);
  bindPdfResizeHandler();

  return renderer;
};

const initializeMenuPdf = async () => {
  if (document.body.dataset.page !== 'menu') {
    return;
  }

  const menuPages = document.querySelector('#menu-pages');
  const menuStatus = document.querySelector('#menu-status');

  if (!menuPages || !menuStatus || !window.pdfjsLib) {
    return;
  }

  const renderer = await renderPdfToGrid('./uploads/menu.pdf', menuPages, menuStatus, {
    loadingMessage: 'Indlæser menu...',
    errorMessage: 'Menuen kan ikke vises lige nu. Brug knappen herover eller kontakt os.',
    ariaLabelPrefix: 'Menu side',
  });

  if (renderer) {
    await renderer.ensureRendered();
  }
};

initializeMenuPdf();

const initializeArrangementSelector = async () => {
  if (document.body.dataset.page !== 'arrangementer') {
    return;
  }

  const arrangementSelect = document.querySelector('#arrangement-type');
  const arrangementSections = document.querySelectorAll('.arrangement-section');
  const defaultMessage = document.querySelector('#arrangement-default-message');

  if (!arrangementSelect || !arrangementSections.length || !defaultMessage) {
    return;
  }

  const arrangementRenderers = new Map();

  const hideAllSections = () => {
    arrangementSections.forEach((section) => {
      section.classList.add('hidden');
      section.setAttribute('hidden', 'hidden');
    });
  };

  const showSectionMenu = async (sectionElement) => {
    const menuCard = sectionElement.querySelector('.arrangement-menu-card');
    const menuPages = sectionElement.querySelector('.menu-pages');
    const menuStatus = sectionElement.querySelector('.menu-status');

    if (!menuCard || !menuPages || !menuStatus || !window.pdfjsLib) {
      return;
    }

    if (!arrangementRenderers.has(sectionElement.id)) {
      const pdfUrl = menuCard.dataset.arrangementPdf;
      const renderer = await renderPdfToGrid(pdfUrl, menuPages, menuStatus, {
        loadingMessage: 'Indlæser menu...',
        idleMessage: 'Vælg arrangementet for at indlæse menuen.',
        errorMessage: 'Menuen kan ikke vises lige nu. Brug knapperne herover eller kontakt os.',
        ariaLabelPrefix: 'Menu side',
      });

      arrangementRenderers.set(sectionElement.id, renderer);
    }

    const renderer = arrangementRenderers.get(sectionElement.id);
    if (renderer && !renderer.isLoaded) {
      await renderer.ensureRendered();
    }
  };

  const updateArrangementDisplay = async () => {
    const selectedArrangement = arrangementSelect.value;

    hideAllSections();

    if (!selectedArrangement) {
      defaultMessage.classList.remove('hidden');
      defaultMessage.hidden = false;
      return;
    }

    const activeSection = document.querySelector(`#${selectedArrangement}.arrangement-section`);
    if (activeSection) {
      activeSection.classList.remove('hidden');
      activeSection.removeAttribute('hidden');
      defaultMessage.classList.add('hidden');
      defaultMessage.hidden = true;
      await showSectionMenu(activeSection);
    }
  };

  arrangementSelect.addEventListener('change', () => {
    updateArrangementDisplay();
  });

  hideAllSections();
  defaultMessage.classList.remove('hidden');
  defaultMessage.hidden = false;
};

initializeArrangementSelector();

const initializeGalleryLightbox = () => {
  if (document.body.dataset.page !== 'galleri') {
    return;
  }

  const lightbox = document.querySelector('#gallery-lightbox');
  const lightboxImage = document.querySelector('#lightbox-image');
  const galleryTriggers = document.querySelectorAll('.gallery-item');
  const lightboxCloseElements = document.querySelectorAll('[data-lightbox-close]');

  if (!lightbox || !lightboxImage || !galleryTriggers.length) {
    return;
  }

  const closeLightbox = () => {
    lightbox.hidden = true;
    lightboxImage.src = '';
    lightboxImage.alt = '';
    document.body.style.overflow = '';
  };

  const openLightbox = (source, altText) => {
    lightboxImage.src = source;
    lightboxImage.alt = altText;
    lightbox.hidden = false;
    document.body.style.overflow = 'hidden';
  };

  galleryTriggers.forEach((trigger) => {
    trigger.addEventListener('click', () => {
      const source = trigger.dataset.lightboxSrc;
      const altText = trigger.dataset.lightboxAlt || '';

      if (source) {
        openLightbox(source, altText);
      }
    });
  });

  lightboxCloseElements.forEach((closeElement) => {
    closeElement.addEventListener('click', closeLightbox);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !lightbox.hidden) {
      closeLightbox();
    }
  });
};

initializeGalleryLightbox();
