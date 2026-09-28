import { describe, expect, it } from 'vitest';
import {
  extractEmails,
  extractPhones,
  extractWebsites,
  fillEmptyFields,
  parseCard,
  type ParsedCard,
} from '../src/lib/cardParser';

interface Sample {
  name: string;
  text: string;
  expected: Partial<ParsedCard>;
  /** For phone we only assert that each listed number's digits appear. */
  phoneDigits?: string[];
}

const samples: Sample[] = [
  {
    name: 'Indian Pvt Ltd, labelled mobile + landline',
    text: `
SKYFORGE ROBOTICS PVT. LTD.
Rahul Sharma
Director - Business Development
M: +91 98765 43210
T: 011-4567 8901
rahul.sharma@skyforge.in
www.skyforge.in
Plot 42, Sector 18, Gurugram, Haryana 122015
`,
    expected: {
      company: 'SKYFORGE ROBOTICS PVT. LTD.',
      person: 'Rahul Sharma',
      role: 'Director - Business Development',
      email: 'rahul.sharma@skyforge.in',
      website: 'www.skyforge.in',
    },
    phoneDigits: ['919876543210', '01145678901'],
  },
  {
    name: 'Name first, company in the middle, LLP',
    text: `
Priya Nair
Founder & CEO
AeroNautix Drone Systems LLP
+91-9123456780
priya@aeronautix.co.in
https://aeronautix.co.in
`,
    expected: {
      company: 'AeroNautix Drone Systems LLP',
      person: 'Priya Nair',
      role: 'Founder & CEO',
      email: 'priya@aeronautix.co.in',
      website: 'https://aeronautix.co.in',
    },
    phoneDigits: ['919123456780'],
  },
  {
    name: 'Chinese motor supplier with international format',
    text: `
T-MOTOR
Kevin Zhang
Overseas Sales Manager
Tel: +86 791 8833 1234
Mob/WhatsApp: +86 138 0013 8000
kevin@tmotor.com
www.tmotor.com
Nanchang High-tech Zone, Jiangxi, China
`,
    expected: {
      company: 'T-MOTOR',
      person: 'Kevin Zhang',
      role: 'Overseas Sales Manager',
      email: 'kevin@tmotor.com',
      website: 'www.tmotor.com',
    },
    phoneDigits: ['8613800138000', '8679188331234'],
  },
  {
    name: 'Name and title on one line with pipe',
    text: `
Garuda Aerospace
Arjun Mehta | Head of Engineering
arjun.m@garudaaerospace.com
+91 99887 76655
Chennai, Tamil Nadu 600017
`,
    expected: {
      company: 'Garuda Aerospace',
      person: 'Arjun Mehta',
      role: 'Head of Engineering',
      email: 'arjun.m@garudaaerospace.com',
    },
    phoneDigits: ['919988776655'],
  },
  {
    name: 'US company, Inc., parentheses phone, fax ignored',
    text: `
Hawkeye Avionics, Inc.
Dr. Sarah Collins
Chief Technology Officer
Phone (415) 555-0132
Fax (415) 555-0199
sarah.collins@hawkeyeavionics.com
hawkeyeavionics.com
`,
    expected: {
      company: 'Hawkeye Avionics, Inc.',
      person: 'Dr. Sarah Collins',
      role: 'Chief Technology Officer',
      email: 'sarah.collins@hawkeyeavionics.com',
      website: 'hawkeyeavionics.com',
    },
    phoneDigits: ['4155550132'],
  },
  {
    name: 'OCR noise: spaced @ and stray symbols',
    text: `
~ ~
VAYU BATTERIES
Neha Gupta
Sales Executive
neha.gupta @ vayubatteries . com
Mob. 98100 12345
|| ..
`,
    expected: {
      company: 'VAYU BATTERIES',
      person: 'Neha Gupta',
      role: 'Sales Executive',
      email: 'neha.gupta@vayubatteries.com',
    },
    phoneDigits: ['9810012345'],
  },
  {
    name: 'Technologies + two mobiles on one line',
    text: `
Rotorcraft Technologies Pvt Ltd
VIKRAM SINGH
Co-Founder
M: 98111 22233 / 97111 22233
E: vikram@rotorcraft.tech
Web: rotorcraft.tech
`,
    expected: {
      company: 'Rotorcraft Technologies Pvt Ltd',
      person: 'VIKRAM SINGH',
      role: 'Co-Founder',
      email: 'vikram@rotorcraft.tech',
      website: 'rotorcraft.tech',
    },
    phoneDigits: ['9811122233', '9711122233'],
  },
  {
    name: 'Gmail address, company inferred from keyword',
    text: `
Propeller Works
Amit Verma
Proprietor
amitverma.props@gmail.com
0120-4123456
B-12, Industrial Area Phase 2, Noida 201305
`,
    expected: {
      company: 'Propeller Works',
      person: 'Amit Verma',
      role: 'Proprietor',
      email: 'amitverma.props@gmail.com',
    },
    phoneDigits: ['01204123456'],
  },
  {
    name: 'European GmbH with 00 prefix',
    text: `
Flugtechnik GmbH
Markus Weber
Key Account Manager
Tel. 0049 89 1234 5678
m.weber@flugtechnik.de
www.flugtechnik.de
Leopoldstr. 12, 80802 München, Germany
`,
    expected: {
      company: 'Flugtechnik GmbH',
      person: 'Markus Weber',
      role: 'Key Account Manager',
      email: 'm.weber@flugtechnik.de',
      website: 'www.flugtechnik.de',
    },
    phoneDigits: ['00498912345678'],
  },
  {
    name: 'Logo word only, company from email domain',
    text: `
IDEAFORGE
Sandeep Rao
Assistant General Manager - Procurement
sandeep.rao@ideaforge.co.in
+91 22 6789 0000
`,
    expected: {
      company: 'IDEAFORGE',
      person: 'Sandeep Rao',
      role: 'Assistant General Manager - Procurement',
      email: 'sandeep.rao@ideaforge.co.in',
    },
    phoneDigits: ['912267890000'],
  },
  {
    name: 'Dubai company, labels without spaces',
    text: `
Falcon Eye Drones LLC
Omar Al Hashimi
Managing Director
Mobile:+971 50 123 4567
Email:omar@falconeyedrones.ae
www.falconeyedrones.ae
Dubai Silicon Oasis, Dubai, UAE
`,
    expected: {
      company: 'Falcon Eye Drones LLC',
      person: 'Omar Al Hashimi',
      role: 'Managing Director',
      email: 'omar@falconeyedrones.ae',
      website: 'www.falconeyedrones.ae',
    },
    phoneDigits: ['971501234567'],
  },
  {
    name: 'Services firm with comma title and toll-free number',
    text: `
Nimbus UAV Services
Karan Malhotra, Business Development Manager
Toll Free: 1800-123-4567
karan@nimbusuav.com
nimbusuav.com
`,
    expected: {
      company: 'Nimbus UAV Services',
      person: 'Karan Malhotra',
      role: 'Business Development Manager',
      email: 'karan@nimbusuav.com',
      website: 'nimbusuav.com',
    },
    phoneDigits: ['18001234567'],
  },
];

describe('parseCard — realistic cards', () => {
  it.each(samples)('$name', ({ text, expected, phoneDigits }) => {
    const parsed = parseCard(text);
    expect(parsed).toMatchObject(expected);
    for (const d of phoneDigits ?? []) {
      expect(parsed.phone.replace(/\D/g, '')).toContain(d);
    }
  });

  it('uses OCR line heights to pick the company when there are no keywords', () => {
    const parsed = parseCard([
      { text: 'Anika Rao', height: 22 },
      { text: 'Flight Test Engineer', height: 14 },
      { text: 'QUADZILLA', height: 48 },
      { text: 'anika@example.org', height: 12 },
    ]);
    expect(parsed.company).toBe('QUADZILLA');
    expect(parsed.person).toBe('Anika Rao');
    expect(parsed.role).toBe('Flight Test Engineer');
  });

  it('returns empty fields for empty or junk input', () => {
    expect(parseCard('')).toEqual({ company: '', person: '', role: '', phone: '', email: '', website: '' });
    expect(parseCard('~~ .. ||\n--')).toMatchObject({ email: '', phone: '' });
  });
});

describe('extractors', () => {
  it('handles (at) obfuscation', () => {
    expect(extractEmails('info(at)dronecorp.com')).toEqual(['info@dronecorp.com']);
  });

  it('does not treat the email domain as a website', () => {
    expect(extractWebsites('sales@acme-drones.com')).toEqual([]);
  });

  it('ignores PIN codes, years and GST numbers as phones', () => {
    expect(extractPhones(['New Delhi 110020', 'Since 2012-2024', 'GSTIN: 07AABCU9603R1ZM'])).toEqual([]);
  });

  it('skips fax numbers and dedupes the same number', () => {
    const phones = extractPhones(['Fax: 011 2345 6789', 'M +91 98765 43210', 'WhatsApp 9876543210']);
    expect(phones).toEqual(['+91 98765 43210']);
  });
});

describe('fillEmptyFields', () => {
  it('fills only empty fields and reports them', () => {
    const current = { company: 'Mine', person: '', role: '  ', phone: '', email: 'keep@x.com', website: '' };
    const { patch, filled } = fillEmptyFields(current, {
      company: 'Theirs',
      person: 'Jane',
      role: 'CEO',
      email: 'new@x.com',
      website: '',
    });
    expect(patch).toEqual({ person: 'Jane', role: 'CEO' });
    expect(filled).toEqual(['person', 'role']);
  });
});
