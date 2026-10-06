import {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {Download, Search, X, Minus, Plus, Copy, Check, Upload, ClipboardPaste, FileCode2, Trash2} from 'lucide-react';

const BASE_URL = import.meta.env.BASE_URL;
const ICONS_URL = `${BASE_URL}icons.json`;
const TAGS_URL = `${BASE_URL}icon-tags.json`;
const CUSTOM_ICONS_KEY = 'iconostasCustomIcons';
const SCALE_KEY = 'iconostasScale';
const MIN_SCALE = .75;
const MAX_SCALE = 2;
const COPIED_LABEL = 'Иконка скопирована';
// Temporarily hide uploads; set to true to restore the existing add-icon flow.
const ICON_UPLOAD_ENABLED = false;
const normalize = (value='') => value.toString().trim().toLowerCase().replace(/ё/g, 'е').replace(/[\s_]+/g, '-');
const cleanName = (name='') => name.replace(/^.*\//, '');
const slug = (value='') => cleanName(value).toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').replace(/^-|-$/g, '');
const iconUrl = (file) => `${BASE_URL}icons/${encodeURIComponent(file)}`;
const pluralRules = new Intl.PluralRules('ru');
const ICON_WORDS = {one: 'иконка', few: 'иконки', many: 'иконок', other: 'иконки'};

function readScale() {
  try {
    const value = Number(localStorage.getItem(SCALE_KEY));
    return Number.isFinite(value) && value >= MIN_SCALE && value <= MAX_SCALE ? value : 1;
  } catch {
    return 1;
  }
}

function getStoredIcons() {
  if (!ICON_UPLOAD_ENABLED) return [];
  try {
    const stored = JSON.parse(localStorage.getItem(CUSTOM_ICONS_KEY) || '[]');
    return Array.isArray(stored) ? stored.filter(icon => icon?.nodeId && icon?.svg) : [];
  } catch {
    return [];
  }
}

function storeIcons(icons) {
  try {
    localStorage.setItem(CUSTOM_ICONS_KEY, JSON.stringify(icons));
  } catch {
    throw new Error('Не удалось сохранить иконку в браузере');
  }
}

function iconSrc(icon) {
  return icon.svg
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(icon.svg)}`
    : iconUrl(icon.file);
}

function parseSvg(source) {
  const document = new DOMParser().parseFromString(source.trim(), 'image/svg+xml');
  if (document.querySelector('parsererror') || document.documentElement.localName !== 'svg') {
    throw new Error('Похоже, это невалидный SVG-код');
  }
  return document;
}

function sanitizeSvg(source) {
  const document = parseSvg(source);

  document.querySelectorAll('script, style, foreignObject, iframe, object, embed, animate, set, animateMotion, animateTransform, discard')
    .forEach(node => node.remove());
  document.querySelectorAll('*').forEach(node => {
    [...node.attributes].forEach(attribute => {
      const value = attribute.value.trim();
      const isEventHandler = /^on/i.test(attribute.name);
      // Only same-document references are allowed: no external, data: or javascript: URLs.
      const isExternalLink = /^(href|xlink:href)$/i.test(attribute.name) && !value.startsWith('#');
      const hasExternalUrl = /url\s*\(\s*['"]?\s*[^'"#\s)]/i.test(value);
      if (isEventHandler || isExternalLink || hasExternalUrl) node.removeAttribute(attribute.name);
    });
  });

  return new XMLSerializer().serializeToString(document.documentElement);
}

function addSvgName(source, name) {
  const document = parseSvg(source);
  document.documentElement.setAttribute('id', name);
  return new XMLSerializer().serializeToString(document.documentElement);
}

async function fetchSvg(icon) {
  if (icon.svg) return icon.svg;
  const response = await fetch(iconUrl(icon.file));
  if (!response.ok) throw new Error(`Не удалось загрузить ${icon.file}: HTTP ${response.status}`);
  return response.text();
}

function copyWithTextarea(text) {
  const textarea = document.createElement('textarea');
  const previousFocus = document.activeElement;
  textarea.value = text;
  textarea.readOnly = true;
  textarea.dataset.clipboardFallback = '';
  textarea.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
  document.body.append(textarea);
  textarea.select();
  textarea.setSelectionRange(0, text.length);
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  textarea.remove();
  previousFocus?.focus?.({preventScroll: true});
  return copied;
}

// Must be called synchronously from the click handler: Safari only allows
// clipboard writes inside the user gesture, so the SVG is passed as a promise.
async function copyText(textPromise) {
  if (navigator.clipboard?.write && window.ClipboardItem) {
    try {
      const blob = textPromise.then(text => new Blob([text], {type: 'text/plain'}));
      blob.catch(() => {});
      await navigator.clipboard.write([new ClipboardItem({'text/plain': blob})]);
      return;
    } catch {
      // Fall through to the older APIs below.
    }
  }
  const text = await textPromise;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the textarea fallback.
    }
  }
  if (!copyWithTextarea(text)) throw new Error('Браузер не дал доступ к буферу обмена');
}

function countLabel(shown, total, hasQuery) {
  if (!hasQuery) return `${total} ${ICON_WORDS[pluralRules.select(total)]}`;
  // After «из» the noun is genitive: «из 21 иконки», «из 238 иконок».
  return `${shown} из ${total} ${pluralRules.select(total) === 'one' ? 'иконки' : 'иконок'}`;
}

function useIconData() {
  const [data, setData] = useState({icons: [], tags: {}, status: 'loading'});
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setData(data => ({...data, status: 'loading'}));
    Promise.all([
      fetch(ICONS_URL).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
      fetch(TAGS_URL).then(r => r.ok ? r.json() : {}).catch(() => ({})),
    ]).then(([icons, tags]) => {
      if (!Array.isArray(icons)) throw new Error('icons.json должен быть массивом');
      if (!cancelled) setData({icons, tags: tags && typeof tags === 'object' ? tags : {}, status: 'ready'});
    }).catch(() => {
      if (!cancelled) setData(data => ({...data, status: 'error'}));
    });
    return () => { cancelled = true; };
  }, [attempt]);
  return {...data, reload: () => setAttempt(n => n + 1)};
}

function useDockViewport(dockRef) {
  useLayoutEffect(() => {
    const viewport = window.visualViewport;
    const dock = dockRef.current;
    if (!viewport || !dock) return;
    let frame = 0;

    const update = () => {
      frame = 0;
      // The keyboard can shrink the visual viewport without resizing the page.
      // Ignore pinch zoom so it does not get mistaken for an open keyboard.
      const isUnzoomed = Math.abs(viewport.scale - 1) < .01;
      const inset = isUnzoomed ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
      dock.style.setProperty('--keyboard-inset', `${inset}px`);
      dock.style.setProperty('--viewport-height', `${isUnzoomed ? viewport.height : window.innerHeight}px`);
    };
    const scheduleUpdate = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    viewport.addEventListener('resize', scheduleUpdate);
    viewport.addEventListener('scroll', scheduleUpdate);
    window.addEventListener('resize', scheduleUpdate);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener('resize', scheduleUpdate);
      viewport.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, [dockRef]);
}

function IconTooltip({title}) {
  return <span className="icon-tooltip" aria-hidden="true">{title}</span>;
}

function AddIconPopover({onClose, onAdd}) {
  const [sourceMode, setSourceMode] = useState('file');
  const [iconName, setIconName] = useState('');
  const [svgDraft, setSvgDraft] = useState('');
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const nameInput = useRef(null);

  useEffect(() => { nameInput.current?.focus(); }, []);

  const acceptFile = async (file) => {
    setError('');
    if (!file || (!file.name.toLowerCase().endsWith('.svg') && file.type !== 'image/svg+xml')) {
      setError('Нужен файл в формате SVG');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('SVG должен быть меньше 2 МБ');
      return;
    }
    try {
      const source = await file.text();
      sanitizeSvg(source);
      setSvgDraft(source);
      setFileName(file.name);
      if (!iconName.trim()) setIconName(file.name.replace(/\.svg$/i, ''));
    } catch (fileError) {
      setError(fileError.message || 'Не удалось прочитать SVG');
    }
  };

  const pasteFromClipboard = async () => {
    setError('');
    try {
      const source = await navigator.clipboard.readText();
      if (!source.trim()) throw new Error('В буфере обмена нет SVG-кода');
      sanitizeSvg(source);
      setSvgDraft(source);
      if (!iconName.trim()) setIconName('new-icon');
    } catch (clipboardError) {
      setError(clipboardError.message || 'Не удалось прочитать буфер — вставьте код через ⌘V');
    }
  };

  const submit = () => {
    setError('');
    if (!iconName.trim()) {
      setError('Добавьте название иконки');
      nameInput.current?.focus();
      return;
    }
    if (!svgDraft.trim()) {
      setError(sourceMode === 'file' ? 'Выберите или перетащите SVG-файл' : 'Вставьте SVG-код');
      return;
    }
    try {
      onAdd({name: iconName.trim(), svg: sanitizeSvg(svgDraft)});
    } catch (svgError) {
      setError(svgError.message || 'Не удалось добавить SVG');
    }
  };

  return <div
    id="add-icon-dialog"
    className="add-popover"
    role="dialog"
    aria-modal="false"
    aria-labelledby="add-icon-title"
    onDragEnter={event => { event.preventDefault(); setIsDragging(true); }}
    onDragOver={event => event.preventDefault()}
    onDragLeave={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setIsDragging(false);
    }}
    onDrop={event => {
      event.preventDefault();
      setIsDragging(false);
      setSourceMode('file');
      acceptFile(event.dataTransfer.files[0]);
    }}
  >
    <div className="add-popover-header">
      <div>
        <h2 id="add-icon-title">Добавить иконку</h2>
        <p>SVG появится в начале коллекции</p>
      </div>
      <button className="icon-button" onClick={onClose} aria-label="Закрыть добавление"><X size={17}/></button>
    </div>

    <label className="field-label" htmlFor="icon-name">Название</label>
    <input
      ref={nameInput}
      id="icon-name"
      className="text-field"
      value={iconName}
      onChange={event => setIconName(event.target.value)}
      placeholder="Например, arrow-up"
      autoComplete="off"
    />

    <div className="source-tabs" role="tablist" aria-label="Способ добавления">
      <button
        className={sourceMode === 'file' ? 'active' : ''}
        role="tab"
        aria-selected={sourceMode === 'file'}
        onClick={() => { setSourceMode('file'); setError(''); }}
      ><Upload size={15}/>Файл</button>
      <button
        className={sourceMode === 'code' ? 'active' : ''}
        role="tab"
        aria-selected={sourceMode === 'code'}
        onClick={() => { setSourceMode('code'); setError(''); }}
      ><FileCode2 size={15}/>SVG-код</button>
    </div>

    {sourceMode === 'file' ? <label className={`drop-zone${isDragging ? ' is-dragging' : ''}${fileName ? ' has-file' : ''}`}>
      <input type="file" accept=".svg,image/svg+xml" onChange={event => acceptFile(event.target.files[0])}/>
      <span className="drop-zone-icon">{fileName ? <Check size={19}/> : <Upload size={19}/>}</span>
      <span className="drop-zone-copy">
        <strong>{fileName || 'Перетащите SVG сюда'}</strong>
        <span>{fileName ? 'Файл готов к добавлению' : 'или нажмите, чтобы выбрать файл'}</span>
      </span>
    </label> : <div className="code-source">
      <textarea
        value={svgDraft}
        onChange={event => { setSvgDraft(event.target.value); setFileName(''); setError(''); }}
        placeholder={'<svg viewBox="0 0 24 24">…</svg>'}
        aria-label="SVG-код"
        spellCheck="false"
      />
      <button className="paste-button" onClick={pasteFromClipboard}><ClipboardPaste size={16}/>Вставить из буфера</button>
    </div>}

    <div className="add-popover-footer">
      <span className="form-message" role="status">{error}</span>
      <button className="primary-button" onClick={submit}>Добавить</button>
    </div>
  </div>;
}

export default function App() {
  const {icons, tags, status, reload} = useIconData();
  const [customIcons, setCustomIcons] = useState(getStoredIcons);
  const [query, setQuery] = useState('');
  const [scale, setScale] = useState(readScale);
  const [activeIcon, setActiveIcon] = useState('');
  const [copyToast, setCopyToast] = useState(0);
  const [buttonCopied, setButtonCopied] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const searchInput = useRef(null);
  const dock = useRef(null);
  const copyToastTimer = useRef(null);
  const buttonCopiedTimer = useRef(null);
  const errorTimer = useRef(null);

  useDockViewport(dock);

  useEffect(() => {
    try {
      localStorage.setItem(SCALE_KEY, String(scale));
    } catch {
      // Storage may be blocked; the scale just won't be remembered.
    }
  }, [scale]);
  useLayoutEffect(() => {
    if (searchOpen) searchInput.current?.focus({preventScroll: true});
  }, [searchOpen]);
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      if (addOpen) setAddOpen(false);
      else if (activeIcon) setActiveIcon('');
      else if (searchOpen && !query) setSearchOpen(false);
      else if (searchOpen) setQuery('');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeIcon, addOpen, query, searchOpen]);
  useEffect(() => {
    const onPointerDown = (event) => {
      if (!event.target.closest('.add-popover, .header-add-button')) setAddOpen(false);
      if (!event.target.closest('.card, .selection-toolbar')) setActiveIcon('');
    };
    const onFocusIn = (event) => {
      if (!event.target.closest('.card.is-active, .selection-toolbar, [data-clipboard-fallback]')) setActiveIcon('');
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, []);
  useEffect(() => () => {
    clearTimeout(copyToastTimer.current);
    clearTimeout(buttonCopiedTimer.current);
    clearTimeout(errorTimer.current);
  }, []);

  const allIcons = useMemo(() => [...customIcons, ...icons], [customIcons, icons]);
  const enriched = useMemo(() => allIcons.map(icon => {
    const title = cleanName(icon.name);
    return {
      ...icon,
      title,
      searchText: [title, icon.file, icon.nodeId, ...(tags[icon.nodeId] || [])].map(normalize).join(' '),
    };
  }), [allIcons, tags]);

  const filtered = useMemo(() => {
    const terms = query.split(/\s+/).map(normalize).filter(Boolean);
    if (!terms.length) return enriched;
    return enriched.filter(icon => terms.every(term => icon.searchText.includes(term)));
  }, [enriched, query]);
  const activeIconData = useMemo(
    () => enriched.find(icon => icon.nodeId === activeIcon),
    [activeIcon, enriched],
  );

  const showError = (message) => {
    clearTimeout(errorTimer.current);
    setErrorMessage(message);
    errorTimer.current = setTimeout(() => setErrorMessage(''), 4000);
  };

  const download = async (icon) => {
    try {
      const svg = await fetchSvg(icon);
      parseSvg(svg);
      const url = URL.createObjectURL(new Blob([svg], {type: 'image/svg+xml'}));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slug(icon.title) || 'icon'}.svg`;
      document.body.append(a);
      a.click();
      a.remove();
      // Firefox and Safari may cancel the download if the URL is revoked in the same tick.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      showError('Не удалось скачать SVG');
    }
  };

  // Starts the clipboard write synchronously; see copyText.
  const copySvg = (icon) => copyText(fetchSvg(icon).then(svg => addSvgName(svg, icon.title)));

  const reportCopyError = () => {
    showError(window.isSecureContext
      ? 'Не удалось скопировать SVG'
      : 'Не удалось скопировать: буфер обмена доступен только по https или localhost');
  };

  const addIcon = ({name, svg}) => {
    const baseName = slug(name) || 'icon';
    const nodeId = `custom:${Date.now()}`;
    const nextIcon = {
      nodeId,
      name: `24_icon-fill/${name}`,
      file: `${baseName}.svg`,
      svg,
      custom: true,
    };
    const nextIcons = [nextIcon, ...customIcons];
    storeIcons(nextIcons);
    setCustomIcons(nextIcons);
    setAddOpen(false);
    setActiveIcon(nodeId);
  };

  const removeIcon = (icon) => {
    const nextIcons = customIcons.filter(custom => custom.nodeId !== icon.nodeId);
    try {
      storeIcons(nextIcons);
    } catch (error) {
      showError(error.message);
      return;
    }
    setCustomIcons(nextIcons);
    setActiveIcon('');
    setAnnouncement(`Иконка ${icon.title} удалена`);
  };

  // A new key on every copy restarts the toast animation.
  const showCopyToast = () => {
    clearTimeout(copyToastTimer.current);
    setCopyToast(key => key + 1);
    copyToastTimer.current = setTimeout(() => setCopyToast(0), 1600);
  };

  const copyFromTile = async (icon) => {
    setActiveIcon(icon.nodeId);
    try {
      await copySvg(icon);
    } catch {
      reportCopyError();
      return;
    }
    showCopyToast();
    setAnnouncement(`${COPIED_LABEL}: ${icon.title}`);
  };

  const copyFromToolbar = async (icon) => {
    try {
      await copySvg(icon);
    } catch {
      reportCopyError();
      return;
    }
    clearTimeout(buttonCopiedTimer.current);
    setButtonCopied(icon.nodeId);
    showCopyToast();
    setAnnouncement(`${COPIED_LABEL}: ${icon.title}`);
    buttonCopiedTimer.current = setTimeout(() => setButtonCopied(''), 1400);
  };

  return <>
    <main className="page">
      <header className="header">
        <div className="header-title">
          <h1>Иконостас</h1>
          {status === 'ready' && <span className="count">{countLabel(filtered.length, allIcons.length, Boolean(query))}</span>}
        </div>
        {ICON_UPLOAD_ENABLED && <button
          className={`header-add-button${addOpen ? ' active' : ''}`}
          onClick={() => {
            setAddOpen(open => !open);
            setSearchOpen(false);
            setActiveIcon('');
          }}
          aria-label="Добавить иконку"
          aria-expanded={addOpen}
          aria-controls="add-icon-dialog"
        ><Plus size={17}/><span>Добавить</span></button>}
      </header>

      <section className="grid" style={{'--scale': scale}}>
        {filtered.map(icon => <button
          type="button"
          className={`card${activeIcon === icon.nodeId ? ' is-active' : ''}`}
          key={icon.nodeId}
          aria-label={`Скопировать ${icon.title} и открыть действия`}
          aria-expanded={activeIcon === icon.nodeId}
          onClick={() => copyFromTile(icon)}
        >
          <img
            className="icon-glyph"
            src={iconSrc(icon)}
            alt=""
            aria-hidden="true"
            draggable={false}
          />
          <IconTooltip title={icon.title}/>
        </button>)}
      </section>
      {status === 'error' && !allIcons.length && <div className="empty" role="alert">
        <span>Не удалось загрузить иконки</span>
        <button className="retry-button" onClick={reload}>Повторить</button>
      </div>}
      {status === 'ready' && !filtered.length && <div className="empty"><Search size={20}/><span>Ничего не найдено</span></div>}
    </main>
    <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
    {copyToast > 0 && <div key={copyToast} className="copy-toast" aria-hidden="true">
      <Check size={15}/>{COPIED_LABEL}
    </div>}
    <div ref={dock} className="dock-wrap">
      {errorMessage && <div className="dock-toast" role="alert">{errorMessage}</div>}
      {ICON_UPLOAD_ENABLED && addOpen && <AddIconPopover onClose={() => setAddOpen(false)} onAdd={addIcon}/>}
      {activeIconData && <div className="selection-toolbar" role="toolbar" aria-label={`Действия с ${activeIconData.title}`}>
        <span className="selection-preview" aria-hidden="true">
          <img src={iconSrc(activeIconData)} alt=""/>
        </span>
        <span className="selection-name" title={activeIconData.title}>{activeIconData.title}</span>
        <span className="dock-divider"/>
        <button onClick={() => copyFromToolbar(activeIconData)} aria-label={`Копировать ${activeIconData.title}`} title="Копировать SVG">
          {buttonCopied===activeIconData.nodeId ? <Check size={18}/> : <Copy size={18}/>}
        </button>
        <button onClick={() => download(activeIconData)} aria-label={`Скачать ${activeIconData.title}`} title="Скачать SVG">
          <Download size={18}/>
        </button>
        {activeIconData.custom && <button onClick={() => removeIcon(activeIconData)} aria-label={`Удалить ${activeIconData.title}`} title="Удалить иконку">
          <Trash2 size={18}/>
        </button>}
      </div>}
      {searchOpen && <div className="search-popover">
        <Search size={18}/>
        <span className="search-field">
          <input
            ref={searchInput}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
            placeholder="Поиск иконок"
            aria-label="Поиск иконок"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </span>
        {query && <button
          onPointerDown={event => event.preventDefault()}
          onClick={() => {
            setQuery('');
            searchInput.current?.focus({preventScroll: true});
          }}
          aria-label="Очистить поиск"
        ><X size={16}/></button>}
      </div>}
      <div className="float-dock">
        <button
          className={searchOpen ? 'active' : ''}
          onClick={() => setSearchOpen(open => !open)}
          aria-label="Открыть поиск"
          aria-expanded={searchOpen}
        >
          <Search size={18}/>
          {query && <span className="query-dot"/>}
        </button>
        <span className="dock-divider"/>
        <button onClick={() => setScale(s => Math.max(MIN_SCALE, +(s-.25).toFixed(2)))} aria-label="Уменьшить иконки"><Minus size={18}/></button>
        <button className="scale-value" onClick={() => setScale(1)} title="Сбросить масштаб" aria-label={`Масштаб ${Math.round(scale*100)}%, сбросить`}>{Math.round(scale*100)}%</button>
        <button onClick={() => setScale(s => Math.min(MAX_SCALE, +(s+.25).toFixed(2)))} aria-label="Увеличить иконки"><Plus size={18}/></button>
      </div>
    </div>
  </>;
}
