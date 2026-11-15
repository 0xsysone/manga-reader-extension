import { i18n } from '#i18n';
import { chapterFromUrl } from '@/domain/chapter';
import { fitPage, referenceRatio, resolveDouble } from '@/domain/layout';
import { ANIMATIONS, VIEW_MODES, cycle, normalizeSettings } from '@/domain/settings';
import { buildSpreads, spreadIndexForPage, spreadLabel, spreadSides } from '@/domain/spreads';
import type {
  Chapter,
  ChapterDirection,
  ReaderAction,
  ReaderHandle,
  ReaderNotice,
  ReaderOptions,
  Settings,
  Spread,
} from '@/shared/types';
import { flipDouble, flipSingle } from './animations/flip';
import { FLIP_FAST_MS, FLIP_MS, SINGLE_FLIP_FACTOR, SLIDE_FAST_FACTOR, SLIDE_MS } from './animations/timing';
import { crossfade, nudge, slide } from './animations/transitions';
import { BOOK_PADDING, Book, PageRenderer, type BookLayout } from './book';
import { Disposer } from './disposer';
import { clamp, h, isWebUrl, reflow, releaseCanvases, setText, type Child } from './dom';
import { icon } from './icons';
import { bindInput, type KeyDisposition } from './input';
import { PageLoader } from './page-loader';
import { Dock } from './view/dock';
import { Flash } from './view/flash';
import { HelpDialog } from './view/help-dialog';
import { Toast, TOAST_MS } from './view/toast';
import { ANIMATION_ICONS, TopBar, animationLabel, modeLabel } from './view/top-bar';

/** Fade-out of the reader before it is removed from the page. */
export const CLOSE_MS = 420;
/** How long the interface stays visible without mouse activity. */
const UI_IDLE_MS = 2600;
/** How long the interface stays visible when the reader opens. */
const UI_INITIAL_MS = 3200;
/** Longest wait for the size of the first pages before the book is laid out. */
const PROBE_TIMEOUT_MS = 1600;
/** Longest wait for the pages of the next spread before turning anyway (normal / chained turns). */
const READY_TIMEOUT_MS = 380;
const READY_FAST_TIMEOUT_MS = 140;
/** Debounce of re-layouts caused by page sizes learned while reading. */
const RATIO_REFRESH_MS = 60;
/** Page turns remembered while an animation runs. */
const MAX_QUEUED_TURNS = 3;
/** An auto-repeated key adds no turn once this many are queued. */
const MAX_QUEUED_REPEATS = 2;
/** If the page did not change chapter after this delay, the reader comes back. */
const NAVIGATION_RECOVERY_MS = 15_000;
/** Horizontal travel (px) of the stage when leaving for another chapter. */
const STAGE_EXIT_SHIFT = 40;
const STAGE_EXIT_TRANSITION = 'opacity .35s ease, transform .5s cubic-bezier(.16,1,.3,1)';
const STAGE_ENTER_TRANSITION = 'opacity .45s ease, transform .6s cubic-bezier(.16,1,.3,1)';
const STAGE_ENTER_SCALE = 0.985;

type Edge = 'start' | 'end';
type TransitionKind = 'forward' | 'back' | 'fade' | 'none';
type QueuedTurn = { kind: 'step'; delta: 1 | -1; repeat: boolean } | { kind: 'edge'; edge: 'first' | 'last' };

/** Where the reader lives in the page. */
export interface ReaderMount {
  /** Element added to the page (hosts the shadow root; goes fullscreen). */
  host: HTMLElement;
  /** Element inside the shadow root that receives the reader. */
  container: HTMLElement;
  /** Removes the reader from the page (calls {@link Reader.dispose}). */
  remove: () => void;
}

/** Everything that changes while reading, in one typed place. */
interface ReaderState {
  settings: Settings;
  chapter: Chapter;
  /** First page of the current spread. */
  pageIndex: number;
  spreadIndex: number;
  spreads: Spread[];
  layout: BookLayout;
  /** The current chapter is laid out (page sizes probed). */
  ready: boolean;
  animating: boolean;
  queue: QueuedTurn[];
  /** A re-layout requested during an animation (`fade` wins over `none`). */
  pendingRefresh: 'fade' | 'none' | null;
  /** A visible page arrived during an animation. */
  pendingRepaint: boolean;
  /** Boundary toast shown: pressing toward the same edge again changes chapter. */
  boundary: Edge | null;
  /** A notice from the caller is shown in the toast. */
  notice: boolean;
  zoomed: boolean;
  scrubbing: boolean;
  hoverBar: boolean;
  focusInBar: boolean;
  /** Chapter change requested, the stage is faded out. */
  navigating: ChapterDirection | null;
  reduceMotion: boolean;
  mouse: { x: number; y: number } | null;
}

const viewport = (): { width: number; height: number } => ({
  width: window.innerWidth,
  height: window.innerHeight,
});

/**
 * The full-screen reader: owns its DOM, the open book, every view part and every resource, and orchestrates
 * navigation, animations and settings. Created by `openReader()`.
 */
export class Reader {
  /** Public surface handed to the content script. */
  readonly handle: ReaderHandle;

  private readonly disposer = new Disposer();
  /** Resources of the current chapter (loader, live subscription, running transition). */
  private chapterScope: Disposer;
  private loader: PageLoader;
  private renderer: PageRenderer;
  private readonly state: ReaderState;
  private book: Book | null = null;
  private closing = false;
  private disposed = false;
  private removeTimer = 0;
  private uiTimer: number | undefined;
  private ratioTimer: number | undefined;
  private navigationTimer: number | undefined;
  private savedOverflow: [string, string] = ['', ''];
  private previousFocus: Element | null = null;

  private readonly root: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly zoom: HTMLElement;
  private readonly zoneLeft: HTMLElement;
  private readonly zoneRight: HTMLElement;
  private readonly zoneLeftLabel: HTMLElement;
  private readonly zoneRightLabel: HTMLElement;
  private readonly spinner: HTMLElement;
  private readonly topBar: TopBar;
  private readonly dock: Dock;
  private readonly toast: Toast;
  private readonly flash: Flash;
  private readonly help: HelpDialog;

  constructor(
    private readonly mount: ReaderMount,
    private readonly options: ReaderOptions,
  ) {
    const settings = normalizeSettings(options.settings);
    this.chapterScope = this.disposer.child();
    this.loader = new PageLoader([], () => undefined);
    this.renderer = new PageRenderer(this.loader, viewport);
    this.state = {
      settings,
      chapter: options.chapter,
      pageIndex: 0,
      spreadIndex: 0,
      spreads: [],
      layout: {
        double: false,
        pageSize: { width: 0, height: 0 },
        viewport: viewport(),
        referenceRatio: 0,
        direction: settings.direction,
      },
      ready: false,
      animating: false,
      queue: [],
      pendingRefresh: null,
      pendingRepaint: false,
      boundary: null,
      notice: false,
      zoomed: false,
      scrubbing: false,
      hoverBar: false,
      focusInBar: false,
      navigating: null,
      reduceMotion: false,
      mouse: null,
    };

    const decorative = (className: string): HTMLElement => {
      const node = h('div', className);
      node.setAttribute('aria-hidden', 'true');
      return node;
    };
    this.zoom = h('div', 'mr-zoom');
    this.stage = h('div', 'mr-stage', [this.zoom]);
    this.zoneLeftLabel = h('div', 'mr-hint-label');
    this.zoneRightLabel = h('div', 'mr-hint-label');
    this.zoneLeft = decorative('mr-zone left');
    this.zoneLeft.append(h('div', 'mr-hint', [h('div', 'mr-hint-btn', [icon('left')]), this.zoneLeftLabel]));
    this.zoneRight = decorative('mr-zone right');
    this.zoneRight.append(
      h('div', 'mr-hint', [h('div', 'mr-hint-btn', [icon('right')]), this.zoneRightLabel]),
    );

    this.topBar = new TopBar({
      perform: (action) => this.perform(action, false),
      setMode: (mode) => this.setSetting('mode', mode, false),
    });
    this.dock = new Dock(
      {
        chapter: (direction) => this.navigateChapter(direction, true),
        jumpTo: (page) => this.jumpToPage(page),
        step: (delta) => this.go(delta, false),
        edge: (edge) => this.jumpToEdge(edge),
        thumbnail: (page) => this.loader.thumbnail(page),
        dragging: (active) => {
          this.state.scrubbing = active;
          if (!active) this.showUi();
        },
      },
      this.disposer,
    );
    this.toast = new Toast(this.disposer, () => {
      this.state.boundary = null;
      this.state.notice = false;
    });
    this.flash = new Flash(this.disposer);
    this.help = new HelpDialog(() => this.toggleHelp(false));
    this.spinner = decorative('mr-loader');

    this.root = h('div', 'mr', [
      decorative('mr-bg'),
      decorative('mr-grain'),
      this.stage,
      this.zoneLeft,
      this.zoneRight,
      this.topBar.element,
      this.dock.element,
      this.toast.element,
      this.flash.element,
      this.spinner,
      this.help.element,
    ]);
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.tabIndex = -1;
    this.root.dataset.theme = settings.theme;
    mount.container.append(this.root);

    const isOpen = (): boolean => !this.closing && !this.disposed;
    this.handle = {
      get isOpen() {
        return isOpen();
      },
      updateSettings: (next) => this.updateSettings(next),
      replaceChapter: (chapter, startPage) => this.replaceChapter(chapter, startPage),
      showNotice: (notice) => this.showNotice(notice),
      close: () => this.close(),
    };
  }

  /* ------------------------------------------------------------------ lifecycle */

  /** Locks the page, binds the input, moves the focus in and loads the chapter. */
  start(): void {
    const { documentElement, body } = document;
    this.savedOverflow = [documentElement.style.overflow, body.style.overflow];
    documentElement.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    this.previousFocus = document.activeElement;

    this.disposer.add(
      bindInput(
        {
          host: this.mount.host,
          root: this.root,
          stage: this.stage,
          zoneLeft: this.zoneLeft,
          zoneRight: this.zoneRight,
        },
        {
          direction: () => this.state.settings.direction,
          isZoomed: () => this.state.zoomed,
          perform: (action, repeat) => this.perform(action, repeat),
          routeKey: (event) => this.routeKey(event),
          toggleUi: () => this.toggleUi(),
          toggleZoom: (x, y) => this.toggleZoom(x, y),
          pan: (x, y) => this.panZoom(x, y),
          mouseMove: (x, y, noticeable) => {
            this.state.mouse = { x, y };
            if (noticeable) this.showUi();
          },
          resize: () => void this.refresh(false),
          fullscreenChange: () => this.updateChrome(0),
        },
      ),
    );
    for (const bar of [this.topBar.element, this.dock.element]) {
      this.disposer.listen(bar, 'mouseenter', () => {
        this.state.hoverBar = true;
        this.showUi();
      });
      this.disposer.listen(bar, 'mouseleave', () => {
        this.state.hoverBar = false;
        this.showUi();
      });
      this.disposer.listen(bar, 'focusin', () => {
        this.state.focusInBar = true;
        this.showUi();
      });
      this.disposer.listen(bar, 'focusout', (event) => {
        const next = event.relatedTarget;
        this.state.focusInBar =
          next instanceof Node && (this.topBar.element.contains(next) || this.dock.element.contains(next));
        this.showUi();
      });
    }
    this.watchReducedMotion();
    // Back from the back/forward cache after leaving for another chapter: bring the reader back.
    this.disposer.listen(window, 'pageshow', (event) => {
      if (event.persisted && this.state.navigating) this.restoreStage();
    });

    reflow(this.root);
    this.root.classList.add('is-open');
    this.root.focus({ preventScroll: true });
    this.loadChapter(this.options.chapter, this.options.startPage, true);
  }

  /** Plays the closing fade, then removes the reader and tells the caller. */
  close(): void {
    if (this.closing || this.disposed) return;
    this.closing = true;
    this.root.classList.remove('is-open');
    if (document.fullscreenElement === this.mount.host) document.exitFullscreen().catch(() => undefined);
    this.release();
    this.removeTimer = window.setTimeout(
      () => {
        this.removeTimer = 0;
        this.mount.remove();
        this.options.callbacks.onClose();
      },
      this.state.reduceMotion ? 0 : CLOSE_MS,
    );
  }

  /** Releases everything at once (also called when the page removes the UI or the extension reloads). */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.removeTimer) window.clearTimeout(this.removeTimer);
    this.removeTimer = 0;
    this.release();
    releaseCanvases(this.root);
  }

  /** Stops every listener, timer, animation and load; gives the page its scroll and focus back. */
  private release(): void {
    if (this.disposer.isDisposed) return;
    this.disposer.dispose();
    this.book = null;
    const { documentElement, body } = document;
    documentElement.style.overflow = this.savedOverflow[0];
    body.style.overflow = this.savedOverflow[1];
    const focus = this.previousFocus;
    this.previousFocus = null;
    if (focus instanceof HTMLElement && focus.isConnected) focus.focus({ preventScroll: true });
  }

  private watchReducedMotion(): void {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.state.reduceMotion = query.matches;
    this.disposer.listen(query, 'change', (event) => {
      this.state.reduceMotion = event.matches;
    });
  }

  /* ------------------------------------------------------------------ chapters */

  /** Starts showing `chapter` (resources of the previous one must already be released). */
  private loadChapter(chapter: Chapter, startPage: number, first: boolean): void {
    const scope = this.disposer.child();
    this.chapterScope = scope;
    const loader = new PageLoader(chapter.pages, (index, wideChanged) => this.onRatio(index, wideChanged));
    scope.add(() => loader.dispose());
    this.loader = loader;
    this.renderer = new PageRenderer(loader, () => this.state.layout.viewport);
    const state = this.state;
    state.chapter = chapter;
    state.ready = false;
    state.spreads = [];
    state.spreadIndex = 0;
    state.pageIndex = clamp(Math.floor(startPage) || 0, 0, Math.max(0, chapter.pages.length - 1));

    this.topBar.setChapter(chapter.meta, document.title);
    this.root.setAttribute('aria-label', chapter.meta.title || document.title);
    if (loader.pages.some((page) => !page.ratio)) this.setLoading(true);

    const { live } = chapter;
    if (live) {
      const unsubscribe = live.subscribe((index, element) => this.onLivePage(scope, index, element));
      scope.add(unsubscribe);
    }

    void loader.probeRatios(state.pageIndex, PROBE_TIMEOUT_MS).then(() => {
      if (scope.isDisposed) return;
      state.ready = true;
      if (!state.navigating) this.setLoading(false);
      this.relayout();
      this.renderCurrent();
      this.updateChrome(0);
      loader.preloadAround(state.pageIndex);
      if (first) {
        reflow(this.root);
        this.root.classList.add('is-ready');
        this.topBar.positionPill(state.settings.mode);
        this.showUi(UI_INITIAL_MS);
      } else {
        this.restoreStage();
      }
      this.notifyPage();
    });
  }

  /** Another chapter, without closing: every resource of the current one is released first. */
  private replaceChapter(chapter: Chapter, startPage: number): void {
    if (this.closing || this.disposed) return;
    this.chapterScope.dispose();
    const state = this.state;
    state.queue = [];
    state.animating = false;
    state.pendingRefresh = null;
    state.pendingRepaint = false;
    this.disposer.clearTimeout(this.ratioTimer);
    if (state.zoomed) this.toggleZoom();
    if (state.boundary) this.toast.hide();
    // The old book stays on screen (detached from the state) until the new chapter is laid out.
    this.book = null;
    this.loadChapter(chapter, startPage, false);
  }

  private hasChapter(direction: ChapterDirection): boolean {
    const { meta, inPage } = this.state.chapter;
    return (direction === 'next' ? meta.nextUrl : meta.prevUrl) !== null || inPage !== undefined;
  }

  /** Label of the previous / next chapter: `''` when unknown, `null` when there is none. */
  private chapterLabel(direction: ChapterDirection): string | null {
    if (!this.hasChapter(direction)) return null;
    const { meta } = this.state.chapter;
    const label = direction === 'next' ? meta.nextLabel : meta.prevLabel;
    return label ?? chapterFromUrl(direction === 'next' ? meta.nextUrl : meta.prevUrl);
  }

  /** Plays the exit of the stage and asks the caller to load the other chapter. */
  private navigateChapter(direction: ChapterDirection, fromShortcut: boolean): void {
    if (!this.hasChapter(direction)) {
      if (fromShortcut)
        this.flash.show('list', i18n.t(direction === 'next' ? 'noNextChapter' : 'noPrevChapter'));
      return;
    }
    if (this.state.navigating) return;
    this.toast.hide();
    this.state.navigating = direction;
    this.setLoading(true);
    const sign = (direction === 'next') === (this.state.settings.direction === 'rtl') ? 1 : -1;
    this.stage.style.transition = STAGE_EXIT_TRANSITION;
    this.stage.style.opacity = '0';
    this.stage.style.transform = this.state.reduceMotion ? '' : `translateX(${sign * STAGE_EXIT_SHIFT}px)`;
    this.disposer.clearTimeout(this.navigationTimer);
    this.navigationTimer = this.disposer.timeout(() => this.restoreStage(), NAVIGATION_RECOVERY_MS);
    this.options.callbacks.onNavigateChapter(direction);
  }

  /** Brings the stage back (new chapter shown, navigation failed or abandoned). */
  private restoreStage(): void {
    this.state.navigating = null;
    this.disposer.clearTimeout(this.navigationTimer);
    this.navigationTimer = undefined;
    if (this.state.ready) this.setLoading(false);
    const stage = this.stage;
    stage.style.transition = 'none';
    stage.style.transform = this.state.reduceMotion ? '' : `scale(${STAGE_ENTER_SCALE})`;
    reflow(stage);
    stage.style.transition = STAGE_ENTER_TRANSITION;
    stage.style.opacity = '';
    stage.style.transform = '';
  }

  private showNotice(notice: ReaderNotice | null): void {
    if (this.closing || this.disposed) return;
    if (this.state.navigating) this.restoreStage();
    if (!notice) {
      if (this.state.notice) this.toast.hide();
      return;
    }
    const { action } = notice;
    this.toast.show(
      {
        title: notice.title,
        detail: [notice.detail],
        ...(action ? { action: { label: action.label, run: () => action.run() } } : {}),
      },
      null,
    );
    this.state.boundary = null;
    this.state.notice = true;
  }

  private onLivePage(scope: Disposer, index: number, element: HTMLImageElement): void {
    if (scope.isDisposed) return;
    if (!this.loader.setElement(index, element) || !this.state.ready) return;
    if (this.state.animating) {
      this.state.pendingRepaint = true;
      return;
    }
    if (this.state.spreads[this.state.spreadIndex]?.pages.includes(index)) this.renderCurrent();
  }

  private notifyPage(): void {
    this.options.callbacks.onPageChange(this.state.pageIndex);
    this.state.chapter.live?.syncTo(this.state.pageIndex);
  }

  /* ------------------------------------------------------------------ settings */

  private setSetting<K extends keyof Settings>(key: K, value: Settings[K], flash: boolean): void {
    if (this.state.settings[key] === value) return;
    this.applySettings({ ...this.state.settings, [key]: value }, flash ? key : null);
    this.options.callbacks.onSettingsChange(this.state.settings);
  }

  /** Settings changed elsewhere (popup, another tab). */
  private updateSettings(settings: Settings): void {
    if (this.closing || this.disposed) return;
    this.applySettings(normalizeSettings(settings), null);
  }

  private applySettings(next: Settings, flashKey: keyof Settings | null): void {
    const previous = this.state.settings;
    this.state.settings = next;
    this.state.layout.direction = next.direction;
    this.root.dataset.theme = next.theme;
    const layoutChanged =
      previous.mode !== next.mode ||
      previous.direction !== next.direction ||
      previous.firstPageAlone !== next.firstPageAlone;
    if (layoutChanged) void this.refresh(true);
    else this.updateChrome(0);

    const double = this.state.layout.double;
    if (flashKey === 'mode') {
      const label =
        next.mode === 'auto' ? i18n.t(double ? 'autoDoubleFlash' : 'autoSingleFlash') : modeLabel(next.mode);
      this.flash.show(double ? 'double' : 'single', label);
    } else if (flashKey === 'direction') {
      const rtl = next.direction === 'rtl';
      this.flash.show(rtl ? 'rtl' : 'ltr', i18n.t(rtl ? 'dirRtlFlash' : 'dirLtrFlash'));
    } else if (flashKey === 'firstPageAlone') {
      this.flash.show('offset', i18n.t(next.firstPageAlone ? 'coverAlone' : 'pairedFromStart'));
    } else if (flashKey === 'animation') {
      this.flash.show(ANIMATION_ICONS[next.animation], animationLabel(next.animation));
    }
  }

  /* ------------------------------------------------------------------ actions */

  private perform(action: ReaderAction, repeat: boolean): void {
    if (this.closing || this.disposed) return;
    // Only page turns auto-repeat: holding a key never toggles a setting back and forth or closes the reader.
    if (repeat && action !== 'next' && action !== 'prev') return;
    if (this.help.isOpen && action !== 'help' && action !== 'close') this.toggleHelp(false);
    const settings = this.state.settings;
    switch (action) {
      case 'next':
        this.go(1, repeat);
        return;
      case 'prev':
        this.go(-1, repeat);
        return;
      case 'first':
        this.jumpToEdge('first');
        return;
      case 'last':
        this.jumpToEdge('last');
        return;
      case 'toggleUi':
        this.toggleUi();
        return;
      case 'cycleMode':
        this.setSetting('mode', cycle(VIEW_MODES, settings.mode), true);
        return;
      case 'toggleTheme':
        this.setSetting('theme', settings.theme === 'dark' ? 'light' : 'dark', false);
        return;
      case 'toggleDirection':
        this.setSetting('direction', settings.direction === 'rtl' ? 'ltr' : 'rtl', true);
        return;
      case 'toggleOffset':
        if (!this.state.layout.double) this.flash.show('offset', i18n.t('onlyInDouble'));
        else this.setSetting('firstPageAlone', !settings.firstPageAlone, true);
        return;
      case 'cycleAnimation':
        this.setSetting('animation', cycle(ANIMATIONS, settings.animation), true);
        return;
      case 'fullscreen':
        this.toggleFullscreen();
        return;
      case 'zoom': {
        const { width, height } = this.state.layout.viewport;
        const mouse = this.state.mouse ?? { x: width / 2, y: height / 2 };
        this.toggleZoom(mouse.x, mouse.y);
        return;
      }
      case 'nextChapter':
        this.navigateChapter('next', true);
        return;
      case 'prevChapter':
        this.navigateChapter('prev', true);
        return;
      case 'help':
        this.toggleHelp();
        return;
      case 'close':
        if (this.help.isOpen) this.toggleHelp(false);
        else if (this.state.zoomed) this.toggleZoom();
        else if (this.toast.visible) this.toast.hide();
        else this.close();
        return;
    }
  }

  /** Keys for the focused widget first: dialog focus trap, slider, radio group, native button activation. */
  private routeKey(event: KeyboardEvent): KeyDisposition {
    if (this.closing || this.disposed) return 'native';
    if (this.help.trapFocus(event)) return 'handled';
    if (event.key === 'Tab') return this.trapFocus(event) ? 'handled' : 'native';
    if (event.metaKey || event.ctrlKey || event.altKey) return 'shortcut';
    const focused = (this.root.getRootNode() as Document | ShadowRoot).activeElement;
    if (focused === this.dock.scrubber.element && this.dock.scrubber.handleKey(event)) return 'handled';
    if (this.topBar.handleKey(event, focused)) return 'handled';
    const activates = event.key === 'Enter' || event.key === ' ';
    if (activates && focused instanceof HTMLElement && focused.matches('button, a[href]')) return 'native';
    return 'shortcut';
  }

  /** Keeps Tab cycling inside the reader (it is a modal dialog). Returns `true` when the focus was moved. */
  private trapFocus(event: KeyboardEvent): boolean {
    const focusable = [
      ...this.root.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex="0"]'),
    ].filter((element) => !element.closest('[hidden]'));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return false;
    const focused = (this.root.getRootNode() as Document | ShadowRoot).activeElement;
    const inside = focused instanceof Node && this.root.contains(focused) && focused !== this.root;
    let target: HTMLElement | null = null;
    if (!inside) target = event.shiftKey ? last : first;
    else if (!event.shiftKey && focused === last) target = first;
    else if (event.shiftKey && focused === first) target = last;
    if (!target) return false;
    target.focus({ preventScroll: true });
    return true;
  }

  /* ------------------------------------------------------------------ layout */

  private relayout(): void {
    const state = this.state;
    const size = viewport();
    const pages = this.loader.pages;
    const ratio = referenceRatio(pages);
    const double = resolveDouble(
      state.settings.mode,
      size.width - BOOK_PADDING * 2,
      size.height - BOOK_PADDING * 2,
      ratio,
    );
    state.spreads = buildSpreads(pages, { double, firstPageAlone: state.settings.firstPageAlone });
    state.spreadIndex = spreadIndexForPage(state.spreads, state.pageIndex);
    state.layout = {
      double,
      viewport: size,
      referenceRatio: ratio,
      direction: state.settings.direction,
      pageSize: fitPage(size.width, size.height, ratio, double ? 2 : 1, BOOK_PADDING),
    };
  }

  /** Recomputes the layout and shows the current spread again (crossfade when `animate`). */
  private async refresh(animate: boolean): Promise<void> {
    const state = this.state;
    if (!state.ready || this.closing || this.disposed) return;
    if (state.animating) {
      state.pendingRefresh = animate || state.pendingRefresh === 'fade' ? 'fade' : 'none';
      return;
    }
    this.relayout();
    if (animate) {
      await this.runTransition(state.spreadIndex, 'fade');
    } else {
      this.renderCurrent();
      this.updateChrome(0);
      this.drainQueue();
    }
    this.topBar.positionPill(state.settings.mode);
  }

  /** A page size learned while reading changes the layout only if it changes the spreads or the shown page. */
  private onRatio(index: number, wideChanged: boolean): void {
    const state = this.state;
    if (!state.ready) return;
    const shown = state.spreads[state.spreadIndex]?.pages.includes(index) ?? false;
    if (!(state.layout.double ? wideChanged : shown)) return;
    this.disposer.clearTimeout(this.ratioTimer);
    this.ratioTimer = this.disposer.timeout(() => void this.refresh(false), RATIO_REFRESH_MS);
  }

  private createBook(index: number): Book {
    return new Book(index, this.state.spreads[index], this.state.layout, this.renderer, (page) => {
      return this.loader.pages[page]?.ratio ?? 0;
    });
  }

  /** Shows the current spread at once, replacing whatever the stage holds. */
  private renderCurrent(): void {
    const book = this.createBook(this.state.spreadIndex);
    releaseCanvases(this.zoom);
    this.zoom.replaceChildren(book.element);
    this.book = book;
  }

  /* ------------------------------------------------------------------ navigation */

  private go(delta: 1 | -1, repeat: boolean): void {
    const state = this.state;
    if (!state.ready || state.spreads.length === 0 || state.navigating) return;
    if (state.zoomed) this.toggleZoom();
    if (state.animating) {
      if (repeat && state.queue.length >= MAX_QUEUED_REPEATS) return;
      if (state.queue.length < MAX_QUEUED_TURNS) state.queue.push({ kind: 'step', delta, repeat });
      return;
    }
    const to = state.spreadIndex + delta;
    if (to < 0 || to >= state.spreads.length) {
      // A held key stops at the edge: only a deliberate press shows the toast or changes chapter.
      if (!repeat) this.hitBoundary(to < 0 ? 'start' : 'end');
      return;
    }
    if (state.boundary) this.toast.hide();
    void this.runTransition(to, delta > 0 ? 'forward' : 'back');
  }

  private jumpToEdge(edge: 'first' | 'last'): void {
    const state = this.state;
    if (!state.ready || state.navigating) return;
    if (state.animating) {
      if (state.queue.length < MAX_QUEUED_TURNS) state.queue.push({ kind: 'edge', edge });
      return;
    }
    this.jumpToSpread(edge === 'first' ? 0 : state.spreads.length - 1, 'fade');
  }

  /** Shows the spread holding `page` at once (scrubber). */
  private jumpToPage(page: number): void {
    const state = this.state;
    if (!state.ready || state.navigating) return;
    this.loader.preloadAround(page);
    const index = spreadIndexForPage(state.spreads, page);
    const spread = state.spreads[index];
    if (index === state.spreadIndex || !spread || state.animating) return;
    if (state.boundary) this.toast.hide();
    state.spreadIndex = index;
    state.pageIndex = spread.pages[0] ?? 0;
    this.renderCurrent();
    this.updateChrome(0);
    this.notifyPage();
  }

  private jumpToSpread(index: number, kind: TransitionKind): void {
    const state = this.state;
    if (state.animating || index === state.spreadIndex || !state.spreads[index]) return;
    if (state.boundary) this.toast.hide();
    void this.runTransition(index, kind);
  }

  /** Waits (at most `timeout` ms) for the pages of spread `index`; resolves early if the chapter goes away. */
  private waitForSpread(scope: Disposer, index: number, timeout: number): Promise<void> {
    const pages = this.state.spreads[index]?.pages ?? [];
    const loads = Promise.all(pages.map((page) => this.loader.loadDecoded(page)));
    const deadline = new Promise<void>((resolve) => {
      const done = scope.add(resolve);
      scope.timeout(done, timeout);
    });
    return Promise.race([loads.then(() => undefined), deadline]);
  }

  private async runTransition(to: number, kind: TransitionKind, fast = false): Promise<void> {
    const state = this.state;
    const scope = this.chapterScope;
    const { signal } = scope;
    // A replaced chapter or a closed reader owns the state from then on (a function: not narrowed across awaits).
    const stale = (): boolean => scope.isDisposed;
    state.animating = true;
    const from = state.spreadIndex;
    const bookFrom = this.book;
    try {
      await this.waitForSpread(scope, to, fast ? READY_FAST_TIMEOUT_MS : READY_TIMEOUT_MS);
      const spread = state.spreads[to];
      if (stale() || !spread) return;
      state.spreadIndex = to;
      state.pageIndex = spread.pages[0] ?? 0;
      const turning = kind === 'forward' || kind === 'back';
      this.updateChrome(turning ? (kind === 'forward' ? 1 : -1) : 0);
      this.notifyPage();

      let animation: 'flip' | 'slide' | 'fade' | 'none' = state.settings.animation;
      if (state.reduceMotion && animation !== 'none') animation = 'fade';
      if (!turning && animation !== 'none') animation = 'fade';
      if (kind === 'none') animation = 'none';
      if (!bookFrom?.element.isConnected) animation = 'none';
      else if (turning && bookFrom.spreadIndex !== from) animation = 'none';
      const forward = kind === 'forward';
      const container = this.zoom;
      const direction = state.settings.direction;

      if (animation === 'flip' && bookFrom && state.layout.double) {
        this.book = bookFrom;
        await flipDouble({
          book: bookFrom,
          from: spreadSides(state.spreads[from] ?? spread, direction),
          to: spreadSides(spread, direction),
          direction,
          forward,
          duration: fast ? FLIP_FAST_MS : FLIP_MS,
          pageWidth: state.layout.pageSize.width,
          renderer: this.renderer,
          signal,
        });
        bookFrom.spreadIndex = to;
      } else if (animation === 'flip' && bookFrom) {
        const newBook = this.createBook(to);
        this.book = newBook;
        await flipSingle({
          container,
          oldBook: bookFrom,
          newBook,
          direction,
          forward,
          duration: fast ? FLIP_FAST_MS : FLIP_MS * SINGLE_FLIP_FACTOR,
          signal,
        });
      } else if (animation === 'slide' && bookFrom) {
        const newBook = this.createBook(to);
        this.book = newBook;
        await slide({
          container,
          oldBook: bookFrom,
          newBook,
          direction,
          forward,
          duration: fast ? SLIDE_MS * SLIDE_FAST_FACTOR : SLIDE_MS,
          viewportWidth: state.layout.viewport.width,
          signal,
        });
      } else if (animation === 'fade') {
        const newBook = this.createBook(to);
        this.book = newBook;
        await crossfade({ container, oldBook: bookFrom, newBook, reduceMotion: state.reduceMotion, signal });
      } else {
        this.renderCurrent();
      }
    } finally {
      if (!stale()) state.animating = false;
    }
    if (stale()) return;
    this.loader.preloadAround(state.pageIndex);
    this.afterTransition();
  }

  /** Applies what was requested during the animation: re-layout, late pages, queued turns. */
  private afterTransition(): void {
    const state = this.state;
    if (state.pendingRefresh) {
      const animate = state.pendingRefresh === 'fade';
      state.pendingRefresh = null;
      state.pendingRepaint = false;
      void this.refresh(animate);
      return;
    }
    if (state.pendingRepaint && state.queue.length === 0) {
      state.pendingRepaint = false;
      this.renderCurrent();
    }
    this.drainQueue();
  }

  private drainQueue(): void {
    const state = this.state;
    const next = state.queue.shift();
    if (!next) return;
    if (next.kind === 'edge') {
      const index = next.edge === 'first' ? 0 : state.spreads.length - 1;
      if (index === state.spreadIndex) this.drainQueue();
      else void this.runTransition(index, 'fade');
      return;
    }
    const to = state.spreadIndex + next.delta;
    if (to < 0 || to >= state.spreads.length) {
      state.queue = [];
      if (!next.repeat) this.hitBoundary(to < 0 ? 'start' : 'end');
      return;
    }
    void this.runTransition(to, next.delta > 0 ? 'forward' : 'back', true);
  }

  /** First press past an edge: elastic bump and a toast; a second deliberate press changes chapter. */
  private hitBoundary(edge: Edge): void {
    const direction: ChapterDirection = edge === 'end' ? 'next' : 'prev';
    const available = this.hasChapter(direction);
    if (this.state.boundary === edge && available) {
      this.navigateChapter(direction, false);
      return;
    }
    const { settings, chapter } = this.state;
    if (this.book && settings.animation !== 'none' && !this.state.reduceMotion) {
      const animation = nudge(this.book, edge, settings.direction);
      const forget = this.disposer.add(() => {
        cancelQuietly(animation);
      });
      animation.finished.then(forget, forget);
    }
    const rtl = settings.direction === 'rtl';
    const label = this.chapterLabel(direction);
    let title: string;
    let detail: Child[];
    let action: {
      label: string;
      icon: 'left' | 'right' | 'list';
      iconAfter: boolean;
      run: () => void;
    } | null = null;
    if (edge === 'end') {
      title = chapter.meta.chapter ? i18n.t('endOfChapterN', [chapter.meta.chapter]) : i18n.t('endOfChapter');
      if (available) {
        detail = withKey(i18n.t('pressAgainNext', [KEY_SLOT]), rtl ? '←' : '→');
        action = {
          label: label ? i18n.t('chapterN', [label]) : i18n.t('nextChapter'),
          icon: rtl ? 'left' : 'right',
          iconAfter: !rtl,
          run: () => this.navigateChapter('next', false),
        };
      } else {
        detail = [i18n.t('lastChapter')];
      }
    } else {
      title = i18n.t('startOfChapter');
      if (available) {
        detail = withKey(i18n.t('pressAgainPrev', [KEY_SLOT]), rtl ? '→' : '←');
        action = {
          label: label ? i18n.t('chapterN', [label]) : i18n.t('prevChapter'),
          icon: rtl ? 'right' : 'left',
          iconAfter: rtl,
          run: () => this.navigateChapter('prev', false),
        };
      } else {
        detail = [i18n.t('firstChapter')];
      }
    }
    const seriesUrl = chapter.meta.seriesUrl;
    if (!action && isWebUrl(seriesUrl)) {
      action = {
        label: i18n.t('chapters'),
        icon: 'list',
        iconAfter: false,
        run: () => {
          window.location.href = seriesUrl;
        },
      };
    }
    this.toast.show({ title, detail, ...(action ? { action } : {}) }, TOAST_MS);
    this.state.boundary = edge;
    this.state.notice = false;
  }

  /* ------------------------------------------------------------------ interface */

  private setLoading(loading: boolean): void {
    this.spinner.classList.toggle('is-visible', loading);
    this.root.setAttribute('aria-busy', String(loading));
  }

  private updateChrome(bump: -1 | 0 | 1): void {
    if (this.disposer.isDisposed) return;
    const state = this.state;
    const { settings, spreads, spreadIndex } = state;
    const total = this.loader.count;
    const spread = spreads[spreadIndex];
    const pages = spread?.pages ?? [0];
    this.topBar.update({
      settings,
      double: state.layout.double,
      fullscreen: document.fullscreenElement === this.mount.host,
      helpOpen: this.help.isOpen,
    });
    this.dock.update({
      direction: settings.direction,
      total,
      page: Math.min(...pages),
      lastPage: spread ? Math.max(...pages) : -1,
      label: spreadLabel(spread, total),
      bump,
      prevChapter: this.chapterLabel('prev'),
      nextChapter: this.chapterLabel('next'),
    });

    // Side click zones: in right-to-left reading, the left side moves forward.
    const rtl = settings.direction === 'rtl';
    const atStart = spreadIndex <= 0 && !this.hasChapter('prev');
    const atEnd = spreadIndex >= spreads.length - 1 && !this.hasChapter('next');
    setText(this.zoneLeftLabel, i18n.t(rtl ? 'next' : 'previous'));
    setText(this.zoneRightLabel, i18n.t(rtl ? 'previous' : 'next'));
    this.zoneLeft.classList.toggle('is-disabled', rtl ? atEnd : atStart);
    this.zoneRight.classList.toggle('is-disabled', rtl ? atStart : atEnd);
  }

  private showUi(duration = UI_IDLE_MS): void {
    if (this.disposer.isDisposed) return;
    this.root.classList.add('ui-visible');
    this.root.classList.remove('ui-hidden');
    this.disposer.clearTimeout(this.uiTimer);
    if (this.uiPinned()) return;
    this.uiTimer = this.disposer.timeout(() => this.hideUi(), duration);
  }

  /** The interface stays while the mouse or the focus is in a bar, the help is open or the user scrubs. */
  private uiPinned(): boolean {
    const state = this.state;
    return state.hoverBar || state.focusInBar || state.scrubbing || this.help.isOpen;
  }

  private hideUi(): void {
    if (this.uiPinned()) return;
    this.root.classList.remove('ui-visible');
    this.root.classList.add('ui-hidden');
  }

  private toggleUi(): void {
    if (this.root.classList.contains('ui-hidden')) {
      this.showUi();
    } else {
      this.disposer.clearTimeout(this.uiTimer);
      this.hideUi();
    }
  }

  private toggleFullscreen(): void {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
      return;
    }
    const unavailable = (): void => this.flash.show('expand', i18n.t('fullscreenUnavailable'));
    if (typeof this.mount.host.requestFullscreen !== 'function') {
      unavailable();
      return;
    }
    this.mount.host.requestFullscreen().catch(unavailable);
  }

  private toggleZoom(x?: number, y?: number): void {
    const state = this.state;
    state.zoomed = !state.zoomed;
    if (state.zoomed) {
      const { width, height } = state.layout.viewport;
      this.panZoom(x ?? width / 2, y ?? height / 2);
      this.hideUi();
    }
    this.root.classList.toggle('is-zoomed', state.zoomed);
  }

  /** The zoom origin follows the mouse: moving the cursor explores the page. */
  private panZoom(x: number, y: number): void {
    const { width, height } = this.state.layout.viewport;
    const fx = clamp(width ? x / width : 0.5, 0, 1) * 100;
    const fy = clamp(height ? y / height : 0.5, 0, 1) * 100;
    this.zoom.style.transformOrigin = `${fx}% ${fy}%`;
  }

  private toggleHelp(force?: boolean): void {
    const open = force ?? !this.help.isOpen;
    if (open === this.help.isOpen) return;
    if (open) {
      const focused = (this.root.getRootNode() as Document | ShadowRoot).activeElement;
      this.help.open(
        this.state.settings.direction,
        focused instanceof HTMLElement && focused !== this.root ? focused : this.topBar.helpButton,
      );
      this.showUi();
    } else {
      this.help.close();
      this.showUi();
    }
    this.updateChrome(0);
  }
}

/** Placeholder replaced by a `<kbd>` in "press … again" messages. */
const KEY_SLOT = '\u0001';

/** Splits a translated message around {@link KEY_SLOT} and puts `key` in a `<kbd>` there. */
function withKey(message: string, key: string): Child[] {
  const [before = '', after = ''] = message.split(KEY_SLOT);
  return [before, h('kbd', '', [key]), after];
}

/** Cancels an animation whose element may already be gone. */
function cancelQuietly(animation: Animation): void {
  try {
    animation.cancel();
  } catch {
    // Already gone.
  }
}
