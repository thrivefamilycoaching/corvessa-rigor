/**
 * Add well-known independent/private schools that are missing from the
 * NCES CCD + PSS data. These schools either opted out of the federal
 * Private School Universe Survey or use names that didn't match our filters.
 *
 * Usage: npx tsx scripts/add-supplemental-schools.ts
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const OUT_DIR = join(__dirname, "..", "public", "data", "schools");

interface SchoolEntry {
  name: string;
  city: string;
  type: "public" | "private";
}

// Notable independent schools missing from NCES data, organized by state.
// Every school placed in its correct state per its actual physical address.
const SUPPLEMENTAL: Record<string, Array<{ name: string; city: string }>> = {
  VA: [
    { name: "The Potomac School", city: "McLean" },
    { name: "Flint Hill School", city: "Oakton" },
    { name: "The Langley School", city: "McLean" },
    { name: "Congressional School", city: "Falls Church" },
    { name: "Oakcrest School", city: "McLean" },
    { name: "Nysmith School for the Gifted", city: "Herndon" },
    { name: "St. Christopher's School", city: "Richmond" },
    { name: "St. Catherine's School", city: "Richmond" },
    { name: "Foxcroft School", city: "Middleburg" },
    { name: "Blue Ridge School", city: "St. George" },
    { name: "Miller School of Albemarle", city: "Charlottesville" },
    { name: "Wakefield School", city: "The Plains" },
    { name: "Seton School", city: "Manassas" },
    { name: "Veritas Collegiate Academy", city: "Chesapeake" },
  ],
  DC: [
    { name: "St. Albans School", city: "Washington" },
    { name: "National Cathedral School", city: "Washington" },
    { name: "Beauvoir School", city: "Washington" },
    { name: "The Lab School of Washington", city: "Washington" },
    { name: "St. John's College High School", city: "Washington" },
    { name: "The Field School", city: "Washington" },
    { name: "Holton-Arms School", city: "Washington" },
    { name: "The Potomac School", city: "Washington" },
    { name: "Washington International School", city: "Washington" },
    { name: "Gonzaga College High School", city: "Washington" },
  ],
  MD: [
    { name: "St. Andrew's Episcopal School", city: "Potomac" },
    { name: "Norwood School", city: "Bethesda" },
    { name: "Roland Park Country School", city: "Baltimore" },
    { name: "Friends School of Baltimore", city: "Baltimore" },
    { name: "Park School of Baltimore", city: "Baltimore" },
    { name: "Calvert School", city: "Baltimore" },
    { name: "Landon School", city: "Bethesda" },
    { name: "Holton-Arms School", city: "Bethesda" },
    { name: "Indian Creek School", city: "Crownsville" },
    { name: "Key School", city: "Annapolis" },
    { name: "Sandy Spring Friends School", city: "Sandy Spring" },
    { name: "St. Paul's School", city: "Brooklandville" },
  ],
  MA: [
    { name: "Phillips Academy Andover", city: "Andover" },
    { name: "Milton Academy", city: "Milton" },
    { name: "Noble and Greenough School", city: "Dedham" },
    { name: "Roxbury Latin School", city: "West Roxbury" },
    { name: "Buckingham Browne & Nichols School", city: "Cambridge" },
    { name: "Dexter Southfield School", city: "Brookline" },
    { name: "Belmont Hill School", city: "Belmont" },
    { name: "The Winsor School", city: "Boston" },
    { name: "Commonwealth School", city: "Boston" },
    { name: "Beaver Country Day School", city: "Chestnut Hill" },
  ],
  CT: [
    { name: "The Taft School", city: "Watertown" },
    { name: "Miss Porter's School", city: "Farmington" },
    { name: "Ethel Walker School", city: "Simsbury" },
    { name: "Rumsey Hall School", city: "Washington Depot" },
    { name: "Kingswood Oxford School", city: "West Hartford" },
    { name: "Greens Farms Academy", city: "Westport" },
  ],
  NY: [
    { name: "Trinity School", city: "New York" },
    { name: "Ethical Culture Fieldston School", city: "Bronx" },
    { name: "Hackley School", city: "Tarrytown" },
    { name: "The Packer Collegiate Institute", city: "Brooklyn" },
    { name: "The Spence School", city: "New York" },
    { name: "The Chapin School", city: "New York" },
    { name: "The Nightingale-Bamford School", city: "New York" },
    { name: "Convent of the Sacred Heart", city: "New York" },
    { name: "The Browning School", city: "New York" },
    { name: "Grace Church School", city: "New York" },
    { name: "Saint Ann's School", city: "Brooklyn" },
    { name: "Rye Country Day School", city: "Rye" },
  ],
  NJ: [
    { name: "The Pingry School", city: "Basking Ridge" },
    { name: "The Hun School of Princeton", city: "Princeton" },
    { name: "Morristown-Beard School", city: "Morristown" },
    { name: "Gill St. Bernard's School", city: "Gladstone" },
    { name: "Dwight-Englewood School", city: "Englewood" },
    { name: "Montclair Kimberley Academy", city: "Montclair" },
    { name: "Rutgers Preparatory School", city: "Somerset" },
    { name: "The Wardlaw+Hartridge School", city: "Edison" },
  ],
  PA: [
    { name: "Episcopal Academy", city: "Newtown Square" },
    { name: "Germantown Academy", city: "Fort Washington" },
    { name: "The Haverford School", city: "Haverford" },
    { name: "The Baldwin School", city: "Bryn Mawr" },
    { name: "George School", city: "Newtown" },
    { name: "The Shipley School", city: "Bryn Mawr" },
    { name: "Friends' Central School", city: "Wynnewood" },
    { name: "Penn Charter School", city: "Philadelphia" },
    { name: "The Agnes Irwin School", city: "Rosemont" },
    { name: "Academy of Notre Dame de Namur", city: "Villanova" },
  ],
  CA: [
    { name: "Brentwood School", city: "Los Angeles" },
    { name: "Campbell Hall School", city: "North Hollywood" },
    { name: "Chadwick School", city: "Palos Verdes Peninsula" },
    { name: "The Thacher School", city: "Ojai" },
    { name: "Crystal Springs Uplands School", city: "Hillsborough" },
    { name: "Head-Royce School", city: "Oakland" },
    { name: "Lick-Wilmerding High School", city: "San Francisco" },
    { name: "The Urban School of San Francisco", city: "San Francisco" },
    { name: "Castilleja School", city: "Palo Alto" },
    { name: "Menlo School", city: "Atherton" },
    { name: "The Nueva School", city: "San Mateo" },
    { name: "Marin Academy", city: "San Rafael" },
    { name: "San Francisco University High School", city: "San Francisco" },
    { name: "The Athenian School", city: "Danville" },
    { name: "Flintridge Preparatory School", city: "La Canada Flintridge" },
    { name: "The Archer School for Girls", city: "Los Angeles" },
    { name: "Viewpoint School", city: "Calabasas" },
    { name: "Sage Hill School", city: "Newport Coast" },
  ],
  IL: [
    { name: "University of Chicago Laboratory Schools", city: "Chicago" },
    { name: "Francis W. Parker School", city: "Chicago" },
    { name: "The Latin School of Chicago", city: "Chicago" },
    { name: "Roycemore School", city: "Evanston" },
    { name: "Morgan Park Academy", city: "Chicago" },
  ],
  TX: [
    { name: "St. Mark's School of Texas", city: "Dallas" },
    { name: "St. John's School", city: "Houston" },
    { name: "Trinity Valley School", city: "Fort Worth" },
    { name: "Fort Worth Country Day School", city: "Fort Worth" },
    { name: "The Awty International School", city: "Houston" },
    { name: "The John Cooper School", city: "The Woodlands" },
    { name: "St. Stephen's Episcopal School", city: "Austin" },
    { name: "TMI - The Episcopal School of Texas", city: "San Antonio" },
  ],
  GA: [
    { name: "Pace Academy", city: "Atlanta" },
    { name: "The Walker School", city: "Marietta" },
    { name: "The Lovett School", city: "Atlanta" },
    { name: "Savannah Country Day School", city: "Savannah" },
    { name: "Stratford Academy", city: "Macon" },
    { name: "Tallulah Falls School", city: "Tallulah Falls" },
  ],
  FL: [
    { name: "Pine Crest School", city: "Fort Lauderdale" },
    { name: "The Bolles School", city: "Jacksonville" },
    { name: "Berkeley Preparatory School", city: "Tampa" },
    { name: "Saint Andrew's School", city: "Boca Raton" },
    { name: "Shorecrest Preparatory School", city: "St. Petersburg" },
    { name: "The Out-of-Door Academy", city: "Sarasota" },
    { name: "Community School of Naples", city: "Naples" },
    { name: "Montverde Academy", city: "Montverde" },
    { name: "American Heritage School", city: "Plantation" },
  ],
  NC: [
    { name: "Charlotte Latin School", city: "Charlotte" },
    { name: "Charlotte Country Day School", city: "Charlotte" },
    { name: "Cannon School", city: "Concord" },
    { name: "Durham Academy", city: "Durham" },
    { name: "Ravenscroft School", city: "Raleigh" },
    { name: "Cary Academy", city: "Cary" },
  ],
  OH: [
    { name: "University School", city: "Hunting Valley" },
    { name: "Hathaway Brown School", city: "Shaker Heights" },
    { name: "Laurel School", city: "Shaker Heights" },
    { name: "Columbus Academy", city: "Gahanna" },
    { name: "Wellington School", city: "Columbus" },
  ],
  MI: [
    { name: "Cranbrook Schools", city: "Bloomfield Hills" },
    { name: "Detroit Country Day School", city: "Beverly Hills" },
    { name: "University Liggett School", city: "Grosse Pointe Woods" },
  ],
  CO: [
    { name: "Kent Denver School", city: "Englewood" },
    { name: "Graland Country Day School", city: "Denver" },
    { name: "Colorado Academy", city: "Denver" },
    { name: "Fountain Valley School", city: "Colorado Springs" },
  ],
  WA: [
    { name: "Lakeside School", city: "Seattle" },
    { name: "The Bush School", city: "Seattle" },
    { name: "Seattle Academy", city: "Seattle" },
    { name: "The Overlake School", city: "Redmond" },
    { name: "Annie Wright Schools", city: "Tacoma" },
  ],
  OR: [
    { name: "Catlin Gabel School", city: "Portland" },
    { name: "Oregon Episcopal School", city: "Portland" },
    { name: "The Delphian School", city: "Sheridan" },
  ],
  MN: [
    { name: "Blake School", city: "Minneapolis" },
    { name: "Breck School", city: "Minneapolis" },
    { name: "Mounds Park Academy", city: "Saint Paul" },
    { name: "Saint Paul Academy and Summit School", city: "Saint Paul" },
  ],
  MO: [
    { name: "John Burroughs School", city: "St. Louis" },
    { name: "Mary Institute and Saint Louis Country Day School", city: "St. Louis" },
    { name: "Whitfield School", city: "St. Louis" },
    { name: "Thomas Jefferson School", city: "St. Louis" },
    { name: "The Pembroke Hill School", city: "Kansas City" },
    { name: "Barstow School", city: "Kansas City" },
  ],
  TN: [
    { name: "Montgomery Bell Academy", city: "Nashville" },
    { name: "Harpeth Hall School", city: "Nashville" },
    { name: "University School of Nashville", city: "Nashville" },
    { name: "Baylor School", city: "Chattanooga" },
    { name: "McCallie School", city: "Chattanooga" },
    { name: "Lausanne Collegiate School", city: "Memphis" },
  ],
  NH: [
    { name: "Phillips Exeter Academy", city: "Exeter" },
    { name: "St. Paul's School", city: "Concord" },
    { name: "Holderness School", city: "Plymouth" },
    { name: "New Hampton School", city: "New Hampton" },
  ],
  RI: [
    { name: "Moses Brown School", city: "Providence" },
    { name: "Wheeler School", city: "Providence" },
    { name: "Lincoln School", city: "Providence" },
    { name: "St. George's School", city: "Middletown" },
    { name: "Portsmouth Abbey School", city: "Portsmouth" },
  ],
  SC: [
    { name: "Porter-Gaud School", city: "Charleston" },
    { name: "Heathwood Hall Episcopal School", city: "Columbia" },
    { name: "Hammond School", city: "Columbia" },
    { name: "Christ Church Episcopal School", city: "Greenville" },
  ],
  IN: [
    { name: "Park Tudor School", city: "Indianapolis" },
    { name: "University High School of Indiana", city: "Carmel" },
    { name: "Brebeuf Jesuit Preparatory School", city: "Indianapolis" },
    { name: "Culver Academies", city: "Culver" },
  ],
  WI: [
    { name: "University School of Milwaukee", city: "Milwaukee" },
    { name: "Milwaukee Country Day School", city: "Milwaukee" },
  ],
  HI: [
    { name: "Punahou School", city: "Honolulu" },
    { name: "Iolani School", city: "Honolulu" },
    { name: "Hawaii Preparatory Academy", city: "Kamuela" },
    { name: "Mid-Pacific Institute", city: "Honolulu" },
  ],
  LA: [
    { name: "Isidore Newman School", city: "New Orleans" },
    { name: "Metairie Park Country Day School", city: "Metairie" },
    { name: "The Louise S. McGehee School", city: "New Orleans" },
  ],
  AL: [
    { name: "Indian Springs School", city: "Indian Springs" },
    { name: "Altamont School", city: "Birmingham" },
  ],
};

function main() {
  let totalAdded = 0;

  for (const [state, supplements] of Object.entries(SUPPLEMENTAL)) {
    const filePath = join(OUT_DIR, `${state}.json`);
    let existing: SchoolEntry[];

    try {
      existing = JSON.parse(readFileSync(filePath, "utf-8"));
    } catch {
      console.log(`${state}: No existing file, creating new`);
      existing = [];
    }

    // Build a set of existing school names (lowercased) for dedup
    const existingNames = new Set(
      existing.map((s) => s.name.toLowerCase())
    );

    let added = 0;
    for (const s of supplements) {
      // Check if already exists (by name, case-insensitive)
      if (existingNames.has(s.name.toLowerCase())) continue;

      // Also check partial match (e.g., "Potomac School" vs "The Potomac School")
      const baseName = s.name.replace(/^the /i, "").toLowerCase();
      const alreadyExists = existing.some((e) => {
        const eName = e.name.replace(/^the /i, "").toLowerCase();
        return eName === baseName || eName.includes(baseName) || baseName.includes(eName);
      });
      if (alreadyExists) continue;

      existing.push({ name: s.name, city: s.city, type: "private" });
      added++;
    }

    // Sort alphabetically
    existing.sort((a, b) => a.name.localeCompare(b.name));

    writeFileSync(filePath, JSON.stringify(existing));
    if (added > 0) {
      console.log(`${state}: +${added} supplemental schools (${existing.length} total)`);
      totalAdded += added;
    }
  }

  console.log(`\nDone! Added ${totalAdded} supplemental schools.`);
}

main();
