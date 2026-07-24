import React, {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Download, Search, X, Minus, Plus, Copy, Check} from 'lucide-react';
import './styles.css';

const ICONS_URL = '/icons.json';
const TAGS_URL = '/icon-tags.json';
const normalize = (value='') => value.toString().trim().toLowerCase().replace(/\s+/g, '-');
const cleanName = (name='') => name.replace(/^24_icon-fill\//, '').replace(/^icon-24\//, '');
const slug = (value='') => cleanName(value).toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').replace(/^-|-$/g, '');
let tooltipMeasureCanvas;

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

function App() {
  const {icons, tags} = useIconData();
  const [query, setQuery] = useState('');
  const [scale, setScale] = useState(() => Number(localStorage.iconostasScale || 1));
  const [activeIcon, setActiveIcon] = useState('');
  const [copyNotice, setCopyNotice] = useState('');
  const [buttonCopied, setButtonCopied] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
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
      if (activeIcon || copyNotice) {
        setActiveIcon('');
        setCopyNotice('');
      }
      else if (searchOpen && !query) setSearchOpen(false);
      else if (searchOpen) setQuery('');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeIcon, copyNotice, query, searchOpen]);
  useEffect(() => {
    const onPointerDown = (event) => {
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

  const enriched = useMemo(() => icons.map(icon => ({
    ...icon,
    title: cleanName(icon.name),
    tags: [cleanName(icon.name), icon.file, icon.nodeId, ...(tags[icon.nodeId] || [])].map(normalize),
  })), [icons, tags]);

  const filtered = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return enriched;
    return enriched.filter(icon => terms.every(term => [icon.title, icon.name, icon.file, icon.nodeId, ...icon.tags].join(' ').toLowerCase().includes(term)));
  }, [enriched, query]);
  const activeIconData = useMemo(
    () => enriched.find(icon => icon.nodeId === activeIcon),
    [activeIcon, enriched],
  );

  const download = async (icon) => {
    const res = await fetch(`/icons/${encodeURIComponent(icon.file)}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = icon.file; a.click();
    URL.revokeObjectURL(url);
  };

  const copySvg = async (icon) => {
    const svg = await fetch(`/icons/${encodeURIComponent(icon.file)}`).then(r => r.text());
    await navigator.clipboard.writeText(svg);
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
        <h1>Иконостас</h1>
        <span className="count">{query ? `${filtered.length} из ${icons.length}` : icons.length} иконок</span>
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
            src={`/icons/${encodeURIComponent(icon.file)}`}
            alt=""
            aria-hidden="true"
          />
          <IconTooltip title={icon.title} isCopied={copyNotice === icon.nodeId}/>
        </article>)}
      </section>
      {!filtered.length && <div className="empty"><Search size={20}/><span>Ничего не найдено</span></div>}
    </main>
    <div className="dock-wrap">
      {activeIconData && <div className="selection-toolbar" role="toolbar" aria-label={`Действия с ${activeIconData.title}`}>
        <span className="selection-preview" aria-hidden="true">
          <img src={`/icons/${encodeURIComponent(activeIconData.file)}`} alt=""/>
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
