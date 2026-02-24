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

  const encodedPdfUrl = encodeURI(pdfUrl);
  const rendererKey = `${containerElement.id || containerElement.className || 'pdf-container'}::${encodedPdfUrl}`;

  if (pdfGridRenderers.has(rendererKey)) {
    return pdfGridRenderers.get(rendererKey);
  }

  const loadingMessage = options.loadingMessage || 'Indlæser menu...';
  const idleMessage = options.idleMessage || 'Vælg arrangementet for at indlæse menuen.';
  const errorMessage = options.errorMessage || 'Menuen kan ikke vises lige nu. Brug knapperne herover eller kontakt os.';
  const ariaLabelPrefix = options.ariaLabelPrefix || 'Menu side';

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

  pdfGridRenderers.set(rendererKey, renderer);
  bindPdfResizeHandler();

  return renderer;
};

const initializeMenuPdf = async () => {
  if (document.body.dataset.page !== 'menu') {
    return;
  }

  const menuPages = document.querySelector('#menu-pages');
  const menuStatus = document.querySelector('#menu-status');
  const menuOpenLink = document.querySelector('#menu-open-link');
  const menuDownloadLink = document.querySelector('#menu-download-link');
  const menuTabs = document.querySelectorAll('.menu-switch-tab');

  if (!menuPages || !menuStatus || !menuOpenLink || !menuDownloadLink || !menuTabs.length || !window.pdfjsLib) {
    return;
  }

  const menuConfigs = {
    aften: {
      url: './uploads/menu.pdf',
      label: 'Aftenmenu',
    },
    frokost: {
      url: './uploads/Menu-frokost.pdf',
      label: 'Frokostmenu',
    },
  };

  const menuRenderers = new Map();

  const updateActionLinks = (menuKey) => {
    const activeConfig = menuConfigs[menuKey];
    if (!activeConfig) {
      return;
    }

    menuOpenLink.href = activeConfig.url;
    menuDownloadLink.href = activeConfig.url;
    menuDownloadLink.setAttribute('download', `${activeConfig.label}.pdf`);
  };

  const updateTabState = (menuKey) => {
    menuTabs.forEach((tab) => {
      const isActive = tab.dataset.menuKey === menuKey;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
    });
  };

  const showMenu = async (menuKey) => {
    const activeConfig = menuConfigs[menuKey];
    if (!activeConfig) {
      return;
    }

    updateTabState(menuKey);
    updateActionLinks(menuKey);

    menuPages.innerHTML = '';
    menuStatus.textContent = `Indlæser ${activeConfig.label.toLowerCase()}...`;
    menuStatus.classList.remove('menu-status-error');
    menuStatus.hidden = false;

    if (!menuRenderers.has(menuKey)) {
      const renderer = await renderPdfToGrid(activeConfig.url, menuPages, menuStatus, {
        loadingMessage: `Indlæser ${activeConfig.label.toLowerCase()}...`,
        errorMessage: `${activeConfig.label} kan ikke vises lige nu. Brug knapperne herover eller kontakt os.`,
        ariaLabelPrefix: `${activeConfig.label} side`,
      });
      menuRenderers.set(menuKey, renderer);
    }

    const renderer = menuRenderers.get(menuKey);
    if (renderer) {
      await renderer.ensureRendered();
    }
  };

  menuTabs.forEach((tab) => {
    tab.addEventListener('click', async () => {
      const selectedKey = tab.dataset.menuKey;
      if (!selectedKey || !menuConfigs[selectedKey]) {
        return;
      }

      await showMenu(selectedKey);
    });
  });

  updateActionLinks('aften');
  await showMenu('aften');
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
    lightbox.classList.add('is-hidden');
    lightbox.setAttribute('aria-hidden', 'true');
    lightboxImage.src = '';
    lightboxImage.alt = '';
    document.body.style.overflow = '';
  };

  const openLightbox = (source, altText) => {
    lightboxImage.src = source;
    lightboxImage.alt = altText;
    lightbox.hidden = false;
    lightbox.classList.remove('is-hidden');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  };

  closeLightbox();

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


const initializeHomepageSlideshow = () => {
  if (document.body.dataset.page !== 'forside') {
    return;
  }

  const slideshow = document.querySelector('[data-homepage-slideshow]');
  const slideshowImage = slideshow ? slideshow.querySelector('img') : null;

  if (!slideshow || !slideshowImage) {
    return;
  }

  const slides = [
    {
      src: 'uploads/gallery/mad-1.jpg',
      alt: 'Billede fra Hestestalden – mad (1 af 6)',
    },
    {
      src: 'uploads/gallery/mad-2.jpg',
      alt: 'Billede fra Hestestalden – mad (2 af 6)',
    },
    {
      src: 'uploads/gallery/mad-3.jpg',
      alt: 'Billede fra Hestestalden – mad (3 af 6)',
    },
    {
      src: 'uploads/gallery/mad-4.jpg',
      alt: 'Billede fra Hestestalden – mad (4 af 6)',
    },
    {
      src: 'uploads/gallery/mad-5.jpg',
      alt: 'Billede fra Hestestalden – mad (5 af 6)',
    },
    {
      src: 'uploads/gallery/mad-6.jpg',
      alt: 'Billede fra Hestestalden – mad (6 af 6)',
    },
  ];

  const rotateInterval = 18000;
  let activeIndex = 0;
  let intervalHandle = null;
  let isTransitioning = false;

  const preloadImage = (src) =>
    new Promise((resolve) => {
      const image = new Image();
      image.src = src;

      if (image.complete) {
        resolve();
        return;
      }

      image.addEventListener('load', () => resolve(), { once: true });
      image.addEventListener('error', () => resolve(), { once: true });
    });

  const setSlide = async (nextIndex) => {
    if (isTransitioning) {
      return;
    }

    const nextSlide = slides[nextIndex];
    if (!nextSlide) {
      return;
    }

    isTransitioning = true;
    slideshowImage.classList.add('is-transitioning');

    await new Promise((resolve) => {
      window.setTimeout(resolve, 520);
    });

    await preloadImage(nextSlide.src);

    slideshowImage.src = nextSlide.src;
    slideshowImage.alt = nextSlide.alt;
    activeIndex = nextIndex;

    requestAnimationFrame(() => {
      slideshowImage.classList.remove('is-transitioning');
      isTransitioning = false;
    });
  };

  const showNextSlide = () => {
    const nextIndex = (activeIndex + 1) % slides.length;
    setSlide(nextIndex);
  };

  const startRotation = () => {
    if (intervalHandle || document.hidden) {
      return;
    }

    intervalHandle = window.setInterval(showNextSlide, rotateInterval);
  };

  const stopRotation = () => {
    if (!intervalHandle) {
      return;
    }

    window.clearInterval(intervalHandle);
    intervalHandle = null;
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopRotation();
      return;
    }

    startRotation();
  });

  startRotation();
};

initializeHomepageSlideshow();
