import React, {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Download, Search, X, Minus, Plus, Copy, Check, Upload, ClipboardPaste, FileCode2} from 'lucide-react';
import './styles.css';

const ICONS_URL = '/icons.json';
const TAGS_URL = '/icon-tags.json';
const CUSTOM_ICONS_KEY = 'iconostasCustomIcons';
const normalize = (value='') => value.toString().trim().toLowerCase().replace(/\s+/g, '-');
const cleanName = (name='') => name.replace(/^24_icon-fill\//, '').replace(/^icon-24\//, '');
const slug = (value='') => cleanName(value).toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').replace(/^-|-$/g, '');
let tooltipMeasureCanvas;

function getStoredIcons() {
  try {
    const stored = JSON.parse(localStorage.getItem(CUSTOM_ICONS_KEY) || '[]');
    return Array.isArray(stored) ? stored.filter(icon => icon?.nodeId && icon?.svg) : [];
  } catch {
    return [];
  }
}

function iconSrc(icon) {
  return icon.svg
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(icon.svg)}`
    : `/icons/${encodeURIComponent(icon.file)}`;
}

function sanitizeSvg(source) {
  const document = new DOMParser().parseFromString(source.trim(), 'image/svg+xml');
  if (document.querySelector('parsererror') || document.documentElement.localName !== 'svg') {
    throw new Error('Похоже, это невалидный SVG-код');
  }

  document.querySelectorAll('script, foreignObject, iframe, object, embed').forEach(node => node.remove());
  document.querySelectorAll('*').forEach(node => {
    [...node.attributes].forEach(attribute => {
      if (/^on/i.test(attribute.name)) node.removeAttribute(attribute.name);
      if (/^(href|xlink:href)$/i.test(attribute.name) && /^\s*javascript:/i.test(attribute.value)) {
        node.removeAttribute(attribute.name);
      }
    });
  });

  return new XMLSerializer().serializeToString(document.documentElement);
}

function addSvgName(source, name) {
  const document = new DOMParser().parseFromString(source.trim(), 'image/svg+xml');
  if (document.querySelector('parsererror') || document.documentElement.localName !== 'svg') {
    throw new Error('Похоже, это невалидный SVG-код');
  }

  document.documentElement.setAttribute('id', name);
  return new XMLSerializer().serializeToString(document.documentElement);
}

function measureTooltipText(text) {
  tooltipMeasureCanvas ||= document.createElement('canvas');
  const context = tooltipMeasureCanvas.getContext('2d');
  const fontFamily = getComputedStyle(document.documentElement).fontFamily;
  context.font = `500 12px ${fontFamily}`;
  return Math.ceil(context.measureText(text).width);
}

function useIconData() {
  const [icons, setIcons] = useState([]);
  const [tags, setTags] = useState({});
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(ICONS_URL).then(r => r.json()),
      fetch(TAGS_URL).then(r => r.ok ? r.json() : {}).catch(() => ({})),
    ]).then(([icons, tags]) => {
      if (!cancelled) { setIcons(icons); setTags(tags); }
    });
    return () => { cancelled = true; };
  }, []);
  return {icons, tags};
}

function IconTooltip({title, isCopied}) {
  const [widths, setWidths] = useState({name: 0, success: 0});

  useLayoutEffect(() => {
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      setWidths({
        name: measureTooltipText(title),
        success: measureTooltipText('Иконка скопирована') + 18,
      });
    };
    measure();
    document.fonts?.ready.then(measure);
    return () => { cancelled = true; };
  }, [title]);

  const labelWidth = isCopied ? widths.success : widths.name;
  const style = labelWidth ? {width: `${Math.min(220, labelWidth + 16)}px`} : undefined;

  return <span className="icon-tooltip" role="status" style={style}>
    <span className="tooltip-label tooltip-name"><span className="tooltip-text">{title}</span></span>
    <span className="tooltip-label tooltip-success"><Check size={13}/><span className="tooltip-text">Иконка скопирована</span></span>
  </span>;
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

function App() {
  const {icons, tags} = useIconData();
  const [customIcons, setCustomIcons] = useState(getStoredIcons);
  const [query, setQuery] = useState('');
  const [scale, setScale] = useState(() => Number(localStorage.iconostasScale || 1));
  const [activeIcon, setActiveIcon] = useState('');
  const [copyNotice, setCopyNotice] = useState('');
  const [buttonCopied, setButtonCopied] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const searchInput = useRef(null);
  const copyNoticeTimer = useRef(null);
  const buttonCopiedTimer = useRef(null);

  useEffect(() => { localStorage.iconostasScale = scale; }, [scale]);
  useEffect(() => {
    if (searchOpen) searchInput.current?.focus();
  }, [searchOpen]);
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      if (addOpen) setAddOpen(false);
      else if (activeIcon || copyNotice) {
        setActiveIcon('');
        setCopyNotice('');
      }
      else if (searchOpen && !query) setSearchOpen(false);
      else if (searchOpen) setQuery('');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeIcon, addOpen, copyNotice, query, searchOpen]);
  useEffect(() => {
    const onPointerDown = (event) => {
      if (!event.target.closest('.add-popover, .header-add-button')) setAddOpen(false);
      if (!event.target.closest('.card, .selection-toolbar')) {
        setActiveIcon('');
        setCopyNotice('');
      }
    };
    const onFocusIn = (event) => {
      if (!event.target.closest('.card.is-active, .selection-toolbar')) {
        setActiveIcon('');
        setCopyNotice('');
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, []);
  useEffect(() => () => {
    clearTimeout(copyNoticeTimer.current);
    clearTimeout(buttonCopiedTimer.current);
  }, []);

  const allIcons = useMemo(() => [...customIcons, ...icons], [customIcons, icons]);
  const enriched = useMemo(() => allIcons.map(icon => ({
    ...icon,
    title: cleanName(icon.name),
    tags: [cleanName(icon.name), icon.file, icon.nodeId, ...(tags[icon.nodeId] || [])].map(normalize),
  })), [allIcons, tags]);

  const filtered = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return enriched;
    return enriched.filter(icon => terms.every(term => [icon.title, icon.name, icon.file, icon.nodeId, ...icon.tags].join(' ').toLowerCase().includes(term)));
  }, [enriched, query]);
  const activeIconData = useMemo(
    () => enriched.find(icon => icon.nodeId === activeIcon),
    [activeIcon, enriched],
  );

  const getSvg = async (icon) => icon.svg || fetch(`/icons/${encodeURIComponent(icon.file)}`).then(r => r.text());

  const download = async (icon) => {
    const blob = new Blob([await getSvg(icon)], {type: 'image/svg+xml'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = icon.file; a.click();
    URL.revokeObjectURL(url);
  };

  const copySvg = async (icon) => {
    const svg = addSvgName(await getSvg(icon), icon.title);
    await navigator.clipboard.writeText(svg);
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
    try {
      localStorage.setItem(CUSTOM_ICONS_KEY, JSON.stringify(nextIcons));
    } catch {
      throw new Error('Не удалось сохранить иконку в браузере');
    }
    setCustomIcons(nextIcons);
    setAddOpen(false);
    setActiveIcon(nodeId);
    setCopyNotice('');
  };

  const showCopyNotice = (nodeId) => {
    clearTimeout(copyNoticeTimer.current);
    setCopyNotice('');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      setCopyNotice(nodeId);
      copyNoticeTimer.current = setTimeout(() => setCopyNotice(''), 1600);
    }));
  };

  const copyFromTile = async (icon) => {
    setActiveIcon(icon.nodeId);
    await copySvg(icon);
    showCopyNotice(icon.nodeId);
  };

  const copyFromToolbar = async (icon) => {
    await copySvg(icon);
    clearTimeout(buttonCopiedTimer.current);
    setButtonCopied(icon.nodeId);
    buttonCopiedTimer.current = setTimeout(() => setButtonCopied(''), 1400);
  };

  return <>
    <main className="page">
      <header className="header">
        <div className="header-title">
          <h1>Иконостас</h1>
          <span className="count">{query ? `${filtered.length} из ${allIcons.length}` : allIcons.length} иконок</span>
        </div>
        <button
          className={`header-add-button${addOpen ? ' active' : ''}`}
          onClick={() => {
            setAddOpen(open => !open);
            setSearchOpen(false);
            setActiveIcon('');
            setCopyNotice('');
          }}
          aria-label="Добавить иконку"
          aria-expanded={addOpen}
          aria-controls="add-icon-title"
        ><Plus size={17}/><span>Добавить</span></button>
      </header>

      <section className="grid" style={{'--scale': scale}}>
        {filtered.map(icon => <article
          className={`card${activeIcon === icon.nodeId ? ' is-active' : ''}${copyNotice === icon.nodeId ? ' is-copy-notice' : ''}`}
          key={icon.nodeId}
          tabIndex={0}
          aria-label={`Скопировать ${icon.title} и открыть действия`}
          aria-expanded={activeIcon === icon.nodeId}
          onClick={() => copyFromTile(icon)}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              copyFromTile(icon);
            }
          }}
        >
          <img
            className="icon-glyph"
            src={iconSrc(icon)}
            alt=""
            aria-hidden="true"
          />
          <IconTooltip title={icon.title} isCopied={copyNotice === icon.nodeId}/>
        </article>)}
      </section>
      {!filtered.length && <div className="empty"><Search size={20}/><span>Ничего не найдено</span></div>}
    </main>
    <div className="dock-wrap">
      {addOpen && <AddIconPopover onClose={() => setAddOpen(false)} onAdd={addIcon}/>}
      {activeIconData && <div className="selection-toolbar" role="toolbar" aria-label={`Действия с ${activeIconData.title}`}>
        <span className="selection-preview" aria-hidden="true">
          <img src={iconSrc(activeIconData)} alt=""/>
        </span>
        <span className="dock-divider"/>
        <button onClick={() => copyFromToolbar(activeIconData)} aria-label={`Копировать ${activeIconData.title}`} title="Копировать SVG">
          {buttonCopied===activeIconData.nodeId ? <Check size={18}/> : <Copy size={18}/>}
        </button>
        <button onClick={() => download(activeIconData)} aria-label={`Скачать ${activeIconData.title}`} title="Скачать SVG">
          <Download size={18}/>
        </button>
      </div>}
      {searchOpen && <div className="search-popover">
        <Search size={18}/>
        <input
          ref={searchInput}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Поиск иконок"
          aria-label="Поиск иконок"
        />
        {query && <button onClick={() => setQuery('')} aria-label="Очистить поиск"><X size={16}/></button>}
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
        <button onClick={() => setScale(s => Math.max(.75, +(s-.25).toFixed(2)))} aria-label="Уменьшить иконки"><Minus size={18}/></button>
        <button className="scale-value" onClick={() => setScale(1)} title="Сбросить масштаб" aria-label={`Масштаб ${Math.round(scale*100)}%, сбросить`}>{Math.round(scale*100)}%</button>
        <button onClick={() => setScale(s => Math.min(2, +(s+.25).toFixed(2)))} aria-label="Увеличить иконки"><Plus size={18}/></button>
      </div>
    </div>
  </>;
}

createRoot(document.getElementById('root')).render(<App/>);
