import {
  ButtonComponent,
  Component,
  ItemView,
  Notice,
  TFile,
  WorkspaceLeaf,
  setIcon,
} from 'obsidian';
import type GameShelf from './main';
import { FIELD_GROUPS, type Game, type LibraryItem, type SearchPage, type Provider } from './domain';
import { noteLocale, localizedText } from './i18n';
import {
  filename,
  gameId,
  sourceName,
  property,
  record,
  renderNote,
  sourceBody,
  sourceMetadata,
  type MetadataChange,
} from './note-format';
import { message, type CreateOptions } from './notes';

export const VIEW_TYPE = 'game-shelf-library';
type SearchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; data: SearchPage }
  | { kind: 'error'; message: string };
type Selection =
  | { kind: 'empty' }
  | { kind: 'loading'; slug: string; provider: Provider }
  | { kind: 'ready'; game: Game }
  | { kind: 'error'; slug: string; provider: Provider; message: string };

export class ShelfView extends ItemView {
  private tab: 'library' | 'discover' = 'library';
  private screen = new Component();
  private search: SearchState = { kind: 'idle' };
  private selected: Selection = { kind: 'empty' };
  private query = '';
  private searchPage = 1;
  private localQuery = '';
  private status = 'all';
  private platform = 'all';
  private genre = 'all';
  private sort = 'recent';
  private layout: 'grid' | 'list' = 'grid';
  private libraryPath: string | null = null;
  private manual = false;
  private requestId = 0;
  private detailId = 0;
  private closed = false;
  private busy = false;
  private options: CreateOptions | null = null;
  private journalText = '';
  private journalMinutes = '';
  private updatePreview: { game: Game; changes: MetadataChange[]; selected: Set<string> } | null =
    null;
  private libraryResults: HTMLElement | null = null;
  private resultsComponent = new Component();
  private drafts = new Map<string, { text: string; minutes: string }>();

  constructor(
    leaf: WorkspaceLeaf,
    private shelf: GameShelf,
  ) {
    super(leaf);
  }
  getViewType(): string {
    return VIEW_TYPE;
  }
  getDisplayText(): string {
    return 'Game Shelf';
  }
  getIcon(): string {
    return 'library';
  }
  async onOpen(): Promise<void> {
    this.closed = false;
    this.addChild(this.screen);
    this.render();
    const win = this.contentEl.win;
    let frame = 0;
    const reveal = () => {
      win.cancelAnimationFrame(frame);
      frame = win.requestAnimationFrame(() => this.revealFocusedInput());
    };
    const observer = new ResizeObserver(reveal);
    observer.observe(this.contentEl);
    this.registerDomEvent(this.contentEl, 'focusin', reveal);
    this.registerDomEvent(this.contentEl, 'focusout', reveal);
    const viewport = win.visualViewport;
    viewport?.addEventListener('resize', reveal);
    this.register(() => {
      observer.disconnect();
      viewport?.removeEventListener('resize', reveal);
      win.cancelAnimationFrame(frame);
    });
  }
  async onClose(): Promise<void> {
    this.closed = true;
    this.requestId++;
    this.detailId++;
  }
  setTab(tab: 'library' | 'discover'): void {
    this.tab = tab;
    this.manual = false;
    this.render();
  }
  selectLibrary(path: string, focusJournal = false): void {
    this.tab = 'library';
    this.libraryPath = path;
    this.manual = false;
    this.updatePreview = null;
    const draft = this.drafts.get(path);
    this.journalText = draft?.text ?? '';
    this.journalMinutes = draft?.minutes ?? '';
    this.render();
    if (focusJournal)
      this.contentEl.querySelector<HTMLTextAreaElement>('.gs-journal-text')?.focus();
  }
  openManual(): void {
    this.tab = 'library';
    this.manual = true;
    this.libraryPath = null;
    this.options = this.defaults('');
    this.render();
    this.contentEl.querySelector<HTMLInputElement>('.gs-title-input')?.focus();
  }
  refreshLibrary(): void {
    if (this.closed) return;
    if (this.tab === 'library' && this.libraryResults) {
      const items = this.shelf.notes.list();
      if (this.libraryPath && !items.some((item) => item.path === this.libraryPath)) {
        this.libraryPath = null;
        this.render();
        return;
      }
      this.renderLibraryResults(this.libraryResults);
      this.contentEl
        .querySelectorAll<HTMLButtonElement>('.gs-statuses button')
        .forEach((button) => {
          const status = button.dataset.status;
          if (status)
            button.setText(
              `${status === 'all' ? this.t('all') : this.shelf.statusLabel(status)} ${status === 'all' ? items.length : items.filter((item) => item.status === status).length}`,
            );
        });
      const item = items.find((item) => item.path === this.libraryPath);
      if (item)
        this.contentEl
          .querySelector('.gs-minutes-total')
          ?.setText(`${item.minutes} ${this.t('minutesTotal')}`);
    }
  }
  settingsChanged(resetSource: boolean): void {
    if (this.closed) return;
    if (resetSource || !this.shelf.settings.online) {
      this.requestId++;
      this.detailId++;
      this.search = { kind: 'idle' };
      this.selected = { kind: 'empty' };
      if (!this.manual) this.options = null;
    }
    this.render();
  }
  private t(key: Parameters<GameShelf['t']>[0]): string {
    return this.shelf.t(key);
  }
  private defaults(title: string): CreateOptions {
    return {
      title,
      status: 'backlog',
      rating: null,
      ownership: 'owned',
      groups: [...this.shelf.settings.groups],
      saveCover: this.shelf.settings.saveCover,
    };
  }
  private async run(action: () => void | Promise<unknown>): Promise<void> {
    try {
      await action();
    } catch (error) {
      if (!this.closed) this.shelf.report(error);
    }
  }
  private button(
    parent: HTMLElement,
    label: string,
    action: () => void | Promise<unknown>,
    options: { primary?: boolean; icon?: string; disabled?: boolean; cls?: string } = {},
  ): ButtonComponent {
    const button = new ButtonComponent(parent)
      .setButtonText(label)
      .setDisabled(options.disabled ?? false)
      .onClick(() => {
        void this.run(action);
      });
    if (options.primary) button.setCta();
    if (options.icon) {
      const icon = button.buttonEl.createSpan({ cls: 'gs-button-icon' });
      setIcon(icon, options.icon);
      button.buttonEl.prepend(icon);
      button.buttonEl.addClass('gs-with-icon');
    }
    if (options.cls) button.buttonEl.addClass(options.cls);
    return button;
  }
  private input(
    parent: HTMLElement,
    label: string,
    value: string,
    onInput: (value: string) => void,
    placeholder?: string,
  ): HTMLInputElement {
    const input = parent.createEl('input', {
      type: 'text',
      value,
      attr: { 'aria-label': label, placeholder: placeholder ?? label },
    });
    this.screen.registerDomEvent(input, 'input', () => onInput(input.value));
    return input;
  }
  private select(
    parent: HTMLElement,
    label: string,
    value: string,
    options: [string, string][],
    onChange: (value: string) => void,
  ): HTMLSelectElement {
    const select = parent.createEl('select', { attr: { 'aria-label': label } });
    for (const [id, name] of options) select.createEl('option', { value: id, text: name });
    select.value = value;
    this.screen.registerDomEvent(select, 'change', () => onChange(select.value));
    return select;
  }
  private field(parent: HTMLElement, label: string): HTMLElement {
    const row = parent.createDiv({ cls: 'gs-field' });
    row.createSpan({ text: label, cls: 'gs-field-label' });
    return row;
  }
  private image(
    parent: HTMLElement,
    url: string | null,
    cls = '',
    owner = this.screen,
  ): void {
    const container = parent.createDiv({ cls: `gs-cover ${cls}`, attr: { 'aria-hidden': 'true' } });
    const fallback = container.createSpan({ cls: 'gs-cover-fallback' });
    setIcon(fallback, 'gamepad-2');
    if (!url) return;
    const image = container.createEl('img', {
      attr: { src: url, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' },
    });
    owner.registerDomEvent(image, 'error', () => {
      image.remove();
      fallback.removeClass('is-loaded');
    });
    owner.registerDomEvent(image, 'load', () => fallback.addClass('is-loaded'));
  }
  private localCover(item: LibraryItem): string | null {
    if (!item.cover) return null;
    if (item.cover.startsWith('https://')) return this.shelf.settings.online ? item.cover : null;
    const path = item.cover.replace(/^!?\[\[|\]\]$/g, '');
    const file =
      this.app.vault.getAbstractFileByPath(path) ??
      this.app.metadataCache.getFirstLinkpathDest(path, item.path);
    return file instanceof TFile ? this.app.vault.getResourcePath(file) : null;
  }
  private revealFocusedInput(): void {
    const root = this.contentEl;
    const header = root.querySelector('.gs-header')?.getBoundingClientRect();
    if (this.closed || !header || !root.clientHeight) return;
    const input = root.doc.activeElement;
    const focused = input !== null && root.contains(input) && input.matches('input, textarea, select');
    const pane = root.getBoundingClientRect();
    const viewport = root.win.visualViewport;
    let bottom = Math.min(
      pane.bottom - parseFloat(root.win.getComputedStyle(root).paddingBottom),
      viewport ? viewport.offsetTop + viewport.height : pane.bottom,
    );
    const cramped = focused && bottom - pane.top < header.height +
      input.getBoundingClientRect().height + 24;
    root.toggleClass('gs-input-room', cramped);
    root.style.setProperty('--gs-header-height', cramped ? '0px' : `${header.height}px`);
    if (!focused) return;
    const top = Math.max(pane.top, cramped ? pane.top : header.bottom, viewport?.offsetTop ?? pane.top) + 12;
    bottom -= 12;
    if (bottom <= top) return;
    const bounds = input.getBoundingClientRect();
    // Keep the focused control visible as the software keyboard resizes the view.
    if (bounds.height > bottom - top || bounds.top < top) root.scrollTop += bounds.top - top;
    else if (bounds.bottom > bottom) root.scrollTop += bounds.bottom - bottom;
  }
  private render(): void {
    if (this.closed) return;
    this.removeChild(this.screen);
    this.screen = new Component();
    this.addChild(this.screen);
    const root = this.contentEl;
    root.empty();
    root.scrollTop = 0;
    root.removeClass('gs-input-room');
    root.addClass('gs-root');
    this.libraryResults = null;
    this.screen.registerDomEvent(root, 'keydown', (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (this.tab === 'discover' && this.selected.kind !== 'empty') {
        event.preventDefault();
        this.selected = { kind: 'empty' };
        this.render();
        this.contentEl.querySelector<HTMLButtonElement>('.gs-result')?.focus();
      } else if (this.tab === 'library' && (this.libraryPath || this.manual)) {
        event.preventDefault();
        this.libraryPath = null;
        this.manual = false;
        this.render();
      }
    });
    const header = root.createDiv({ cls: 'gs-header' });
    const title = header.createDiv({ cls: 'gs-brand' });
    const icon = title.createSpan({ cls: 'gs-brand-icon' });
    setIcon(icon, 'library');
    title.createEl('h1', { text: 'Game Shelf' });
    const nav = header.createEl('nav', { cls: 'gs-nav', attr: { 'aria-label': 'Game Shelf' } });
    for (const tab of ['library', 'discover'] as const) {
      const button = this.button(nav, this.t(tab), () => this.setTab(tab));
      button.buttonEl.toggleClass('is-active', this.tab === tab);
      button.buttonEl.setAttribute('aria-pressed', String(this.tab === tab));
    }
    const shell = root.createDiv({ cls: 'gs-shell' });
    shell.toggleClass('is-discover', this.tab === 'discover');
    shell.toggleClass(
      'has-details',
      this.tab === 'discover' || this.libraryPath !== null || this.manual,
    );
    shell.toggleClass('has-selection', this.tab === 'discover' && this.selected.kind !== 'empty');
    if (this.tab === 'library') this.renderLibrary(shell);
    else this.renderDiscover(shell);
  }
  private renderLibrary(shell: HTMLElement): void {
    const pane = shell.createDiv({ cls: 'gs-library' });
    const top = pane.createDiv({ cls: 'gs-section-header' });
    top.createEl('h2', { text: this.t('library') });
    this.button(top, this.t('addGame'), () => this.setTab('discover'), {
      primary: true,
      icon: 'plus',
    });
    const toolbar = pane.createDiv({ cls: 'gs-toolbar' });
    const search = this.input(toolbar, this.t('librarySearch'), this.localQuery, (value) => {
      this.localQuery = value;
      if (this.libraryResults) this.renderLibraryResults(this.libraryResults);
    });
    search.type = 'search';
    this.select(
      toolbar,
      this.t('sortLabel'),
      this.sort,
      [
        ['recent', this.t('recent')],
        ['title', this.t('titleSort')],
        ['rating', this.t('ratingSort')],
      ],
      (value) => {
        this.sort = value;
        if (this.libraryResults) this.renderLibraryResults(this.libraryResults);
      },
    );
    this.button(
      toolbar,
      this.layout === 'grid' ? this.t('list') : this.t('grid'),
      () => {
        this.layout = this.layout === 'grid' ? 'list' : 'grid';
        this.render();
      },
      { icon: this.layout === 'grid' ? 'list' : 'layout-grid' },
    );
    const items = this.shelf.notes.list();
    const statuses = [
      ...new Set([...this.shelf.settings.statuses, ...items.map((item) => item.status)]),
    ];
    const filters = pane.createDiv({
      cls: 'gs-statuses',
      attr: { role: 'group', 'aria-label': this.t('status') },
    });
    for (const status of ['all', ...statuses]) {
      const count =
        status === 'all' ? items.length : items.filter((i) => i.status === status).length;
      const button = this.button(
        filters,
        `${status === 'all' ? this.t('all') : this.shelf.statusLabel(status)} ${count}`,
        () => {
          this.status = status;
          this.render();
        },
      );
      button.buttonEl.dataset.status = status;
      button.buttonEl.toggleClass('is-active', this.status === status);
      button.buttonEl.setAttribute('aria-pressed', String(this.status === status));
    }
    if (items.length) {
      const facets = pane.createDiv({ cls: 'gs-facets' });
      this.select(
        facets,
        this.t('platform'),
        this.platform,
        [
          ['all', this.t('allPlatforms')],
          ...[...new Set(items.flatMap((i) => i.platforms))]
            .sort()
            .map((p): [string, string] => [p, p]),
        ],
        (value) => {
          this.platform = value;
          if (this.libraryResults) this.renderLibraryResults(this.libraryResults);
        },
      );
      this.select(
        facets,
        this.t('genre'),
        this.genre,
        [
          ['all', this.t('allGenres')],
          ...[...new Set(items.flatMap((i) => i.genres))]
            .sort()
            .map((p): [string, string] => [p, p]),
        ],
        (value) => {
          this.genre = value;
          if (this.libraryResults) this.renderLibraryResults(this.libraryResults);
        },
      );
    }
    this.libraryResults = pane.createDiv({ cls: 'gs-library-results' });
    this.renderLibraryResults(this.libraryResults);
    if (this.manual) this.renderCreate(shell.createDiv({ cls: 'gs-detail' }), null);
    else if (this.libraryPath) {
      const item = items.find((item) => item.path === this.libraryPath);
      if (item) this.renderNoteDetail(shell.createDiv({ cls: 'gs-detail' }), item);
    }
  }
  private renderLibraryResults(parent: HTMLElement): void {
    this.screen.removeChild(this.resultsComponent);
    this.resultsComponent = new Component();
    this.screen.addChild(this.resultsComponent);
    parent.empty();
    const all = this.shelf.notes.list();
    const query = this.localQuery.toLocaleLowerCase();
    const items = all.filter(
      (item) =>
        (this.status === 'all' || item.status === this.status) &&
        (this.platform === 'all' || item.platforms.includes(this.platform)) &&
        (this.genre === 'all' || item.genres.includes(this.genre)) &&
        `${item.title} ${item.platforms.join(' ')} ${item.genres.join(' ')}`
          .toLocaleLowerCase()
          .includes(query),
    );
    items.sort((a, b) =>
      this.sort === 'title'
        ? a.title.localeCompare(b.title)
        : this.sort === 'rating'
          ? (b.rating ?? -1) - (a.rating ?? -1)
          : b.modified - a.modified,
    );
    if (!items.length) {
      const empty = parent.createDiv({ cls: 'gs-empty' });
      const icon = empty.createDiv({ cls: 'gs-empty-icon' });
      setIcon(icon, all.length ? 'search-x' : 'library');
      empty.createEl('h3', { text: this.t(all.length ? 'noMatches' : 'emptyTitle') });
      if (!all.length) empty.createEl('p', { text: this.t('emptyBody') });
      const actions = empty.createDiv({ cls: 'gs-actions' });
      if (all.length)
        this.button(actions, this.t('clearFilters'), () => {
          this.localQuery = '';
          this.status = 'all';
          this.platform = 'all';
          this.genre = 'all';
          this.render();
        });
      else
        this.button(actions, this.t('addGame'), () => this.setTab('discover'), { primary: true });
      this.button(actions, this.t('manual'), () => this.openManual());
      return;
    }
    const grid = parent.createDiv({
      cls: `gs-game-grid ${this.layout === 'list' ? 'is-list' : ''}`,
    });
    for (const item of items) {
      const card = grid.createEl('button', {
        cls: 'gs-game-card',
        attr: {
          type: 'button',
          'aria-label': `${item.title} · ${this.shelf.statusLabel(item.status)}`,
        },
      });
      card.toggleClass('is-selected', item.path === this.libraryPath);
      this.image(card, this.localCover(item), '', this.resultsComponent);
      const info = card.createSpan({ cls: 'gs-card-info' });
      info.createSpan({ cls: 'gs-card-title', text: item.title });
      info.createSpan({
        cls: 'gs-card-meta',
        text: item.platforms.join(' · ') || item.releaseDate?.slice(0, 4) || '',
      });
      const foot = info.createSpan({ cls: 'gs-card-foot' });
      foot.createSpan({ cls: 'gs-status-label', text: this.shelf.statusLabel(item.status) });
      if (item.rating !== null) foot.createSpan({ cls: 'gs-rating', text: `${item.rating}/5` });
      this.resultsComponent.registerDomEvent(card, 'click', () => this.selectLibrary(item.path));
    }
  }
  private renderDiscover(shell: HTMLElement): void {
    const pane = shell.createDiv({ cls: 'gs-search-pane' });
    pane.createEl('h2', { text: this.t('discover') });
    const provider = this.shelf.selectedProvider();
    pane.createEl('p', { cls: 'gs-subtle', text: this.shelf.t('providerStatus', {
      provider: provider === 'igdb' ? 'IGDB' : 'Games Never Die',
      language: this.t(noteLocale(this.shelf.settings) === 'ja' ? 'languageJa' : 'languageEn'),
    }) });
    if (!this.shelf.settings.online) {
      const intro = pane.createDiv({ cls: 'gs-online' });
      intro.createEl('h3', { text: this.t('onlineTitle') });
      intro.createEl('p', { text: this.t('onlineBody') });
      this.button(
        intro,
        this.t('enableSearch'),
        async () => {
          await this.shelf.updateSettings({ ...this.shelf.settings, online: true });
          this.render();
        },
        { primary: true },
      );
      this.button(intro, this.t('manual'), () => this.openManual());
      return;
    }
    if (provider === 'igdb' && !this.shelf.hasIgdbCredentials()) {
      const setup = pane.createDiv({ cls: 'gs-online' });
      setup.createEl('p', { text: this.t('missingIgdbSetup') });
      this.button(setup, this.t('settingsButton'), () => this.shelf.openIgdbSetup(), { primary: true });
      this.button(setup, this.t('manual'), () => this.openManual());
      return;
    }
    const form = pane.createEl('form', {
      cls: 'gs-search-form',
      attr: { role: 'search', 'aria-label': this.t('search') },
    });
    const input = this.input(form, this.t('searchPlaceholder'), this.query, (value) => {
      this.query = value;
    });
    input.type = 'search';
    input.autocomplete = 'off';
    input.maxLength = 500;
    const submit = new ButtonComponent(form).setButtonText(this.t('search')).setCta();
    submit.buttonEl.type = 'submit';
    submit.setDisabled(this.search.kind === 'loading');
    this.screen.registerDomEvent(form, 'submit', (event) => {
      event.preventDefault();
      void this.performSearch(1);
    });
    this.screen.registerDomEvent(input, 'keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        pane.querySelector<HTMLButtonElement>('.gs-result')?.focus();
      }
    });
    if (this.search.kind === 'loading') this.loading(pane, this.t('searching'));
    if (this.search.kind === 'error')
      this.error(pane, this.search.message, () => this.performSearch(this.searchPage));
    if (this.search.kind === 'idle') {
      pane.createEl('p', { cls: 'gs-subtle', text: this.t('searchBody') });
    }
    if (this.search.kind === 'ready') {
      const data = this.search.data;
      pane.createEl('p', { cls: 'gs-result-count', text: `${data.total} ${this.t('results')}` });
      if (!data.items.length) {
        pane.createEl('p', { text: this.t('noResults') });
        this.button(pane, this.t('manual'), () => this.openManual());
      }
      const results = pane.createDiv({
        cls: 'gs-results',
        attr: { role: 'group', 'aria-label': this.t('results') },
      });
      for (const item of data.items) {
        const button = results.createEl('button', { cls: 'gs-result', attr: { type: 'button' } });
        button.toggleClass(
          'is-selected',
          this.selected.kind === 'ready' && gameId(this.selected.game) === gameId(item),
        );
        this.image(button, item.cover_url, 'gs-result-cover');
        const info = button.createSpan({ cls: 'gs-result-info' });
        info.createSpan({ text: item.title, cls: 'gs-result-title' });
        info.createSpan({ text: item.subtitle ?? '', cls: 'gs-card-meta' });
        if (this.shelf.notes.find(gameId(item)))
          info.createSpan({ text: this.t('alreadyAdded'), cls: 'gs-added' });
        this.screen.registerDomEvent(button, 'click', () => {
          void this.selectGame(item.id, false, item.source);
        });
        this.screen.registerDomEvent(button, 'keydown', (event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const sibling =
              event.key === 'ArrowDown' ? button.nextElementSibling : button.previousElementSibling;
            if (sibling?.instanceOf(HTMLButtonElement)) sibling.focus();
          }
        });
      }
      if (data.total_pages > 1) {
        const pager = pane.createDiv({ cls: 'gs-pager' });
        this.button(pager, this.t('previous'), () => this.performSearch(data.page - 1), {
          disabled: data.page <= 1,
        });
        pager.createSpan({ text: `${data.page} / ${data.total_pages}` });
        this.button(pager, this.t('next'), () => this.performSearch(data.page + 1), {
          disabled: data.page >= data.total_pages,
        });
      }
    }
    const detail = shell.createDiv({ cls: 'gs-detail' });
    if (this.selected.kind !== 'empty')
      this.button(
        detail,
        this.t('back'),
        () => {
          this.selected = { kind: 'empty' };
          this.render();
        },
        { icon: 'arrow-left', cls: 'gs-detail-back' },
      );
    if (this.selected.kind === 'empty') {
      const intro = detail.createDiv({ cls: 'gs-empty gs-preview-empty' });
      const icon = intro.createDiv({ cls: 'gs-empty-icon' });
      setIcon(icon, 'notebook-pen');
      intro.createEl('h3', { text: this.t('searchIntro') });
      intro.createEl('p', { text: this.t('selectGame') });
    } else if (this.selected.kind === 'loading') this.loading(detail, this.t('loading'));
    else if (this.selected.kind === 'error') {
      const slug = this.selected.slug;
      const provider = this.selected.provider;
      this.error(detail, this.selected.message, () => this.selectGame(slug, false, provider));
    } else this.renderCreate(detail, this.selected.game);
  }
  private async performSearch(page: number): Promise<void> {
    if (!this.query.trim()) return;
    const requestedQuery = this.query.trim();
    const id = ++this.requestId;
    this.searchPage = page;
    if (this.query.trim().startsWith('https://')) {
      await this.selectGame(this.query.trim());
      return;
    }
    this.search = { kind: 'loading' };
    this.render();
    try {
      const data = await this.shelf.sourceFor(this.shelf.selectedProvider()).search(requestedQuery, page);
      if (this.closed || id !== this.requestId) return;
      this.search =
        this.query.trim() === requestedQuery ? { kind: 'ready', data } : { kind: 'idle' };
    } catch (error) {
      if (this.closed || id !== this.requestId) return;
      this.search = { kind: 'error', message: message(error, this.shelf.settings) };
    }
    this.render();
    this.contentEl.querySelector<HTMLButtonElement>('.gs-result')?.focus();
  }
  private async selectGame(identifier: string, includeSteam = false, provider = this.shelf.selectedProvider()): Promise<void> {
    const id = ++this.detailId;
    this.selected = { kind: 'loading', slug: identifier, provider };
    this.render();
    try {
      const game = await this.shelf.sourceFor(provider).get(
        identifier,
        includeSteam || this.shelf.settings.groups.includes('steam'),
      );
      if (this.closed || id !== this.detailId) return;
      this.selected = { kind: 'ready', game };
      if (!includeSteam || !this.options) this.options = this.defaults(game.title);
    } catch (error) {
      if (this.closed || id !== this.detailId) return;
      this.selected = { kind: 'error', slug: identifier, provider, message: message(error, this.shelf.settings) };
    }
    this.render();
    this.contentEl.querySelector<HTMLElement>('.gs-detail')?.scrollIntoView({ block: 'nearest' });
    this.contentEl
      .querySelector<HTMLInputElement>('.gs-title-input')
      ?.focus({ preventScroll: true });
  }
  private renderCreate(parent: HTMLElement, game: Game | null): void {
    const options = this.options ?? this.defaults(game?.title ?? '');
    this.options = options;
    if (!game)
      this.button(
        parent,
        this.t('back'),
        () => {
          this.manual = false;
          this.render();
        },
        { icon: 'arrow-left' },
      );
    const hero = parent.createDiv({ cls: 'gs-detail-hero' });
    if (game) this.image(hero, game.cover_url, 'gs-detail-cover');
    const heading = hero.createDiv({ cls: 'gs-detail-heading' });
    heading.createEl('h2', { text: game?.title ?? this.t('manual') });
    if (game) {
      heading.createEl('p', {
        text: [game.release_date, ...game.platforms].filter(Boolean).join(' · '),
        cls: 'gs-subtle',
      });
      heading.createEl('p', { text: game.tags.join(' · '), cls: 'gs-subtle' });
    }
    const language = noteLocale(this.shelf.settings);
    if (game && game.dataLanguage !== language)
      parent.createEl('p', { cls: 'gs-subtle', text: this.shelf.t('dataLanguageMismatch', {
        language: this.t(game.dataLanguage === 'ja' ? 'languageJa' : 'languageEn'),
      }) });
    const existing = game ? this.shelf.notes.find(gameId(game)) : null;
    if (existing) {
      parent.createEl('p', { text: this.t('alreadyAdded'), cls: 'gs-added' });
      this.button(parent, this.t('openNote'), () => this.shelf.notes.open(existing), {
        primary: true,
        icon: 'file-text',
      });
      return;
    }
    const fields = parent.createDiv({ cls: 'gs-create-fields' });
    const title = this.input(
      this.field(fields, this.t('title')),
      this.t('title'),
      options.title,
      (value) => {
        options.title = value;
        updatePreview();
      },
    );
    title.addClass('gs-title-input');
    const personal = fields.createDiv({ cls: 'gs-personal-grid' });
    this.select(
      this.field(personal, this.t('status')),
      this.t('status'),
      options.status,
      this.shelf.settings.statuses.map((s) => [s, this.shelf.statusLabel(s)]),
      (value) => {
        options.status = value;
        updatePreview();
      },
    );
    this.ratingSelect(this.field(personal, this.t('rating')), options.rating, (value) => {
      options.rating = value;
      updatePreview();
    });
    this.select(
      this.field(personal, this.t('ownership')),
      this.t('ownership'),
      options.ownership,
      [
        ['owned', this.t('owned')],
        ['not-owned', this.t('notOwned')],
        ['subscription', this.t('subscription')],
      ],
      (value) => {
        options.ownership = value;
        updatePreview();
      },
    );
    let previewCode: HTMLElement | null = null;
    let target: HTMLElement | null = null;
    const updatePreview = () => {
      if (target)
        try {
          target.setText(
            `${this.shelf.settings.folder ? this.shelf.settings.folder + '/' : ''}${filename(this.shelf.settings.filename, { title: options.title || 'Game', slug: game?.slug ?? 'manual', release_date: game?.release_date ?? null, platforms: game?.platforms ?? [] })}.md`,
          );
        } catch (error) {
          target.setText(message(error, this.shelf.settings));
        }
      if (!previewCode) return;
      try {
        const source = game
          ? sourceMetadata(game, options.groups, this.shelf.settings)
          : { title: options.title };
        const metadata = {
          ...source,
          [property(this.shelf.settings, 'title')]: options.title,
          [property(this.shelf.settings, 'status')]: options.status,
          [property(this.shelf.settings, 'rating')]: options.rating,
          [property(this.shelf.settings, 'ownership')]: options.ownership,
        };
        const body = this.shelf.notes.body(
          options.title,
          game?.cover_url ?? null,
          game ? sourceBody(game, options.groups, localizedText(language, 'sourceHeading'), language) : '',
          language,
        );
        previewCode.setText(renderNote(metadata, body));
      } catch (error) {
        previewCode.setText(message(error, this.shelf.settings));
      }
    };
    if (game) {
      const includes = fields.createEl('details', { cls: 'gs-field-selection' });
      includes.createEl('summary', { text: this.t('include') });
      for (const group of FIELD_GROUPS.filter((group) => game.source !== 'igdb' || (group !== 'articles' && group !== 'steam')))
        this.checkbox(includes, this.t(group), options.groups.includes(group), (checked) => {
          options.groups = checked
            ? [...new Set([...options.groups, group])]
            : options.groups.filter((g) => g !== group);
          updatePreview();
          if (group === 'steam' && checked) void this.selectGame(game.id, true, game.source);
        });
      this.checkbox(fields, this.t('saveCover'), options.saveCover, (checked) => {
        options.saveCover = checked;
      });
    }
    const preview = fields.createEl('details', { cls: 'gs-note-preview' });
    preview.createEl('summary', { text: this.t('preview') });
    previewCode = preview.createEl('pre');
    target = fields.createEl('p', { cls: 'gs-target-path' });
    updatePreview();
    const actions = fields.createDiv({ cls: 'gs-create-action' });
    this.button(
      actions,
      this.busy ? this.t('creating') : this.t('create'),
      async () => {
        if (this.busy) return;
        this.busy = true;
        this.render();
        try {
          const result = game
            ? await this.shelf.notes.create(game, options)
            : await this.shelf.notes.manual(options);
          if (result.warning) new Notice(result.warning, 10000);
          this.manual = false;
          this.libraryPath = result.file.path;
          this.tab = 'library';
          this.options = null;
          this.render();
          await this.shelf.notes.open(result.file);
        } finally {
          this.busy = false;
          if (!this.closed) this.render();
        }
      },
      { primary: true, icon: 'file-plus-2', disabled: this.busy },
    );
    if (game)
      fields.createEl('p', {
        cls: 'gs-subtle gs-provenance',
        text: `${sourceName(game)} · ${game.fetched_at.slice(0, 10)}`,
      });
  }
  private checkbox(
    parent: HTMLElement,
    label: string,
    checked: boolean,
    onChange: (checked: boolean) => void,
  ): void {
    const row = parent.createEl('label', { cls: 'gs-checkbox' });
    const input = row.createEl('input', { type: 'checkbox' });
    input.checked = checked;
    row.createSpan({ text: label });
    this.screen.registerDomEvent(input, 'change', () => onChange(input.checked));
  }
  private ratingSelect(
    parent: HTMLElement,
    value: number | null,
    change: (value: number | null) => void,
  ): void {
    this.select(
      parent,
      this.t('rating'),
      value === null ? '' : String(value),
      [
        ['', this.t('unrated')],
        ...Array.from({ length: 11 }, (_, i): [string, string] => [String(i / 2), `${i / 2}/5`]),
      ],
      (value) => change(value === '' ? null : Number(value)),
    );
  }
  private renderNoteDetail(parent: HTMLElement, item: LibraryItem): void {
    this.button(
      parent,
      this.t('closeDetails'),
      () => {
        this.libraryPath = null;
        this.updatePreview = null;
        this.render();
      },
      { icon: 'x' },
    );
    const hero = parent.createDiv({ cls: 'gs-detail-hero' });
    this.image(hero, this.localCover(item), 'gs-detail-cover');
    const title = hero.createDiv({ cls: 'gs-detail-heading' });
    title.createEl('h2', { text: item.title });
    title.createEl('p', { cls: 'gs-subtle', text: item.platforms.join(' · ') });
    this.button(
      title,
      this.t('openNote'),
      () => this.shelf.notes.open(this.shelf.notes.file(item.path)),
      { primary: true, icon: 'file-text' },
    );
    const file = this.shelf.notes.file(item.path);
    const fm: unknown = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const noteSettings = this.shelf.notes.settingsFor(file);
    const read = (key: string) => (record(fm) ? fm[property(noteSettings, key)] : undefined);
    const personal = parent.createDiv({ cls: 'gs-personal-grid' });
    this.select(
      this.field(personal, this.t('status')),
      this.t('status'),
      item.status,
      [...new Set([...this.shelf.settings.statuses, item.status])].map((s) => [
        s,
        this.shelf.statusLabel(s),
      ]),
      (value) => {
        void this.run(() => this.shelf.notes.setPersonal(file, 'status', value));
      },
    );
    this.ratingSelect(this.field(personal, this.t('rating')), item.rating, (value) => {
      void this.run(() => this.shelf.notes.setPersonal(file, 'rating', value));
    });
    const ownership = read('ownership');
    this.select(
      this.field(personal, this.t('ownership')),
      this.t('ownership'),
      typeof ownership === 'string' ? ownership : 'owned',
      [
        ['owned', this.t('owned')],
        ['not-owned', this.t('notOwned')],
        ['subscription', this.t('subscription')],
      ],
      (value) => {
        void this.run(() => this.shelf.notes.setPersonal(file, 'ownership', value));
      },
    );
    for (const key of ['started', 'finished'] as const) {
      const row = this.field(personal, this.t(key));
      const value = read(key);
      const input = row.createEl('input', {
        type: 'date',
        value: typeof value === 'string' ? value : '',
        attr: { 'aria-label': this.t(key) },
      });
      this.screen.registerDomEvent(input, 'change', () => {
        void this.run(() => this.shelf.notes.setPersonal(file, key, input.value || null));
      });
    }
    parent.createEl('p', {
      cls: 'gs-subtle gs-minutes-total',
      text: `${item.minutes} ${this.t('minutesTotal')}`,
    });
    const journal = parent.createEl('form', { cls: 'gs-journal' });
    journal.createEl('h3', { text: this.t('journal') });
    const textarea = journal.createEl('textarea', {
      cls: 'gs-journal-text',
      attr: { 'aria-label': this.t('sessionNote'), placeholder: this.t('sessionNote'), rows: '4' },
    });
    textarea.value = this.journalText;
    this.screen.registerDomEvent(textarea, 'input', () => {
      this.journalText = textarea.value;
      this.drafts.set(item.path, { text: this.journalText, minutes: this.journalMinutes });
    });
    const minutes = this.input(journal, this.t('minutes'), this.journalMinutes, (value) => {
      this.journalMinutes = value;
      this.drafts.set(item.path, { text: this.journalText, minutes: this.journalMinutes });
    });
    minutes.type = 'number';
    minutes.min = '0';
    minutes.max = '1440';
    const submit = new ButtonComponent(journal).setButtonText(this.t('saveSession')).setCta();
    submit.buttonEl.type = 'submit';
    submit.setDisabled(this.busy);
    this.screen.registerDomEvent(journal, 'submit', (event) => {
      event.preventDefault();
      void this.run(async () => {
        if (this.busy) return;
        this.busy = true;
        submit.setDisabled(true);
        try {
          await this.shelf.notes.session(
            file,
            this.journalText,
            this.journalMinutes === '' ? null : Number(this.journalMinutes),
          );
          this.journalText = '';
          this.journalMinutes = '';
          this.drafts.delete(item.path);
          new Notice(this.t('saved'));
        } finally {
          this.busy = false;
          submit.setDisabled(false);
        }
        this.render();
      });
    });
    if (item.source !== 'manual' && this.shelf.settings.online)
      this.button(
        parent,
        this.t('refresh'),
        async () => {
          if (item.source === 'manual') return;
          const game = await this.shelf.sourceFor(item.source).get(item.sourceId, false, true);
          const changes = this.shelf.notes.previewChanges(file, game, this.shelf.settings.groups);
          this.updatePreview = {
            game,
            changes,
            selected: new Set(changes.filter((c) => !c.conflict).map((c) => c.key)),
          };
          this.render();
        },
        { icon: 'refresh-cw' },
      );
    if (this.updatePreview) {
      const preview = this.updatePreview;
      const section = parent.createDiv({ cls: 'gs-update-preview' });
      section.createEl('h3', { text: this.t('refreshTitle') });
      section.createEl('p', { text: this.t('refreshBody'), cls: 'gs-subtle' });
      let apply: ButtonComponent | null = null;
      for (const change of preview.changes) {
        const row = section.createDiv({ cls: 'gs-change' });
        this.checkbox(row, change.key, preview.selected.has(change.key), (checked) => {
          if (checked) preview.selected.add(change.key);
          else preview.selected.delete(change.key);
          apply?.setDisabled(!preview.selected.size);
        });
        if (change.conflict) row.createSpan({ text: this.t('conflict'), cls: 'gs-conflict' });
        row.createEl('p', {
          cls: 'gs-change-before',
          text: `${this.t('current')}: ${JSON.stringify(change.before) ?? '—'}`,
        });
        row.createEl('p', {
          cls: 'gs-change-after',
          text: `${this.t('incoming')}: ${JSON.stringify(change.after)}`,
        });
      }
      if (!preview.changes.length) section.createEl('p', { text: this.t('noChanges') });
      else
        apply = this.button(
          section,
          this.t('apply'),
          async () => {
            await this.shelf.notes.applyChanges(
              file,
              preview.game,
              preview.changes,
              preview.selected,
            );
            this.updatePreview = null;
            new Notice(this.t('saved'));
            this.render();
          },
          { primary: true, disabled: !preview.selected.size },
        );
      this.button(section, this.t('cancel'), () => {
        this.updatePreview = null;
        this.render();
      });
    }
  }
  private loading(parent: HTMLElement, label: string): void {
    const loading = parent.createDiv({
      cls: 'gs-loading',
      attr: { role: 'status', 'aria-live': 'polite' },
    });
    loading.createEl('p', { text: label });
    for (let i = 0; i < 3; i++) loading.createDiv({ cls: 'gs-skeleton' });
  }
  private error(parent: HTMLElement, error: string, retry: () => Promise<void>): void {
    const section = parent.createDiv({ cls: 'gs-error', attr: { role: 'alert' } });
    section.createEl('h3', { text: this.t('error') });
    section.createEl('p', { text: error });
    this.button(section, this.t('retry'), retry);
    this.button(section, this.t('manual'), () => this.openManual());
  }
}
