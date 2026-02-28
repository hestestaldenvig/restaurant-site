const netlifyIdentityRedirectTokenKeys = [
  'invite_token',
  'confirmation_token',
  'recovery_token',
  'access_token',
  'token',
];

const shouldRedirectToAdminForIdentityToken = () => {
  const { pathname, search, hash } = window.location;
  const isAdminPath = pathname === '/admin' || pathname === '/admin/';

  if (isAdminPath) {
    return false;
  }

  const urlState = `${search}${hash}`;
  return netlifyIdentityRedirectTokenKeys.some((tokenKey) => urlState.includes(tokenKey));
};

if (shouldRedirectToAdminForIdentityToken()) {
  const redirectSuffix = `${window.location.search}${window.location.hash}`;
  window.location.replace(`/admin/${redirectSuffix}`);
}

const MOBILE_BREAKPOINT = 48 * 16;
const page = document.body.dataset.page;
const menuToggle = document.querySelector('.menu-toggle');
const primaryNav = document.querySelector('#primary-navigation');
const navLinks = document.querySelectorAll('.primary-nav a');

let hasBoundResponsiveLayoutListener = false;
let responsiveLayoutDebounceHandle = null;

const resetBodyScrollLock = () => {
  document.body.classList.remove('nav-open');
  document.body.style.overflow = '';
};

const closeMobileNavigation = () => {
  if (!primaryNav || !menuToggle) {
    resetBodyScrollLock();
    return;
  }

  primaryNav.classList.remove('is-open');
  menuToggle.setAttribute('aria-expanded', 'false');
  resetBodyScrollLock();
};

const ensureMainContentVisible = () => {
  const pageContent = document.querySelector('.page-content');
  const mainContent = document.querySelector('main');

  [pageContent, mainContent].forEach((element) => {
    if (!element) {
      return;
    }

    element.removeAttribute('hidden');
    element.classList.remove('hidden');
  });
};

const applyResponsiveLayoutState = () => {
  ensureMainContentVisible();

  if (window.innerWidth >= MOBILE_BREAKPOINT) {
    closeMobileNavigation();
  }
};

const initializeSiteNavigation = () => {
  navLinks.forEach((link) => {
    if (link.dataset.page === page) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    }

    link.addEventListener('click', closeMobileNavigation);
  });

  if (menuToggle && primaryNav) {
    menuToggle.addEventListener('click', () => {
      const expanded = menuToggle.getAttribute('aria-expanded') === 'true';
      const shouldOpen = !expanded;

      menuToggle.setAttribute('aria-expanded', String(shouldOpen));
      primaryNav.classList.toggle('is-open', shouldOpen);
      document.body.classList.toggle('nav-open', shouldOpen);

      if (shouldOpen) {
        document.body.style.overflow = 'hidden';
      } else {
        resetBodyScrollLock();
      }
    });
  }
};

const bindResponsiveLayoutHandler = () => {
  if (hasBoundResponsiveLayoutListener) {
    return;
  }

  window.addEventListener('resize', () => {
    window.clearTimeout(responsiveLayoutDebounceHandle);
    responsiveLayoutDebounceHandle = window.setTimeout(() => {
      applyResponsiveLayoutState();
    }, 180);
  });

  hasBoundResponsiveLayoutListener = true;
};

const initializeResponsiveLayout = () => {
  resetBodyScrollLock();
  closeMobileNavigation();
  initializeSiteNavigation();
  applyResponsiveLayoutState();
  bindResponsiveLayoutHandler();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeResponsiveLayout, { once: true });
} else {
  initializeResponsiveLayout();
}

window.addEventListener('beforeunload', resetBodyScrollLock);
window.addEventListener('pageshow', closeMobileNavigation);

const pdfWorkerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const pdfGridRenderers = new Map();
const pdfResizeDebounceMs = 260;
const pdfMobileViewportMaxWidth = 768;
const pdfResizeWidthThreshold = 24;
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
        if (renderer.isLoaded && !renderer.container.closest('[hidden]') && renderer.shouldRerenderOnResize()) {
          renderer.renderPages({ reason: 'resize' }).catch(renderer.showErrorState);
        }
      });
    }, pdfResizeDebounceMs);
  });

  hasBoundResizeListener = true;
};

const renderPdfToGrid = async (pdfUrl, containerElement, statusElement, options = {}) => {
  if (!containerElement || !window.pdfjsLib) {
    return null;
  }

  const encodedPdfUrl = encodeURI(pdfUrl);
  const loadingMessage = options.loadingMessage || 'Indlæser menu...';
  const idleMessage = options.idleMessage || 'Vælg arrangementet for at indlæse menuen.';
  const baseErrorMessage = options.errorMessage || 'PDF-filen kan ikke vises lige nu.';
  const ariaLabelPrefix = options.ariaLabelPrefix || 'Menu side';
  const maxPages = Number.isInteger(options.maxPages) ? Math.max(options.maxPages, 1) : null;

  if (!containerElement.dataset.pdfRendererId) {
    containerElement.dataset.pdfRendererId = `pdf-${Math.random().toString(36).slice(2, 10)}`;
  }

  const rendererKey = `${containerElement.dataset.pdfRendererId}::${encodedPdfUrl}::${maxPages || 'all'}`;

  if (pdfGridRenderers.has(rendererKey)) {
    return pdfGridRenderers.get(rendererKey);
  }


  let pdfDocument = null;
  let renderCycle = 0;
  let lastRenderedContainerWidth = 0;

  const showErrorState = (message) => {
    const fallbackMessage = `${baseErrorMessage} (sti: ${pdfUrl})`;
    const fullMessage = message || fallbackMessage;

    if (statusElement) {
      statusElement.textContent = fullMessage;
      statusElement.classList.add('menu-status-error');
      statusElement.hidden = false;
    }

    containerElement.innerHTML = '';
    containerElement.style.minHeight = '';
    if (!statusElement) {
      const errorNotice = document.createElement('p');
      errorNotice.className = 'menu-status menu-status-error';
      errorNotice.textContent = fullMessage;
      containerElement.appendChild(errorNotice);
    }
  };

  const renderPages = async ({ reason = 'default' } = {}) => {
    if (!pdfDocument) {
      return;
    }

    const containerWidth = containerElement.clientWidth;
    if (!containerWidth) {
      if (statusElement) {
        statusElement.textContent = idleMessage;
      }
      return;
    }

    if (reason === 'resize' && window.innerWidth <= pdfMobileViewportMaxWidth) {
      return;
    }

    if (reason === 'resize' && lastRenderedContainerWidth > 0) {
      const widthDelta = Math.abs(containerWidth - lastRenderedContainerWidth);
      if (widthDelta < pdfResizeWidthThreshold) {
        return;
      }
    }

    renderCycle += 1;
    const activeRenderCycle = renderCycle;

    const placeholderMinHeight = Math.max(Math.round(containerElement.getBoundingClientRect().height), 320);
    containerElement.innerHTML = '';
    containerElement.style.minHeight = `${placeholderMinHeight}px`;

    const loadingPlaceholder = document.createElement('div');
    loadingPlaceholder.className = 'menu-page';
    loadingPlaceholder.style.minHeight = `${placeholderMinHeight}px`;
    containerElement.appendChild(loadingPlaceholder);

    if (statusElement) {
      statusElement.textContent = loadingMessage;
      statusElement.classList.remove('menu-status-error');
      statusElement.hidden = false;
    }

    const wrapperStyles = window.getComputedStyle(loadingPlaceholder);
    const wrapperHorizontalPadding =
      (Number.parseFloat(wrapperStyles.paddingLeft || '0') || 0) +
      (Number.parseFloat(wrapperStyles.paddingRight || '0') || 0);
    const renderWidth = Math.max(containerWidth - wrapperHorizontalPadding, 1);

    const pageCount = maxPages ? Math.min(pdfDocument.numPages, maxPages) : pdfDocument.numPages;
    const pageFragment = document.createDocumentFragment();

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const pageHandle = await pdfDocument.getPage(pageNumber);
      const baseViewport = pageHandle.getViewport({ scale: 1 });
      const scale = renderWidth / baseViewport.width;
      const viewport = pageHandle.getViewport({ scale });

      const pageWrapper = document.createElement('div');
      pageWrapper.className = 'menu-page';

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
      pageFragment.appendChild(pageWrapper);
    }

    if (activeRenderCycle !== renderCycle) {
      return;
    }

    containerElement.replaceChildren(pageFragment);
    containerElement.style.minHeight = '';
    lastRenderedContainerWidth = containerWidth;

    if (statusElement) {
      statusElement.hidden = true;
    }
  };

  const loadAndRender = async () => {
    try {
      if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
      }

      if (!pdfDocument) {
        if (statusElement) {
          statusElement.textContent = loadingMessage;
          statusElement.classList.remove('menu-status-error');
          statusElement.hidden = false;
        }
        const loadingTask = window.pdfjsLib.getDocument(encodedPdfUrl);
        pdfDocument = await loadingTask.promise;
      }

      await renderPages();
    } catch (error) {
      const isMissingPdf =
        error?.name === 'MissingPDFException'
        || error?.status === 404
        || String(error?.message || '').includes('404');
      const loadErrorMessage = isMissingPdf
        ? `PDF-filen blev ikke fundet (404): ${pdfUrl}`
        : `${baseErrorMessage} (sti: ${pdfUrl})`;
      showErrorState(loadErrorMessage);
    }
  };

  const renderer = {
    container: containerElement,
    status: statusElement,
    showErrorState,
    renderPages,
    ensureRendered: loadAndRender,
    shouldRerenderOnResize() {
      if (window.innerWidth <= pdfMobileViewportMaxWidth) {
        return false;
      }

      if (!lastRenderedContainerWidth) {
        return true;
      }

      const currentWidth = containerElement.clientWidth;
      return Math.abs(currentWidth - lastRenderedContainerWidth) >= pdfResizeWidthThreshold;
    },
    get isLoaded() {
      return Boolean(pdfDocument);
    },
  };

  pdfGridRenderers.set(rendererKey, renderer);
  bindPdfResizeHandler();

  return renderer;
};

const renderPdfFirstPage = async (pdfUrl, containerElement) => {
  const renderer = await renderPdfToGrid(pdfUrl, containerElement, null, {
    maxPages: 1,
    ariaLabelPrefix: 'PDF forhåndsvisning side',
  });

  if (renderer) {
    await renderer.ensureRendered();
  }
};

const renderPdfAllPages = async (pdfUrl, containerElement) => {
  const renderer = await renderPdfToGrid(pdfUrl, containerElement, null, {
    ariaLabelPrefix: 'PDF side',
  });

  if (renderer) {
    await renderer.ensureRendered();
  }
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
  const arrangementContactCta = document.querySelector('#arrangement-contact-cta');

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

  const updateArrangementContactCta = () => {
    if (!arrangementContactCta) {
      return;
    }

    const activeOption = arrangementSelect.options[arrangementSelect.selectedIndex];
    const arrangementType = activeOption && arrangementSelect.value ? activeOption.text.trim() : 'Speciel';
    const subject = `${arrangementType} forespørgsel`;
    arrangementContactCta.href = `kontakt.html?subject=${encodeURIComponent(subject)}`;
  };

  arrangementSelect.addEventListener('change', () => {
    updateArrangementDisplay();
    updateArrangementContactCta();
  });

  hideAllSections();
  defaultMessage.classList.remove('hidden');
  defaultMessage.hidden = false;
  updateArrangementContactCta();
};

initializeArrangementSelector();

const initializeContactSubjectPrefill = () => {
  if (document.body.dataset.page !== 'kontakt') {
    return;
  }

  const subjectInput = document.querySelector('#subject');
  if (!subjectInput) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const subjectFromQuery = params.get('subject');

  if (subjectFromQuery) {
    subjectInput.value = subjectFromQuery;
  }
};

initializeContactSubjectPrefill();

const formatNewsDate = (dateString) => {
  const parsedDate = new Date(dateString);
  if (Number.isNaN(parsedDate.getTime())) {
    return dateString;
  }

  return new Intl.DateTimeFormat('da-DK', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parsedDate);
};

const escapeHtml = (value) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderNewsImages = (images = []) => {
  if (!Array.isArray(images) || !images.length) {
    return '';
  }

  const imageItems = images
    .map(
      (imagePath, index) => `
      <li>
        <button type="button" class="gallery-item" data-lightbox-src="${escapeHtml(imagePath)}" data-lightbox-alt="Nyhedsbillede ${index + 1}">
          <img src="${escapeHtml(imagePath)}" alt="Nyhedsbillede ${index + 1}" loading="lazy" />
        </button>
      </li>
    `,
    )
    .join('');

  return `<ul class="gallery-grid gallery-grid--photos news-image-grid">${imageItems}</ul>`;
};

const fetchNewsPosts = async () => {
  const response = await fetch('/content/news.json');
  if (!response.ok) {
    throw new Error('Kunne ikke hente nyheder.');
  }

  const newsPosts = await response.json();
  if (!Array.isArray(newsPosts)) {
    return [];
  }

  return newsPosts.sort((a, b) => new Date(b.date) - new Date(a.date));
};

const initializeNewsOverview = async () => {
  const newsList = document.querySelector('#news-list, #news-overview-list');
  const pathname = window.location.pathname || '';
  const isNewsPage = pathname.endsWith('nyheder.html') || pathname === '/nyheder' || Boolean(newsList);

  if (!isNewsPage || !newsList) {
    return;
  }

  newsList.innerHTML = '<p>Indlæser nyheder...</p>';

  try {
    const posts = await fetchNewsPosts();
    if (!posts.length) {
      newsList.innerHTML = '<p>Der er ingen nyheder endnu.</p>';
      return;
    }

    newsList.innerHTML = posts
      .map(
        (post) => `
        <article class="news-item">
          <p class="meta">${formatNewsDate(post.date)}</p>
          <h2>${escapeHtml(post.title)}</h2>
          <p>${escapeHtml(post.excerpt || '')}</p>
          ${renderNewsImages(post.images)}
          ${post.pdf ? `<div class="news-pdf-preview" data-news-pdf-preview="${escapeHtml(post.pdf.url)}"></div>` : ''}
          <a class="news-read-more" href="/nyhed.html?id=${encodeURIComponent(post.id)}">Læs mere</a>
        </article>
      `,
      )
      .join('');

    const pdfPreviewContainers = newsList.querySelectorAll('[data-news-pdf-preview]');
    pdfPreviewContainers.forEach((container) => {
      const pdfUrl = container.getAttribute('data-news-pdf-preview');
      if (pdfUrl) {
        renderPdfFirstPage(pdfUrl, container);
      }
    });
  } catch (error) {
    newsList.innerHTML = '<p>Kunne ikke indlæse nyheder. Prøv igen senere.</p>';
  }
};

initializeNewsOverview();

const initializeSingleNews = async () => {
  if (window.location.pathname.split('/').pop() !== 'nyhed.html') {
    return;
  }

  const article = document.querySelector('#single-news-article');
  if (!article) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const postId = params.get('id');

  if (!postId) {
    article.innerHTML = '<p>Nyheden blev ikke fundet.</p><a class="news-back-link" href="nyheder.html">Tilbage til nyheder</a>';
    return;
  }

  try {
    const posts = await fetchNewsPosts();
    const post = posts.find((item) => item.id === postId);

    if (!post) {
      article.innerHTML = '<p>Nyheden blev ikke fundet.</p><a class="news-back-link" href="nyheder.html">Tilbage til nyheder</a>';
      return;
    }

    const bodyParagraphs = String(post.body || '')
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
      .join('');

    article.innerHTML = `
      <a class="news-back-link" href="nyheder.html">← Tilbage til nyheder</a>
      <p class="meta">${formatNewsDate(post.date)}</p>
      <h1>${escapeHtml(post.title)}</h1>
      ${bodyParagraphs}
      ${renderNewsImages(post.images)}
      ${
        post.pdf
          ? `
        <section class="news-pdf-section">
          <h2>${escapeHtml(post.pdf.title || 'Vedhæftet PDF')}</h2>
          <div id="news-pdf-pages" class="menu-pages news-pdf-pages"></div>
          <div class="menu-actions news-pdf-actions">
            <a class="btn btn-primary" href="${escapeHtml(post.pdf.url)}" target="_blank" rel="noopener">Åbn PDF</a>
            <a class="btn btn-secondary" href="${escapeHtml(post.pdf.url)}" download>Download PDF</a>
          </div>
        </section>
      `
          : ''
      }
    `;

    if (post.pdf) {
      const pdfContainer = article.querySelector('#news-pdf-pages');
      if (pdfContainer) {
        await renderPdfAllPages(post.pdf.url, pdfContainer);
      }
    }
  } catch (error) {
    article.innerHTML = '<p>Nyheden kunne ikke indlæses lige nu.</p><a class="news-back-link" href="nyheder.html">Tilbage til nyheder</a>';
  }
};

initializeSingleNews();

const initializeGalleryLightbox = () => {
  const lightbox = document.querySelector('#gallery-lightbox');
  const lightboxImage = document.querySelector('#lightbox-image');
  const lightboxCloseElements = document.querySelectorAll('[data-lightbox-close]');

  if (!lightbox || !lightboxImage) {
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

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-lightbox-src]');
    if (!trigger) {
      return;
    }

    const source = trigger.dataset.lightboxSrc;
    const altText = trigger.dataset.lightboxAlt || '';

    if (source) {
      openLightbox(source, altText);
    }
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
