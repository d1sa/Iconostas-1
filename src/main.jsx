import React, {useEffect, useMemo, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Download, Search, X, Minus, Plus, Copy, Check, Sparkles} from 'lucide-react';
import './styles.css';

const ICONS_URL = '/icons.json';
const TAGS_URL = '/icon-tags.json';
const normalize = (value='') => value.toString().trim().toLowerCase().replace(/\s+/g, '-');
const cleanName = (name='') => name.replace(/^24_icon-fill\//, '').replace(/^icon-24\//, '');
const slug = (value='') => cleanName(value).toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').replace(/^-|-$/g, '');

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

function App() {
  const {icons, tags} = useIconData();
  const [query, setQuery] = useState('');
  const [scale, setScale] = useState(() => Number(localStorage.iconostasScale || 1));
  const [selected, setSelected] = useState(null);
  const [copied, setCopied] = useState('');

  useEffect(() => { localStorage.iconostasScale = scale; }, [scale]);

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
    setCopied(icon.nodeId);
    setTimeout(() => setCopied(''), 1400);
  };

  return <>
    <main className="page">
      <section className="hero">
        <div>
          <p className="eyebrow"><Sparkles size={16}/> Локальная библиотека SVG</p>
          <h1>Иконостас</h1>
          <p className="lead">Хранилище продуктовых иконок с поиском, предпросмотром, копированием SVG и скачиванием исходников. Новые иконки добавляются статикой в <code>public/icons</code> и описываются в <code>public/icons.json</code>.</p>
        </div>
        <div className="stats"><strong>{icons.length}</strong><span>иконок в библиотеке</span></div>
      </section>

      <section className="toolbar" id="search-panel">
        <div className="searchbox"><Search size={20}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск по названию, тегу, файлу или node id" autoFocus />{query && <button onClick={() => setQuery('')} aria-label="Очистить"><X size={18}/></button>}</div>
        <div className="scale"><button onClick={() => setScale(s => Math.max(.75, +(s-.25).toFixed(2)))}><Minus size={16}/></button><span>{Math.round(scale*100)}%</span><button onClick={() => setScale(s => Math.min(2, +(s+.25).toFixed(2)))}><Plus size={16}/></button></div>
      </section>

      <p className="result">Показано {filtered.length} из {icons.length}</p>
      <section className="grid" style={{'--scale': scale}}>
        {filtered.map(icon => <article className="card" key={icon.nodeId} onClick={() => setSelected(icon)}>
          <img src={`/icons/${icon.file}`} alt={icon.title} loading="lazy" />
          <h3>{icon.title}</h3><p>{icon.file}</p>
          <div className="actions" onClick={e => e.stopPropagation()}>
            <button onClick={() => copySvg(icon)}>{copied===icon.nodeId ? <Check size={16}/> : <Copy size={16}/>} SVG</button>
            <button onClick={() => download(icon)}><Download size={16}/> Скачать</button>
          </div>
        </article>)}
      </section>
    </main>
    <div className="float-dock"><a className="float-search-trigger" href="#search-panel"><Search size={16}/>Поиск</a><div className="float-scale"><button onClick={() => setScale(s => Math.max(.75, +(s-.25).toFixed(2)))}>-</button><span>{Math.round(scale*100)}%</span><button onClick={() => setScale(s => Math.min(2, +(s+.25).toFixed(2)))}>+</button></div></div>
    {selected && <div className="modal" onClick={() => setSelected(null)}><div className="modal-card" onClick={e=>e.stopPropagation()}><button className="close" onClick={() => setSelected(null)}><X/></button><img src={`/icons/${selected.file}`} alt=""/><h2>{selected.title}</h2><p>{selected.name}</p><code>{selected.nodeId}</code><div className="actions wide"><button onClick={() => copySvg(selected)}><Copy size={16}/> Копировать SVG</button><button onClick={() => download(selected)}><Download size={16}/> Скачать файл</button></div></div></div>}
  </>;
}

createRoot(document.getElementById('root')).render(<App/>);
