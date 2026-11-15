import { i18n } from '#i18n';
import type { AnimationKind, ChapterMeta, ReaderAction, Settings, ViewMode } from '@/shared/types';
import { h, isWebUrl, setText } from '../dom';
import { icon, type IconName } from '../icons';
import { setButtonContent, setTip, toolButton } from './button';

export const ANIMATION_ICONS: Readonly<Record<AnimationKind, IconName>> = {
  flip: 'flip',
  slide: 'slide',
  none: 'instant',
};

export function animationLabel(animation: AnimationKind): string {
  if (animation === 'flip') return i18n.t('animFlip');
  if (animation === 'slide') return i18n.t('animSlide');
  return i18n.t('animNone');
}

export function modeLabel(mode: ViewMode): string {
  if (mode === 'single') return i18n.t('modeSingle');
  if (mode === 'double') return i18n.t('modeDouble');
  return i18n.t('modeAuto');
}

/** Selection moves of the arrow keys in the mode radio group. */
const RADIO_STEPS: ReadonlyMap<string, number> = new Map([
  ['ArrowRight', 1],
  ['ArrowDown', 1],
  ['ArrowLeft', -1],
  ['ArrowUp', -1],
]);

/** Order of the mode buttons in the segmented control. */
const SEGMENT_ORDER: readonly ViewMode[] = ['single', 'double', 'auto'];

export interface TopBarHandlers {
  perform(action: ReaderAction): void;
  setMode(mode: ViewMode): void;
}

export interface TopBarState {
  settings: Settings;
  /** Two pages are currently shown. */
  double: boolean;
  fullscreen: boolean;
  helpOpen: boolean;
}

/** Title of the series and chapter, and the settings toolbar. */
export class TopBar {
  readonly element: HTMLElement;
  readonly helpButton: HTMLButtonElement;
  private readonly title: HTMLElement;
  private readonly titleName: HTMLElement;
  private readonly titleChapter: HTMLElement;
  private readonly segment: HTMLElement;
  private readonly segmentPill: HTMLElement;
  private readonly modeButtons = new Map<ViewMode, HTMLButtonElement>();
  private readonly offsetButton: HTMLButtonElement;
  private readonly directionButton: HTMLButtonElement;
  private readonly animationButton: HTMLButtonElement;
  private readonly themeButton: HTMLButtonElement;
  private readonly fullscreenButton: HTMLButtonElement;
  private shown: { direction?: string; animation?: string; theme?: string; fullscreen?: boolean } = {};

  constructor(private readonly handlers: TopBarHandlers) {
    this.titleName = h('span', 'mr-title-name');
    this.titleChapter = h('span', 'mr-title-ch');
    const seal = h('span', 'mr-seal', ['読']);
    seal.setAttribute('aria-hidden', 'true');
    this.title = h('a', 'mr-title mr-glass', [
      seal,
      h('span', 'mr-title-text', [this.titleName, this.titleChapter]),
    ]);

    this.segmentPill = h('span', 'mr-seg-pill');
    this.segment = h('div', 'mr-seg', [this.segmentPill]);
    this.segment.setAttribute('role', 'radiogroup');
    this.segment.setAttribute('aria-label', i18n.t('legendDisplay'));
    for (const mode of SEGMENT_ORDER) {
      const button = toolButton();
      button.setAttribute('role', 'radio');
      if (mode === 'auto') {
        setButtonContent(button, [h('span', '', [i18n.t('modeAuto')])]);
        setTip(button, i18n.t('modeAutoTip'), 'D', i18n.t('modeAuto'));
      } else {
        setButtonContent(button, [icon(mode === 'single' ? 'single' : 'double')]);
        setTip(button, modeLabel(mode), null);
      }
      button.addEventListener('click', () => handlers.setMode(mode));
      this.modeButtons.set(mode, button);
      this.segment.append(button);
    }

    this.offsetButton = this.actionButton('toggleOffset', 'mr-hide-sm');
    setButtonContent(this.offsetButton, [icon('offset')]);
    this.directionButton = this.actionButton('toggleDirection', 'mr-dir');
    this.animationButton = this.actionButton('cycleAnimation', 'mr-hide-sm');
    this.themeButton = this.actionButton('toggleTheme');
    this.fullscreenButton = this.actionButton('fullscreen');
    this.helpButton = this.actionButton('help', 'mr-hide-sm');
    setButtonContent(this.helpButton, [icon('help')]);
    setTip(this.helpButton, i18n.t('shortcuts'), '?');
    this.helpButton.setAttribute('aria-haspopup', 'dialog');
    const closeButton = this.actionButton('close');
    setButtonContent(closeButton, [icon('close')]);
    setTip(closeButton, i18n.t('backToSite'), i18n.t('keyEsc'));

    const separator = (className: string): HTMLElement => {
      const node = h('span', `mr-sep ${className}`.trim());
      node.setAttribute('aria-hidden', 'true');
      return node;
    };
    const tools = h('div', 'mr-tools mr-glass', [
      this.segment,
      this.offsetButton,
      separator('mr-hide-sm'),
      this.directionButton,
      this.animationButton,
      this.themeButton,
      separator(''),
      this.fullscreenButton,
      this.helpButton,
      closeButton,
    ]);
    this.element = h('header', 'mr-top', [this.title, tools]);
  }

  /** Shows the series and chapter. Site strings are inserted as text; only web URLs become links. */
  setChapter(meta: ChapterMeta, fallbackTitle: string): void {
    setText(this.titleName, meta.title || fallbackTitle);
    setText(this.titleChapter, meta.chapter ? i18n.t('chapterN', [meta.chapter]) : i18n.t('reading'));
    if (isWebUrl(meta.seriesUrl)) {
      this.title.setAttribute('href', meta.seriesUrl);
      this.title.title = i18n.t('allChapters');
    } else {
      this.title.removeAttribute('href');
      this.title.removeAttribute('title');
    }
  }

  update(state: TopBarState): void {
    const { settings } = state;
    for (const [mode, button] of this.modeButtons) {
      const active = settings.mode === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-checked', String(active));
      button.tabIndex = active ? 0 : -1;
    }

    this.offsetButton.hidden = !state.double;
    this.offsetButton.classList.toggle('is-accent', !settings.firstPageAlone);
    this.offsetButton.setAttribute('aria-pressed', String(settings.firstPageAlone));
    setTip(
      this.offsetButton,
      i18n.t(settings.firstPageAlone ? 'offsetOnTip' : 'offsetOffTip'),
      'O',
      i18n.t('coverAlone'),
    );

    const rtl = settings.direction === 'rtl';
    if (this.shown.direction !== settings.direction) {
      const label = h('span', 'mr-hide-sm', [i18n.t(rtl ? 'dirRtlShort' : 'dirLtrShort')]);
      setButtonContent(this.directionButton, [icon(rtl ? 'rtl' : 'ltr'), label]);
    }
    const directionTip = i18n.t(rtl ? 'dirRtlTip' : 'dirLtrTip');
    setTip(this.directionButton, directionTip, 'S', `${i18n.t('readingDirection')}: ${directionTip}`);

    if (this.shown.animation !== settings.animation) {
      setButtonContent(this.animationButton, [icon(ANIMATION_ICONS[settings.animation])]);
    }
    setTip(this.animationButton, i18n.t('animationTip', [animationLabel(settings.animation)]), 'A');

    const dark = settings.theme === 'dark';
    if (this.shown.theme !== settings.theme)
      setButtonContent(this.themeButton, [icon(dark ? 'moon' : 'sun')]);
    this.themeButton.setAttribute('aria-pressed', String(dark));
    setTip(this.themeButton, i18n.t(dark ? 'darkMode' : 'lightMode'), 'M', i18n.t('darkMode'));

    if (this.shown.fullscreen !== state.fullscreen) {
      setButtonContent(this.fullscreenButton, [icon(state.fullscreen ? 'shrink' : 'expand')]);
    }
    this.fullscreenButton.setAttribute('aria-pressed', String(state.fullscreen));
    setTip(
      this.fullscreenButton,
      i18n.t(state.fullscreen ? 'exitFullscreen' : 'fullscreen'),
      'F',
      i18n.t('fullscreen'),
    );

    this.helpButton.setAttribute('aria-expanded', String(state.helpOpen));
    this.shown = {
      direction: settings.direction,
      animation: settings.animation,
      theme: settings.theme,
      fullscreen: state.fullscreen,
    };
    this.positionPill(settings.mode);
  }

  /** Slides the highlight of the segmented control under the active mode. */
  positionPill(mode: ViewMode): void {
    const active = this.modeButtons.get(mode);
    if (!active?.offsetWidth) return;
    this.segmentPill.style.width = `${active.offsetWidth}px`;
    this.segmentPill.style.transform = `translateX(${active.offsetLeft}px)`;
  }

  /**
   * Arrow keys inside the mode radio group move the selection (WAI-ARIA radio group pattern).
   * Returns `true` when the key was handled.
   */
  handleKey(event: KeyboardEvent, focused: Element | null): boolean {
    if (!focused || !this.segment.contains(focused)) return false;
    const step = RADIO_STEPS.get(event.key);
    if (step === undefined) return false;
    const current = SEGMENT_ORDER.findIndex((mode) => this.modeButtons.get(mode) === focused);
    const next = SEGMENT_ORDER[(current + step + SEGMENT_ORDER.length) % SEGMENT_ORDER.length];
    if (next === undefined) return false;
    this.handlers.setMode(next);
    this.modeButtons.get(next)?.focus();
    return true;
  }

  private actionButton(action: ReaderAction, className = ''): HTMLButtonElement {
    const button = toolButton(className);
    button.addEventListener('click', () => this.handlers.perform(action));
    return button;
  }
}
