import { localDay } from './search.js';
export const demoUser = 'demo-self';
function dateIn(monthOffset, day) {
  const now = new Date();
  return localDay(new Date(now.getFullYear(), now.getMonth() + monthOffset, day));
}
export function demoData() {
  const events = [
    { id: 'demo-build', title: 'Bay Build Night', day: dateIn(-1, 18), place: 'Berkeley' },
    { id: 'demo-dinner', title: 'Founder Dinner', day: dateIn(-1, 8), place: 'Oakland' },
    { id: 'demo-lab', title: 'Open Studio', day: dateIn(0, 1), place: 'San Francisco' },
  ].map((e) => ({ ...e, host_id: 'demo-host', luma_url: '', partiful_url: '', luma_id: '' }));
  const people = [
    [
      'anika',
      'Anika Rao',
      'Fieldwork Robotics',
      'Founder',
      'Robotics, hardware',
      'Looking for a product designer',
      'Robotics, Design',
      'demo-build',
      'Building a gripper for fragile fruit. Wanted a designer for the next prototype.',
      true,
    ],
    [
      'milo',
      'Milo Chen',
      'Common Thread',
      'Product designer',
      'Accessible interfaces',
      'Can help with usability testing',
      'Design',
      'demo-lab',
      'Offered to test the onboarding flow with our team.',
      false,
    ],
    [
      'imani',
      'Imani Brooks',
      'Pulse Atlas',
      'Co-founder',
      'Healthcare, medical devices',
      'Building a portable ultrasound tool',
      'Healthcare',
      'demo-build',
      'Showed me the medical device prototype and asked about clinical pilots.',
      true,
    ],
    [
      'theo',
      'Theo Park',
      'Berkeley',
      'Engineering student',
      'Embedded systems',
      'Can help with firmware',
      'Hardware',
      'demo-dinner',
      'We sketched a low-power sensor on a napkin.',
      false,
    ],
    [
      'sofia',
      'Sofia Reyes',
      'Tidepool Studio',
      'Researcher',
      'Climate, materials',
      'Looking for a materials lab',
      'Climate',
      'demo-lab',
      'Working on packaging made from seaweed.',
      false,
    ],
    [
      'unknown',
      '',
      '',
      'Robotics founder',
      'Robotics',
      '',
      'Robotics',
      'demo-dinner',
      'Robotics founder from dinner. Offered an introduction to a machine shop.',
      true,
    ],
  ];
  people.push(
    [
      'maya-serrin',
      'Maya Serrin',
      'Google',
      'Hiring manager',
      'Early-career engineering',
      'Can share hiring advice',
      'Careers',
      'demo-build',
      'Talked about early-career roles and how hiring teams review project portfolios.',
      false,
    ],
    [
      'jonah-vale',
      'Jonah Vale',
      'Google',
      'Software engineer',
      'Embedded systems',
      'Building developer tools',
      'Hardware',
      'demo-lab',
      'Discussed developer tools after the demos.',
      false,
    ],
  );
  const connections = people.map(
    ([id, name, affiliation, role, interests, looking, tags, eventId, note, follow], index) => {
      const e = events.find((event) => event.id === eventId);
      return {
        id,
        details: { name, affiliation, role, interests, looking, tags },
        profile_id: name ? 'p-' + id : null,
        follow_up: follow,
        created_at: new Date(Date.now() - index * 86400000).toISOString(),
        encounters: [
          {
            id: 'enc-' + id,
            connection_id: id,
            event_id: e.id,
            event_name: e.title,
            place: e.place,
            note,
            met_on: e.day,
            met: true,
          },
        ],
      };
    },
  );
  connections.find((p) => p.id === 'maya-serrin').details.email = 'maya.serrin@example.com';
  connections.find((p) => p.id === 'jonah-vale').details.email = 'jonah.vale@example.com';
  connections[0].encounters.push({
    id: 'enc-anika-2',
    connection_id: 'anika',
    event_id: events[2].id,
    event_name: events[2].title,
    place: events[2].place,
    met_on: events[2].day,
    met: true,
    note: 'Caught up again. The gripper now handles ripe peaches.',
  });
  const profiles = Object.fromEntries(
    connections.filter((c) => c.profile_id).map((c) => [c.profile_id, { ...c.details }]),
  );
  profiles['p-leila'] = {
    name: 'Leila Hart',
    role: 'Founder',
    affiliation: 'Open Bench',
    interests: 'Education',
  };
  profiles[demoUser] = { name: 'Demo attendee', role: 'Builder' };
  const memberships = [];
  for (const event of events) {
    memberships.push({
      event_id: event.id,
      user_id: demoUser,
      status: 'approved',
      email: 'demo@example.com',
      shared: [],
    });
    const attendees = connections
      .filter((c) => c.profile_id && c.encounters.some((e) => e.event_id === event.id))
      .map((c) => c.profile_id);
    for (const id of [...attendees, 'p-leila'])
      memberships.push({
        event_id: event.id,
        user_id: id,
        status: 'approved',
        email: '',
        shared: ['name', 'role', 'affiliation', 'interests'],
      });
  }
  return { sampleVersion: 2, connections, events, profiles, memberships, rosters: [] };
}
