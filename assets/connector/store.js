import { demoData, demoUser } from './demo.js';
const demoKey = 'foundersquare.interconnected.demo.v1';
function readDemo() {
  const saved = localStorage.getItem(demoKey);
  if (saved) {
    const data = JSON.parse(saved);
    if (!data.sampleVersion) {
      const seed = demoData();
      // Upgrade an existing demo once. Keep its edits, deletions and custom events.
      if (data.connections.length) {
        for (const id of ['maya-serrin', 'jonah-vale']) {
          if (data.connections.some((person) => person.id === id)) continue;
          const sample = seed.connections.find((person) => person.id === id);
          data.connections.push(sample);
          data.profiles[sample.profile_id] = seed.profiles[sample.profile_id];
          data.memberships.push(
            ...seed.memberships.filter(
              (member) =>
                member.user_id === sample.profile_id &&
                data.events.some((event) => event.id === member.event_id),
            ),
          );
        }
      }
      data.sampleVersion = 2;
      localStorage.setItem(demoKey, JSON.stringify(data));
    }
    return data;
  }
  const data = demoData();
  localStorage.setItem(demoKey, JSON.stringify(data));
  return data;
}
async function result(query) {
  const { data, error } = await query;
  if (error) throw Error(error.message || 'Could not save the change.');
  return data;
}
async function allPages(build) {
  const rows = [];
  for (let start = 0; ; start += 500) {
    const page = await result(build().range(start, start + 499));
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}
export class Workspace {
  constructor(client, user) {
    this.client = client;
    this.user = user;
    this.demo = !user;
    this.uid = user?.id || demoUser;
  }
  change(fn) {
    const data = readDemo();
    fn(data);
    localStorage.setItem(demoKey, JSON.stringify(data));
  }
  async load() {
    if (this.demo) {
      const d = readDemo();
      return {
        connections: d.connections,
        events: d.events,
        members: d.memberships.filter((m) => m.user_id === this.uid),
        profile: d.profiles[this.uid] || {},
        organizer: true,
      };
    }
    const db = this.client;
    const [people, notes, events, members, profile, organizer] = await Promise.all([
      allPages(() => db.from('ic_connections').select('*').order('id')),
      allPages(() => db.from('ic_encounters').select('*').order('id')),
      allPages(() => db.from('ic_events').select('*').order('id')),
      allPages(() => db.from('ic_members').select('*').eq('user_id', this.uid).order('event_id')),
      result(db.from('ic_profiles').select('details').eq('user_id', this.uid).maybeSingle()),
      result(db.from('ic_organizers').select('user_id').eq('user_id', this.uid).maybeSingle()),
    ]);
    const byId = new Map(people.map((p) => [p.id, { ...p, encounters: [] }]));
    notes.forEach((e) => byId.get(e.connection_id)?.encounters.push(e));
    return {
      connections: [...byId.values()],
      events,
      members,
      profile: profile?.details || {},
      organizer: !!organizer,
    };
  }
  capture(person, meeting) {
    if (this.demo)
      return this.change((d) => {
        if (!d.connections.some((c) => c.id === person.id))
          d.connections.unshift({ ...person, encounters: meeting ? [meeting] : [] });
      });
    return result(
      this.client.rpc('ic_capture', {
        person: person.id,
        info: person.details,
        linked: person.profile_id,
        meeting,
      }),
    );
  }
  updatePerson(id, patch) {
    if (this.demo)
      return this.change((d) =>
        Object.assign(
          d.connections.find((c) => c.id === id),
          patch,
        ),
      );
    return result(this.client.from('ic_connections').update(patch).eq('id', id).select('id').single());
  }
  deletePerson(id) {
    if (this.demo)
      return this.change((d) => {
        d.connections = d.connections.filter((c) => c.id !== id);
      });
    return result(this.client.from('ic_connections').delete().eq('id', id));
  }
  deleteAll() {
    if (this.demo)
      return this.change((d) => {
        d.connections = [];
      });
    return result(this.client.from('ic_connections').delete().eq('owner_id', this.uid));
  }
  saveEncounter(id, e) {
    if (this.demo)
      return this.change((d) => {
        const c = d.connections.find((c) => c.id === id);
        c.encounters = c.encounters.filter((m) => m.id !== e.id);
        c.encounters.push(e);
      });
    return result(this.client.from('ic_encounters').upsert({ ...e, connection_id: id }));
  }
  deleteEncounter(id, encId) {
    if (this.demo)
      return this.change((d) => {
        const c = d.connections.find((c) => c.id === id);
        c.encounters = c.encounters.filter((e) => e.id !== encId);
      });
    return result(this.client.from('ic_encounters').delete().eq('connection_id', id).eq('id', encId));
  }
  profile(details) {
    if (this.demo)
      return this.change((d) => {
        d.profiles[this.uid] = details;
      });
    return result(this.client.from('ic_profiles').upsert({ user_id: this.uid, details }));
  }
  async directory(eventId) {
    if (this.demo) {
      const d = readDemo();
      return d.memberships
        .filter((m) => m.event_id === eventId && m.status === 'approved' && m.shared.includes('name'))
        .map((m) => ({
          user_id: m.user_id,
          details: Object.fromEntries(
            m.shared.map((k) => [k, d.profiles[m.user_id]?.[k]]).filter(([, v]) => v),
          ),
        }))
        .filter((p) => p.details.name);
    }
    return allPages(() => this.client.rpc('ic_directory', { target: eventId }).order('user_id'));
  }
  share(eventId, fields) {
    if (this.demo)
      return this.change((d) => {
        d.memberships.find((m) => m.event_id === eventId && m.user_id === this.uid).shared = fields;
      });
    return result(this.client.rpc('ic_share', { target: eventId, fields }));
  }
  async request(eventId) {
    if (this.demo) throw Error('Sign in to request access to a live event.');
    await result(this.client.rpc('ic_request_access', { target: eventId }));
  }
  saveEvent(e, editing) {
    if (this.demo)
      return this.change((d) => {
        if (editing)
          Object.assign(
            d.events.find((x) => x.id === e.id),
            e,
          );
        else {
          d.events.push({ ...e, host_id: this.uid });
          d.memberships.push({
            event_id: e.id,
            user_id: this.uid,
            status: 'approved',
            email: 'demo@example.com',
            shared: [],
          });
        }
      });
    if (editing) {
      const { id, ...changes } = e;
      return result(this.client.from('ic_events').update(changes).eq('id', id).select('id').single());
    }
    return result(this.client.from('ic_events').insert(e));
  }
  async hostData(eventId) {
    if (this.demo) {
      const d = readDemo();
      return {
        requests: d.memberships.filter((m) => m.event_id === eventId),
        rosters: d.rosters.filter((r) => r.event_id === eventId),
      };
    }
    const [requests, rosters] = await Promise.all([
      allPages(() =>
        this.client
          .from('ic_members')
          .select('user_id,email,status')
          .eq('event_id', eventId)
          .order('user_id'),
      ),
      result(this.client.from('ic_rosters').select('*').eq('event_id', eventId)),
    ]);
    return { requests, rosters };
  }
  decide(eventId, attendee, decision) {
    if (this.demo)
      return this.change((d) => {
        const m = d.memberships.find((m) => m.user_id === attendee && m.event_id === eventId);
        m.status = decision;
        if (decision === 'removed') m.shared = [];
      });
    return result(this.client.rpc('ic_set_access', { target: eventId, attendee, decision }));
  }
  importRoster(eventId, source, guests) {
    const record = { event_id: eventId, source, guests, updated_at: new Date().toISOString() };
    if (this.demo)
      return this.change((d) => {
        d.rosters = d.rosters.filter((r) => r.event_id !== eventId || r.source !== source);
        d.rosters.push(record);
      });
    return result(this.client.from('ic_rosters').upsert(record, { onConflict: 'event_id,source' }));
  }
  async refreshLuma(eventId) {
    const {
      data: { session },
    } = await this.client.auth.getSession();
    const response = await fetch('/api/interconnected', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
      body: JSON.stringify({ event_id: eventId }),
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'Refresh failed.');
    return data.count;
  }
  resetDemo() {
    if (this.demo) localStorage.setItem(demoKey, JSON.stringify(demoData()));
  }
}
export async function liveClient() {
  const response = await fetch('/api/interconnected', { cache: 'no-store' });
  if (!response.ok) throw Error('Account service unavailable. Try again shortly.');
  const { config } = await response.json();
  if (!config) return null;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/assets/connector/vendor/supabase.js';
    s.onload = resolve;
    s.onerror = () => reject(Error('Sign-in could not load. Please refresh.'));
    document.head.append(s);
  });
  return window.supabase.createClient(config.url, config.key, {
    auth: { storageKey: 'foundersquare.interconnected.auth' },
  });
}
