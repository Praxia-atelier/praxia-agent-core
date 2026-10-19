/**
 * Fictional emails. Names, companies and addresses are invented; domains use
 * the reserved `.example` TLD.
 */
export interface IncomingEmail {
  from: string;
  subject: string;
  body: string;
}

export const sampleEmails: IncomingEmail[] = [
  {
    from: 'billing@quillbarrow.example',
    subject: 'Invoice PL-2048 for October stationery',
    body: [
      'Hello,',
      'Please find our invoice PL-2048 for the stationery delivered on 3 October.',
      'Supplier: Quillbarrow Paper Co.',
      'Total due: 186.40 EUR',
      'Due date: 2026-11-15',
      'Kind regards, Quillbarrow billing team',
    ].join('\n'),
  },
  {
    from: 'r.okafor@tinkerwren.example',
    subject: 'Request for a quote: team offsite',
    body: [
      'Hi there,',
      'Could you send us a quote for a one-day team offsite for about 30 people in March?',
      'We need a meeting room, lunch and a projector.',
      'Thanks, Rosa Okafor, Tinkerwren Robotics',
    ].join('\n'),
  },
  {
    from: 'sam@mossgate.example',
    subject: 'Thanks for yesterday',
    body: 'Just wanted to say thanks for the call yesterday. Talk soon! Sam',
  },
];
