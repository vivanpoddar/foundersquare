import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { forceSimulation, forceLink, forceManyBody, forceCollide, forceX, forceY } from 'd3-force';
import { kinds, graphName, graphEdges, explain } from '../../assets/connector/graph.js';
import { normalize } from '../../assets/connector/search.js';

const colors = { affiliation: '#f49e84', event: '#79afba', interest: '#c5c88e', tag: '#c2acd1' };
const paints = ['#d4e1d4', '#efd7c7', '#dadbea', '#eacac5', '#cbdfe1', '#e6dfbd'];
const PAGE_SIZE = 24;
const initialCamera = { x: 0, y: 0, z: 1 };
function tint(p) {
  return paints[[...p.id].reduce((sum, c) => sum + c.codePointAt(0), 0) % paints.length];
}
function layout(people, edges, width, height) {
  if (!people.length) return [];
  const compact = width < 515;
  const nodes = people.map((person, i) => ({
    id: person.id,
    person,
    x: Math.cos(i * 2.4) * Math.sqrt(i + 1) * 43,
    y: Math.sin(i * 2.4) * Math.sqrt(i + 1) * 43,
  }));
  const links = edges.map((e) => ({
    source: e.source,
    target: e.target,
    company: e.reasons.some((r) => r.kind === 'affiliation'),
  }));
  const sim = forceSimulation(nodes)
    .stop()
    .force(
      'links',
      forceLink(links)
        .id((n) => n.id)
        .distance((l) => (l.company ? 104 : 164))
        .strength((l) => (l.company ? 0.8 : 0.28)),
    )
    .force('charge', forceManyBody().strength(-620))
    .force('spacing', forceCollide(compact ? 43 : 65))
    .force('x', forceX(0).strength(0.045))
    .force('y', forceY(0).strength(0.065));
  sim.tick(190);
  const xs = nodes.map((n) => n.x),
    ys = nodes.map((n) => n.y);
  function project(v, values, span, pad) {
    const min = Math.min(...values),
      max = Math.max(...values);
    const usable = Math.min(span - 2 * pad, Math.max(max - min, span * 0.55));
    return (span - usable) / 2 + (max === min ? 0.5 : (v - min) / (max - min)) * usable;
  }
  for (const n of nodes) {
    n.x = project(n.x, xs, width, compact ? 46 : 82);
    n.y = project(n.y, ys, height, compact ? 54 : 68);
  }
  return nodes;
}
function curve(a, b) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    d = Math.hypot(dx, dy) || 1;
  const bend = Math.min(26, d * 0.075);
  const cx = (a.x + b.x) / 2 - (dy / d) * bend,
    cy = (a.y + b.y) / 2 + (dx / d) * bend;
  return {
    d: 'M ' + a.x + ' ' + a.y + ' Q ' + cx + ' ' + cy + ' ' + b.x + ' ' + b.y,
    x: (a.x + 2 * cx + b.x) / 4,
    y: (a.y + 2 * cy + b.y) / 4,
  };
}
function NetworkMap({ people, onOpen }) {
  const stage = useRef(null),
    svg = useRef(null),
    drag = useRef(null),
    wasDragged = useRef(false);
  const [width, setWidth] = useState(760),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(0);
  const [kind, setKind] = useState('all'),
    [pinned, setPinned] = useState(null),
    [hover, setHover] = useState(null),
    [nodeHover, setNodeHover] = useState(null);
  const [offsets, setOffsets] = useState({}),
    [camera, setCamera] = useState(initialCamera);
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const resize = () => setWidth(Math.max(248, el.clientWidth));
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const matches = useMemo(() => {
    const q = normalize(query.trim());
    return people
      .filter((p) =>
        [
          graphName(p),
          p.details.affiliation,
          p.details.role,
          p.details.interests,
          p.details.tags,
          ...p.encounters.map((e) => e.event_name),
        ].some((v) => normalize(v).includes(q)),
      )
      .sort((a, b) => graphName(a).localeCompare(graphName(b)) || a.id.localeCompare(b.id));
  }, [people, query]);
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE)),
    currentPage = Math.min(page, pages - 1);
  const visible = useMemo(
    () => matches.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE),
    [matches, currentPage],
  );
  const allEdges = useMemo(() => graphEdges(visible), [visible]);
  const edges = useMemo(
    () => allEdges.filter((e) => kind === 'all' || e.reasons.some((r) => r.kind === kind)),
    [allEdges, kind],
  );
  const height = width < 515 ? 434 : Math.max(392, Math.min(510, width * 0.57));
  const compact = width < 515;
  const base = useMemo(() => layout(visible, allEdges, width, height), [visible, allEdges, width, height]);
  const nodes = base.map((n) => ({ ...n, ...offsets[n.id] })),
    lookup = new Map(nodes.map((n) => [n.id, n]));
  const edgeById = new Map(edges.map((e) => [e.id, e]));
  const active = edgeById.get(hover) || edgeById.get(pinned);
  const example = edges.find((e) => e.reasons.some((r) => r.kind === 'affiliation')) || edges[0];
  const inspection = active || example;
  const selectedPeople = inspection
    ? [lookup.get(inspection.source).person, lookup.get(inspection.target).person]
    : [];
  const path = active ? curve(lookup.get(active.source), lookup.get(active.target)) : null;
  function clearView() {
    setHover(null);
    setPinned(null);
    setNodeHover(null);
    setOffsets({});
    setCamera(initialCamera);
  }
  useEffect(() => {
    setOffsets({});
    setCamera(initialCamera);
  }, [width]);
  function point(event) {
    const rect = svg.current.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * width) / rect.width,
      y: ((event.clientY - rect.top) * height) / rect.height,
    };
  }
  function zoom(delta) {
    setCamera((c) => {
      const z = Math.max(0.65, Math.min(2.4, c.z * delta));
      return {
        z,
        x: width / 2 - ((width / 2 - c.x) * z) / c.z,
        y: height / 2 - ((height / 2 - c.y) * z) / c.z,
      };
    });
  }
  function startDrag(event, id) {
    if (event.button !== 0 || drag.current) return;
    const pos = point(event);
    wasDragged.current = false;
    drag.current = { id, pos, camera, node: id ? lookup.get(id) : null, pointer: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event) {
    const start = drag.current;
    if (!start || event.pointerId !== start.pointer) return;
    const p = point(event),
      dx = p.x - start.pos.x,
      dy = p.y - start.pos.y;
    if (!wasDragged.current && Math.hypot(dx, dy) < 5) return;
    wasDragged.current = true;
    setHover(null);
    setNodeHover(null);
    if (start.id)
      setOffsets((os) => ({
        ...os,
        [start.id]: { x: start.node.x + dx / start.camera.z, y: start.node.y + dy / start.camera.z },
      }));
    else setCamera({ ...start.camera, x: start.camera.x + dx, y: start.camera.y + dy });
  }
  const link = (p) => (
    <button type="button" className="network-person-link" onClick={() => onOpen(p.id)}>
      {graphName(p)} ↗
    </button>
  );
  return (
    <section className="network">
      <header className="heading">
        <div>
          <h1>Connection map</h1>
          <p>Explore the people you’ve saved and what they have in common.</p>
        </div>
      </header>
      <div className="network-controls">
        <label className="network-search">
          <svg viewBox="0 0 24 24" className="icon" aria-hidden="true">
            <circle cx="10" cy="10" r="7" />
            <path d="M15 15l6 6" />
          </svg>
          <input
            type="search"
            aria-label="Find people on the map"
            value={query}
            placeholder="Find a person or company…"
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
              clearView();
            }}
          />
        </label>
        <label className="network-filter">
          Link by{' '}
          <select
            aria-label="Link by"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setPinned(null);
              setHover(null);
            }}
          >
            <option value="all">All details</option>
            {Object.entries(kinds).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="network-board" ref={stage}>
        <div className="network-legend">
          {Object.entries(kinds)
            .filter(([k]) => k === kind || kind === 'all')
            .map(([k, v]) => (
              <span key={k}>
                <i style={{ background: colors[k] }} />
                {v}
              </span>
            ))}
        </div>
        <div className="network-stage">
          <svg
            ref={svg}
            viewBox={'0 0 ' + width + ' ' + height}
            width="100%"
            height={height}
            aria-label="Interactive map of saved people and shared details"
            onPointerMove={move}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
              wasDragged.current = true;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setPinned(null);
                setHover(null);
                setNodeHover(null);
              }
            }}
          >
            <rect
              width={width}
              height={height}
              fill="transparent"
              className="network-backdrop"
              onPointerDown={(e) => startDrag(e, null)}
              onClick={() => {
                if (!wasDragged.current) {
                  setPinned(null);
                  setHover(null);
                }
              }}
            />
            <g transform={'translate(' + camera.x + ' ' + camera.y + ') scale(' + camera.z + ')'}>
              {edges.map((edge) => {
                const p = curve(lookup.get(edge.source), lookup.get(edge.target)),
                  attr = kind === 'all' ? edge.reasons[0].kind : kind,
                  selected = active?.id === edge.id;
                const label =
                  graphName(lookup.get(edge.source).person) +
                  ' and ' +
                  graphName(lookup.get(edge.target).person);
                return (
                  <g
                    key={edge.id}
                    className="network-edge"
                    style={{
                      '--line': colors[attr],
                      opacity:
                        (active && !selected) ||
                        (nodeHover && ![edge.source, edge.target].includes(nodeHover))
                          ? 0.38
                          : 1,
                    }}
                  >
                    <path
                      d={p.d}
                      className={'network-line ' + (selected ? 'selected' : '')}
                      strokeDasharray={attr === 'event' ? '6 4' : attr === 'tag' ? '2 4' : undefined}
                    />
                    <path
                      d={p.d}
                      className="network-hit"
                      role="button"
                      tabIndex={0}
                      data-pair={[edge.source, edge.target].sort().join(':')}
                      aria-label={label + '. ' + edge.reasons.map(explain).join(' ')}
                      aria-pressed={pinned === edge.id}
                      onMouseEnter={() => {
                        if (!drag.current) setHover(edge.id);
                      }}
                      onMouseLeave={() => setHover(null)}
                      onFocus={() => setHover(edge.id)}
                      onBlur={() => setHover(null)}
                      onClick={() => setPinned((old) => (old === edge.id ? null : edge.id))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setPinned(edge.id);
                        }
                      }}
                    />
                  </g>
                );
              })}
              {nodes.map((n) => {
                const person = n.person,
                  name = graphName(person),
                  parts = name.split(/\s+/),
                  initials = person.details.name
                    ? parts
                        .slice(0, 2)
                        .map((v) => [...v][0])
                        .join('')
                    : '?';
                const dim = active && n.id !== active.source && n.id !== active.target;
                return (
                  <g
                    className="network-node"
                    key={n.id}
                    transform={'translate(' + n.x + ' ' + n.y + ')'}
                    opacity={dim ? 0.5 : 1}
                    role="link"
                    tabIndex={0}
                    aria-label={'Open ' + name}
                    onFocus={() => setNodeHover(n.id)}
                    onBlur={() => setNodeHover(null)}
                    onMouseEnter={() => {
                      if (!drag.current) setNodeHover(n.id);
                    }}
                    onMouseLeave={() => setNodeHover(null)}
                    onPointerDown={(e) => startDrag(e, n.id)}
                    onClick={() => {
                      if (!wasDragged.current) onOpen(n.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        onOpen(n.id);
                      }
                    }}
                  >
                    <title>
                      {name}
                      {person.details.affiliation ? ' · ' + person.details.affiliation : ''}
                    </title>
                    <rect
                      x={compact ? -32 : -59}
                      y={compact ? -20 : -24}
                      width={compact ? 64 : 118}
                      height={compact ? 60 : 86}
                      rx="12"
                      fill="transparent"
                    />
                    <circle className="node-ring" r={compact ? 20 : 24} />
                    <circle r={compact ? 16 : 20} fill={tint(person)} />
                    <text className="node-initials" dy=".34em" textAnchor="middle">
                      {initials}
                    </text>
                    <text className="node-label" textAnchor="middle" y={compact ? 34 : 41}>
                      {(compact ? parts[0] : name).slice(0, 23)}
                    </text>
                    {!compact && person.details.affiliation && (
                      <text className="node-company" textAnchor="middle" y="56">
                        {person.details.affiliation.slice(0, 24)}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
          {active && path && (
            <div
              className="network-tooltip"
              role="tooltip"
              style={{
                left: Math.max(
                  Math.min(width / 2, 104),
                  Math.min(width - Math.min(width / 2, 104), path.x * camera.z + camera.x),
                ),
                top: Math.max(22, Math.min(height - 24, path.y * camera.z + camera.y - 10)),
              }}
            >
              {active.reasons
                .filter((r) => kind === 'all' || r.kind === kind)
                .map((r) => (
                  <span key={r.kind + r.value}>
                    {kinds[r.kind]} · {r.value}
                  </span>
                ))}
            </div>
          )}
          {!visible.length && (
            <div className="network-empty">
              {people.length
                ? 'No matching people. Try a different search.'
                : 'Save someone to start your map.'}
            </div>
          )}
        </div>
        <div className="network-foot">
          <span>
            {visible.length} {visible.length === 1 ? 'person' : 'people'} · {edges.length}{' '}
            {edges.length === 1 ? 'link' : 'links'}
          </span>
          <div className="network-zoom">
            <button type="button" aria-label="Zoom out" onClick={() => zoom(1 / 1.24)}>
              −
            </button>
            <button type="button" aria-label="Reset map view" onClick={clearView}>
              Reset view
            </button>
            <button type="button" aria-label="Zoom in" onClick={() => zoom(1.24)}>
              +
            </button>
          </div>
        </div>
      </div>
      {pages > 1 && (
        <div className="network-pager">
          <button
            disabled={currentPage === 0}
            onClick={() => {
              setPage(currentPage - 1);
              clearView();
            }}
          >
            Previous
          </button>
          <span>
            People {1 + currentPage * PAGE_SIZE}–{currentPage * PAGE_SIZE + visible.length} of{' '}
            {matches.length}
          </span>
          <button
            disabled={currentPage + 1 >= pages}
            onClick={() => {
              setPage(currentPage + 1);
              clearView();
            }}
          >
            Next
          </button>
        </div>
      )}
      <p className="network-guide">
        Open a person for their email draft. Hover, tap, or focus a line to see why it’s there.
      </p>
      {inspection ? (
        <section className="network-evidence" aria-label="Link details">
          <div>
            <h2>Shared details</h2>
            <div className="network-pair">
              {link(selectedPeople[0])}
              <span> &amp; </span>
              {link(selectedPeople[1])}
            </div>
          </div>
          <ul>
            {inspection.reasons.map((r) => (
              <li key={r.kind + r.value}>
                <i style={{ background: colors[r.kind] }} />
                {explain(r)}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        visible.length > 0 && (
          <p className="network-evidence">
            These saved people have no matching {kind === 'all' ? 'details' : kinds[kind].toLowerCase()} on
            this view.
          </p>
        )
      )}
    </section>
  );
}
export function mountMap(element, people, onOpen) {
  const root = createRoot(element);
  const update = (data) => root.render(<NetworkMap people={data} onOpen={onOpen} />);
  update(people);
  return { update, unmount: () => root.unmount() };
}
