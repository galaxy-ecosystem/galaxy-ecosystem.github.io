import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bibtexParse from 'bibtex-parse-js';
import slugify from 'slugify';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BIB_FILE = path.join(process.cwd(), 'citations.bib');
const PUBLICATIONS_DIR = path.join(process.cwd(), 'src', 'content', 'publications');

if (!fs.existsSync(PUBLICATIONS_DIR)) {
  fs.mkdirSync(PUBLICATIONS_DIR, { recursive: true });
}

// ADS/AASTeX journal macro → proper abbreviation
const JOURNAL_MACROS = {
  '\\apj': 'ApJ',
  '\\apjl': 'ApJL',
  '\\apjs': 'ApJS',
  '\\aap': 'A&A',
  '\\aapr': 'A&AR',
  '\\aj': 'AJ',
  '\\mnras': 'MNRAS',
  '\\mnrasl': 'MNRASL',
  '\\pasp': 'PASP',
  '\\araa': 'ARA&A',
  '\\nat': 'Nature',
  '\\science': 'Science',
  '\\apss': 'Ap&SS',
  '\\pnas': 'PNAS',
  '\\prd': 'PRD',
  '\\prl': 'PRL',
  '\\physrep': 'Phys. Rep.',
  '\\actaa': 'Acta Astron.',
  '\\baas': 'BAAS',
  '\\aaps': 'A&AS',
  '\\newa': 'New Astron.',
  '\\newar': 'New Astron. Rev.',
  '\\astroptcs': 'Astropart. Phys.',
  '\\jcap': 'JCAP',
  '\\cqg': 'Class. Quantum Grav.',
  '\\nar': 'New Astron. Rev.',
  '\\solphys': 'Sol. Phys.',
  '\\icarus': 'Icarus',
  '\\spie': 'Proc. SPIE',
};

function cleanString(str) {
  if (!str) return '';
  return str.replace(/[{}]/g, '')
    .replace(/\\&lt;/g, '<')
    .replace(/\\&gt;/g, '>')
    .replace(/\\&amp;/g, '&')
    .replace(/\\&nbsp;/g, ' ')
    .replace(/\\&quot;/g, '"')
    .replace(/\\&apos;/g, "'")
    .trim();
}

function yamlEscape(str) {
  if (!str) return '';
  return str.replace(/\\/g, '\\\\');
}

function expandJournalMacro(journal) {
  if (!journal) return '';
  let cleaned = cleanString(journal);
  for (const [macro, expanded] of Object.entries(JOURNAL_MACROS)) {
    if (cleaned === macro) return expanded;
  }
  return cleaned;
}

function parseAuthors(authorStr) {
  if (!authorStr) return [];
  return authorStr.split(' and ').map(name => {
    const cleanName = cleanString(name);
    if (cleanName.includes(',')) {
      const parts = cleanName.split(',').map(p => p.trim());
      return `${parts[1]} ${parts[0]}`;
    }
    return cleanName;
  });
}

function importBibtex() {
  if (!fs.existsSync(BIB_FILE)) {
    console.error(`Error: BibTeX file not found at ${BIB_FILE}`);
    console.log('Please place your "citations.bib" file in the project root.');
    process.exit(1);
  }

  const bibContent = fs.readFileSync(BIB_FILE, 'utf-8');
  const parsed = bibtexParse.toJSON(bibContent);

  console.log(`Found ${parsed.length} entries. Processing...`);

  let count = 0;
  parsed.forEach(entry => {
    const tags = entry.entryTags;

    if (!tags.title || !tags.year) {
      console.warn(`Skipping entry ${entry.citationKey}: Missing title or year.`);
      return;
    }

    const type = 'paper';

    const title = cleanString(tags.title);
    const year = parseInt(tags.year, 10);
    const authors = parseAuthors(tags.author);
    const venue = expandJournalMacro(tags.booktitle || tags.journal || tags.school || tags.publisher || tags.howpublished || tags.organization || tags.institution || 'Unknown Venue');
    const description = cleanString(tags.abstract || `Published in ${venue}.`);

    let cover = cleanString(tags.cover || tags.image || tags.figure || '');
    const DEFAULT_COVER = '../../assets/paper-vision.jpg';

    if (cover) {
      const relativeToRoot = cover.replace('../../', 'src/');
      const absolutePath = path.join(process.cwd(), relativeToRoot);
      if (!fs.existsSync(absolutePath)) {
        console.warn(`Warning: Cover image not found at ${absolutePath}. Using default.`);
        cover = DEFAULT_COVER;
      }
    } else {
      cover = DEFAULT_COVER;
    }

    let pdf = cleanString(tags.pdf || tags.file || tags.url || tags.adsurl || '');
    if (pdf.startsWith(':')) {
      const parts = pdf.split(':');
      if (parts.length >= 2 && parts[1].trim() !== '') {
        pdf = parts[1];
      }
    }

    const code = cleanString(tags.code || tags.code_url || tags.github || tags.repository || '');
    const website = cleanString(tags.website || tags.webpage || tags.project || '');
    const slides = cleanString(tags.slides || tags.presentation || tags.ppt || '');
    const video = cleanString(tags.video || tags.recording || '');
    const demo = cleanString(tags.demo || '');

    const badges = [];
    const award = cleanString(tags.award || tags.honor || '');
    if (award) {
      badges.push({ text: award, type: 'gold' });
    }

    const doi = cleanString(tags.doi || '');
    const note = cleanString(tags.note || tags.keywords || '');

    if (note.toLowerCase().includes('best paper') && !award.toLowerCase().includes('best paper')) {
       badges.push({ text: 'Best Paper', type: 'gold' });
    }
    if (note.toLowerCase().includes('oral')) {
       badges.push({ text: 'Oral', type: 'blue' });
    }
    if (note.toLowerCase().includes('spotlight')) {
       badges.push({ text: 'Spotlight', type: 'red' });
    }
    if (note.toLowerCase().includes('best student paper')) {
      badges.push({ text: 'Best Student Paper', type: 'gold' });
    }

    const firstAuthor = authors.length > 0 ? authors[0].split(' ').pop() : 'unknown';
    const titleSlug = slugify(title, { lower: true, strict: true }).slice(0, 30);
    const filename = `${year}-${firstAuthor}-${titleSlug}.md`;
    const filePath = path.join(PUBLICATIONS_DIR, filename);

    let isFeatured = false;
    if (tags.featured === 'true' || note.toLowerCase().includes('featured') || note.toLowerCase().includes('selected')) {
      isFeatured = true;
    }
    if (fs.existsSync(filePath)) {
      try {
        const existingContent = fs.readFileSync(filePath, 'utf-8');
        if (/featured:\s*true/.test(existingContent)) {
          isFeatured = true;
        }
      } catch (e) {
        console.warn(`Warning: Could not read existing file ${filePath}`);
      }
    }

    const frontmatter = [
      '---',
      `title: "${yamlEscape(title).replace(/"/g, '\\"')}"`,
      `authors: [${authors.map(a => `"${a}"`).join(', ')}]`,
      `year: ${year}`,
      `venue: "${yamlEscape(venue).replace(/"/g, '\\"')}"`,
      `type: "${type}"`,
      `cover: "${cover}"`,
      'links:',
      `  pdf: "${pdf}"`,
      `  code: "${code}"`,
      `  website: "${website}"`,
      `  demo: "${demo}"`,
      `  slides: "${slides}"`,
      `  video: "${video}"`,
      doi ? `doi: "${doi}"` : '',
      award ? `award: "${award.replace(/"/g, '\\"')}"` : '',
      badges.length > 0 ? 'badges:' : '',
      ...badges.map(b => `  - { text: "${b.text}", type: "${b.type}" }`),
      `description: "${description.replace(/"/g, '\\"')}"`,
      `featured: ${isFeatured}`,
      '---',
      '',
      description
    ].filter(line => line !== '').join('\n');

    fs.writeFileSync(filePath, frontmatter);
    console.log(`Generated: ${filename}`);
    count++;
  });

  console.log(`\nSuccessfully imported ${count} entries.`);
}

importBibtex();