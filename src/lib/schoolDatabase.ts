// ── School Database — 300+ real U.S. four-year colleges ────────────────────
// Raw fixed data only. "type" (reach/match/safety) is calculated per student.

export interface SchoolRecord {
  name: string;
  url: string;
  state: string;
  region: string;
  campusSize: string;
  enrollment: number;
  admitRate: number;
  testPolicy: string;
}

const STATE_TO_REGION: Record<string, string> = {
  MA: "Northeast", CT: "Northeast", NY: "Northeast", RI: "Northeast",
  ME: "Northeast", VT: "Northeast", NH: "Northeast",
  VA: "Mid-Atlantic", DC: "Mid-Atlantic", MD: "Mid-Atlantic", PA: "Mid-Atlantic",
  DE: "Mid-Atlantic", NJ: "Mid-Atlantic", WV: "Mid-Atlantic",
  TX: "South", GA: "South", NC: "South", FL: "South", TN: "South",
  SC: "South", AL: "South", LA: "South", AR: "South", MS: "South", KY: "South",
  IL: "Midwest", MI: "Midwest", OH: "Midwest", WI: "Midwest", MN: "Midwest",
  IN: "Midwest", IA: "Midwest", MO: "Midwest", KS: "Midwest", NE: "Midwest",
  ND: "Midwest", SD: "Midwest",
  CA: "West", OR: "West", WA: "West", CO: "West", AZ: "West", UT: "West",
  NV: "West", NM: "West", MT: "West", WY: "West", ID: "West", HI: "West", AK: "West",
};

function getRegion(state: string): string {
  return STATE_TO_REGION[state] || "Other";
}

function getCampusSize(enrollment: number): string {
  if (enrollment < 2000) return "Micro";
  if (enrollment < 5000) return "Small";
  if (enrollment < 15000) return "Medium";
  if (enrollment < 30000) return "Large";
  return "Mega";
}

// Compact raw format: [name, url, state, enrollment, admitRate, testPolicy]
type R = [string, string, string, number, number, string];

const RAW: R[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // MICRO (<2,000 undergrads)
  // ═══════════════════════════════════════════════════════════════════════════

  // Northeast — Micro
  ["Amherst College", "amherst.edu", "MA", 1900, 0.09, "Test Optional"],
  ["Bates College", "bates.edu", "ME", 1800, 0.14, "Test Optional"],
  ["Bowdoin College", "bowdoin.edu", "ME", 1900, 0.09, "Test Optional"],
  ["Colby College", "colby.edu", "ME", 1950, 0.07, "Test Optional"],
  ["Hampshire College", "hampshire.edu", "MA", 1300, 0.80, "Test Optional"],
  ["Sarah Lawrence College", "sarahlawrence.edu", "NY", 1400, 0.55, "Test Optional"],
  ["Bennington College", "bennington.edu", "VT", 800, 0.58, "Test Optional"],
  ["Wheaton College Massachusetts", "wheatoncollege.edu", "MA", 1800, 0.72, "Test Optional"],
  ["Simon's Rock", "simons-rock.edu", "MA", 400, 0.85, "Test Optional"],

  // Mid-Atlantic — Micro
  ["Swarthmore College", "swarthmore.edu", "PA", 1600, 0.07, "Test Optional"],
  ["Haverford College", "haverford.edu", "PA", 1400, 0.13, "Test Optional"],
  ["Bryn Mawr College", "brynmawr.edu", "PA", 1400, 0.32, "Test Optional"],
  ["Dickinson College", "dickinson.edu", "PA", 1900, 0.39, "Test Optional"],
  ["Gettysburg College", "gettysburg.edu", "PA", 1900, 0.45, "Test Optional"],
  ["Muhlenberg College", "muhlenberg.edu", "PA", 1800, 0.48, "Test Optional"],
  ["Allegheny College", "allegheny.edu", "PA", 1600, 0.74, "Test Optional"],
  ["Ursinus College", "ursinus.edu", "PA", 1200, 0.78, "Test Optional"],
  ["Washington College", "washcoll.edu", "MD", 1100, 0.72, "Test Optional"],
  ["Randolph-Macon College", "rmc.edu", "VA", 1500, 0.80, "Test Optional"],
  ["Roanoke College", "roanoke.edu", "VA", 1800, 0.82, "Test Optional"],
  ["Hampden-Sydney College", "hsc.edu", "VA", 1000, 0.85, "Test Optional"],
  ["Hollins University", "hollins.edu", "VA", 600, 0.88, "Test Optional"],
  ["Sweet Briar College", "sbc.edu", "VA", 400, 0.90, "Test Optional"],
  ["Bridgewater College", "bridgewater.edu", "VA", 1500, 0.85, "Test Optional"],
  ["St. John's College", "sjc.edu", "MD", 450, 0.72, "Test Optional"],
  ["Juniata College", "juniata.edu", "PA", 1300, 0.72, "Test Optional"],
  ["Goucher College", "goucher.edu", "MD", 1100, 0.80, "Test Optional"],
  ["McDaniel College", "mcdaniel.edu", "MD", 1600, 0.78, "Test Optional"],
  ["Lycoming College", "lycoming.edu", "PA", 1100, 0.82, "Test Optional"],

  // South — Micro
  ["Davidson College", "davidson.edu", "NC", 1900, 0.17, "Test Optional"],
  ["Sewanee University of the South", "sewanee.edu", "TN", 1700, 0.55, "Test Optional"],
  ["Wofford College", "wofford.edu", "SC", 1800, 0.58, "Test Optional"],
  ["Centre College", "centre.edu", "KY", 1500, 0.59, "Test Optional"],
  ["Hendrix College", "hendrix.edu", "AR", 1100, 0.65, "Test Optional"],
  ["Eckerd College", "eckerd.edu", "FL", 1800, 0.72, "Test Optional"],
  ["Agnes Scott College", "agnesscott.edu", "GA", 1000, 0.78, "Test Optional"],
  ["Guilford College", "guilford.edu", "NC", 1200, 0.80, "Test Optional"],
  ["Millsaps College", "millsaps.edu", "MS", 800, 0.60, "Test Optional"],
  ["Austin College", "austincollege.edu", "TX", 1300, 0.55, "Test Optional"],
  ["Oglethorpe University", "oglethorpe.edu", "GA", 1400, 0.78, "Test Optional"],
  ["Birmingham-Southern College", "bsc.edu", "AL", 1100, 0.65, "Test Optional"],
  ["Berry College", "berry.edu", "GA", 1900, 0.62, "Test Optional"],
  ["Transylvania University", "transy.edu", "KY", 1000, 0.72, "Test Optional"],
  ["Southwestern University", "southwestern.edu", "TX", 1500, 0.48, "Test Optional"],
  ["Flagler College", "flagler.edu", "FL", 1900, 0.65, "Test Optional"],

  // Midwest — Micro
  ["Carleton College", "carleton.edu", "MN", 1900, 0.16, "Test Optional"],
  ["Grinnell College", "grinnell.edu", "IA", 1700, 0.13, "Test Optional"],
  ["Kenyon College", "kenyon.edu", "OH", 1700, 0.36, "Test Optional"],
  ["Macalester College", "macalester.edu", "MN", 1900, 0.28, "Test Optional"],
  ["Denison University", "denison.edu", "OH", 1900, 0.31, "Test Optional"],
  ["St. Olaf College", "stolaf.edu", "MN", 1800, 0.52, "Test Optional"],
  ["DePauw University", "depauw.edu", "IN", 1800, 0.63, "Test Optional"],
  ["Lake Forest College", "lakeforest.edu", "IL", 1600, 0.62, "Test Optional"],
  ["Kalamazoo College", "kzoo.edu", "MI", 1500, 0.72, "Test Optional"],
  ["Wabash College", "wabash.edu", "IN", 800, 0.72, "Test Optional"],
  ["Knox College", "knox.edu", "IL", 1200, 0.72, "Test Optional"],
  ["Beloit College", "beloit.edu", "WI", 1100, 0.70, "Test Optional"],
  ["Cornell College", "cornellcollege.edu", "IA", 1000, 0.72, "Test Optional"],
  ["Earlham College", "earlham.edu", "IN", 800, 0.65, "Test Optional"],
  ["Ripon College", "ripon.edu", "WI", 700, 0.78, "Test Optional"],
  ["Alma College", "alma.edu", "MI", 1400, 0.72, "Test Optional"],
  ["Albion College", "albion.edu", "MI", 1300, 0.78, "Test Optional"],
  ["Hillsdale College", "hillsdale.edu", "MI", 1500, 0.35, "Test Required"],
  ["Lawrence University", "lawrence.edu", "WI", 1500, 0.62, "Test Optional"],
  ["Oberlin College", "oberlin.edu", "OH", 1900, 0.30, "Test Optional"],
  ["Wooster College", "wooster.edu", "OH", 1900, 0.60, "Test Optional"],

  // West — Micro
  ["Pomona College", "pomona.edu", "CA", 1600, 0.07, "Test Optional"],
  ["Claremont McKenna College", "cmc.edu", "CA", 1400, 0.09, "Test Optional"],
  ["Harvey Mudd College", "hmc.edu", "CA", 900, 0.13, "Test Optional"],
  ["Pitzer College", "pitzer.edu", "CA", 1100, 0.15, "Test Optional"],
  ["Reed College", "reed.edu", "OR", 1500, 0.41, "Test Optional"],
  ["Whitman College", "whitman.edu", "WA", 1500, 0.51, "Test Optional"],
  ["Lewis & Clark College", "lclark.edu", "OR", 1900, 0.78, "Test Optional"],
  ["Willamette University", "willamette.edu", "OR", 1800, 0.82, "Test Optional"],
  ["University of Puget Sound", "pugetsound.edu", "WA", 1900, 0.78, "Test Optional"],
  ["Mills College", "mills.edu", "CA", 800, 0.85, "Test Optional"],
  ["Linfield University", "linfield.edu", "OR", 1500, 0.85, "Test Optional"],
  ["Pacific University", "pacificu.edu", "OR", 1700, 0.80, "Test Optional"],

  // ═══════════════════════════════════════════════════════════════════════════
  // SMALL (2,000–4,999 undergrads)
  // ═══════════════════════════════════════════════════════════════════════════

  // Northeast — Small
  ["Williams College", "williams.edu", "MA", 2100, 0.10, "Test Optional"],
  ["Middlebury College", "middlebury.edu", "VT", 2800, 0.16, "Test Optional"],
  ["Colgate University", "colgate.edu", "NY", 3200, 0.13, "Test Optional"],
  ["Hamilton College", "hamilton.edu", "NY", 2000, 0.12, "Test Optional"],
  ["Barnard College", "barnard.edu", "NY", 2600, 0.09, "Test Optional"],
  ["Wellesley College", "wellesley.edu", "MA", 2400, 0.13, "Test Optional"],
  ["Vassar College", "vassar.edu", "NY", 2500, 0.20, "Test Optional"],
  ["Connecticut College", "conncoll.edu", "CT", 2000, 0.38, "Test Optional"],
  ["Trinity College", "trincoll.edu", "CT", 2200, 0.33, "Test Optional"],
  ["Skidmore College", "skidmore.edu", "NY", 2700, 0.42, "Test Optional"],
  ["St. Lawrence University", "stlawu.edu", "NY", 2400, 0.49, "Test Optional"],
  ["Union College", "union.edu", "NY", 2200, 0.38, "Test Optional"],
  ["Hobart and William Smith", "hws.edu", "NY", 2000, 0.60, "Test Optional"],
  ["Stonehill College", "stonehill.edu", "MA", 2500, 0.72, "Test Optional"],
  ["Ithaca College", "ithaca.edu", "NY", 4500, 0.70, "Test Optional"],
  ["Siena College", "siena.edu", "NY", 3200, 0.75, "Test Optional"],

  // Mid-Atlantic — Small
  ["Bucknell University", "bucknell.edu", "PA", 3800, 0.32, "Test Optional"],
  ["Lafayette College", "lafayette.edu", "PA", 2700, 0.38, "Test Optional"],
  ["Washington and Lee University", "wlu.edu", "VA", 2300, 0.17, "Test Optional"],
  ["University of Richmond", "richmond.edu", "VA", 3500, 0.25, "Test Optional"],
  ["Franklin & Marshall College", "fandm.edu", "PA", 2300, 0.30, "Test Optional"],
  ["Susquehanna University", "susqu.edu", "PA", 2100, 0.72, "Test Optional"],
  ["Elizabethtown College", "etown.edu", "PA", 2000, 0.80, "Test Optional"],
  ["York College of Pennsylvania", "ycp.edu", "PA", 3500, 0.85, "Test Optional"],
  ["Randolph College", "randolphcollege.edu", "VA", 2000, 0.82, "Test Optional"],
  ["Christopher Newport University", "cnu.edu", "VA", 4500, 0.73, "Test Optional"],

  // South — Small
  ["Furman University", "furman.edu", "SC", 2800, 0.62, "Test Optional"],
  ["Rhodes College", "rhodes.edu", "TN", 2000, 0.52, "Test Optional"],
  ["College of Charleston", "cofc.edu", "SC", 4800, 0.75, "Test Optional"],
  ["Rollins College", "rollins.edu", "FL", 3200, 0.55, "Test Optional"],
  ["Trinity University", "trinity.edu", "TX", 2400, 0.38, "Test Optional"],
  ["University of the South", "sewanee.edu", "TN", 2000, 0.55, "Test Optional"],
  ["Stetson University", "stetson.edu", "FL", 3200, 0.68, "Test Optional"],
  ["Samford University", "samford.edu", "AL", 3600, 0.82, "Test Optional"],
  ["Mercer University", "mercer.edu", "GA", 3500, 0.78, "Test Optional"],
  ["Presbyterian College", "presby.edu", "SC", 2000, 0.82, "Test Optional"],
  ["Hanover College", "hanover.edu", "IN", 2000, 0.82, "Test Optional"],

  // Midwest — Small
  ["Colorado College", "coloradocollege.edu", "CO", 2200, 0.13, "Test Optional"],
  ["College of Wooster", "wooster.edu", "OH", 2000, 0.60, "Test Optional"],
  ["Wheaton College Illinois", "wheaton.edu", "IL", 2400, 0.80, "Test Optional"],
  ["Luther College", "luther.edu", "IA", 2000, 0.78, "Test Optional"],
  ["Hope College", "hope.edu", "MI", 3000, 0.78, "Test Optional"],
  ["Wittenberg University", "wittenberg.edu", "OH", 2000, 0.85, "Test Optional"],
  ["Ohio Wesleyan University", "owu.edu", "OH", 2000, 0.72, "Test Optional"],
  ["Augustana College", "augustana.edu", "IL", 2500, 0.62, "Test Optional"],
  ["Gustavus Adolphus College", "gustavus.edu", "MN", 2200, 0.72, "Test Optional"],
  ["College of Saint Benedict", "csbsju.edu", "MN", 3500, 0.78, "Test Optional"],

  // West — Small
  ["Occidental College", "oxy.edu", "CA", 2000, 0.37, "Test Optional"],
  ["Scripps College", "scrippscollege.edu", "CA", 2000, 0.28, "Test Optional"],
  ["Whitworth University", "whitworth.edu", "WA", 2300, 0.80, "Test Optional"],
  ["University of Redlands", "redlands.edu", "CA", 2800, 0.72, "Test Optional"],
  ["Gonzaga University", "gonzaga.edu", "WA", 4900, 0.62, "Test Optional"],
  ["Carroll College", "carroll.edu", "MT", 2000, 0.82, "Test Optional"],
  ["Westmont College", "westmont.edu", "CA", 2000, 0.72, "Test Optional"],
  ["Pacific Lutheran University", "plu.edu", "WA", 2800, 0.80, "Test Optional"],

  // ═══════════════════════════════════════════════════════════════════════════
  // MEDIUM (5,000–14,999 undergrads)
  // ═══════════════════════════════════════════════════════════════════════════

  // Northeast — Medium
  ["Tufts University", "tufts.edu", "MA", 6700, 0.10, "Test Optional"],
  ["Boston College", "bc.edu", "MA", 10000, 0.16, "Test Optional"],
  ["Northeastern University", "northeastern.edu", "MA", 14000, 0.07, "Test Optional"],
  ["Yale University", "yale.edu", "CT", 6500, 0.05, "Test Required"],
  ["Brown University", "brown.edu", "RI", 7200, 0.05, "Test Required"],
  ["Dartmouth College", "dartmouth.edu", "NH", 4500, 0.06, "Test Required"],
  ["MIT", "mit.edu", "MA", 4600, 0.04, "Test Required"],
  ["Providence College", "providence.edu", "RI", 4900, 0.55, "Test Optional"],
  ["Quinnipiac University", "quinnipiac.edu", "CT", 7200, 0.72, "Test Optional"],
  ["Marist College", "marist.edu", "NY", 5500, 0.68, "Test Optional"],
  ["Fairfield University", "fairfield.edu", "CT", 5200, 0.60, "Test Optional"],
  ["College of the Holy Cross", "holycross.edu", "MA", 3100, 0.32, "Test Optional"],
  ["Suffolk University", "suffolk.edu", "MA", 5500, 0.85, "Test Optional"],

  // Mid-Atlantic — Medium
  ["Carnegie Mellon University", "cmu.edu", "PA", 7400, 0.12, "Test Required"],
  ["Villanova University", "villanova.edu", "PA", 7000, 0.23, "Test Optional"],
  ["Lehigh University", "lehigh.edu", "PA", 5600, 0.32, "Test Optional"],
  ["Georgetown University", "georgetown.edu", "DC", 7800, 0.13, "Test Required"],
  ["College of William & Mary", "wm.edu", "VA", 6800, 0.33, "Test Optional"],
  ["American University", "american.edu", "DC", 8500, 0.44, "Test Optional"],
  ["Howard University", "howard.edu", "DC", 10000, 0.53, "Test Optional"],
  ["Seton Hall University", "shu.edu", "NJ", 6200, 0.60, "Test Optional"],
  ["Loyola University Maryland", "loyola.edu", "MD", 4200, 0.75, "Test Optional"],
  ["Drexel University", "drexel.edu", "PA", 13500, 0.78, "Test Optional"],
  ["Radford University", "radford.edu", "VA", 7500, 0.90, "Test Optional"],
  ["Princeton University", "princeton.edu", "NJ", 5600, 0.04, "Test Optional"],
  ["Hofstra University", "hofstra.edu", "NY", 6500, 0.78, "Test Optional"],

  // South — Medium
  ["Vanderbilt University", "vanderbilt.edu", "TN", 7100, 0.06, "Test Optional"],
  ["Rice University", "rice.edu", "TX", 4500, 0.09, "Test Optional"],
  ["Emory University", "emory.edu", "GA", 7100, 0.13, "Test Optional"],
  ["Wake Forest University", "wfu.edu", "NC", 5500, 0.22, "Test Optional"],
  ["Tulane University", "tulane.edu", "LA", 8500, 0.15, "Test Optional"],
  ["SMU", "smu.edu", "TX", 7100, 0.53, "Test Optional"],
  ["TCU", "tcu.edu", "TX", 10000, 0.48, "Test Optional"],
  ["University of Tampa", "ut.edu", "FL", 10000, 0.55, "Test Optional"],
  ["Belmont University", "belmont.edu", "TN", 7000, 0.80, "Test Optional"],
  ["Elon University", "elon.edu", "NC", 7000, 0.72, "Test Optional"],

  // Midwest — Medium
  ["University of Notre Dame", "nd.edu", "IN", 9000, 0.13, "Test Optional"],
  ["Washington University in St. Louis", "wustl.edu", "MO", 8000, 0.12, "Test Optional"],
  ["Marquette University", "marquette.edu", "WI", 8200, 0.82, "Test Optional"],
  ["Butler University", "butler.edu", "IN", 5000, 0.65, "Test Optional"],
  ["University of Dayton", "udayton.edu", "OH", 8500, 0.68, "Test Optional"],
  ["Creighton University", "creighton.edu", "NE", 4500, 0.65, "Test Optional"],
  ["Xavier University", "xavier.edu", "OH", 5200, 0.78, "Test Optional"],
  ["DePaul University", "depaul.edu", "IL", 13000, 0.70, "Test Optional"],
  ["Loyola University Chicago", "luc.edu", "IL", 12000, 0.67, "Test Optional"],
  ["Drake University", "drake.edu", "IA", 5000, 0.68, "Test Optional"],
  ["Bradley University", "bradley.edu", "IL", 5000, 0.72, "Test Optional"],
  ["Valparaiso University", "valpo.edu", "IN", 4500, 0.82, "Test Optional"],

  // West — Medium
  ["Stanford University", "stanford.edu", "CA", 8100, 0.04, "Test Required"],
  ["Santa Clara University", "scu.edu", "CA", 6200, 0.49, "Test Optional"],
  ["Pepperdine University", "pepperdine.edu", "CA", 5500, 0.37, "Test Optional"],
  ["Loyola Marymount University", "lmu.edu", "CA", 7100, 0.45, "Test Optional"],
  ["University of San Diego", "sandiego.edu", "CA", 6200, 0.48, "Test Optional"],
  ["University of Denver", "du.edu", "CO", 6000, 0.63, "Test Optional"],
  ["Chapman University", "chapman.edu", "CA", 8500, 0.58, "Test Optional"],
  ["University of Portland", "up.edu", "OR", 4200, 0.72, "Test Optional"],
  ["Seattle University", "seattleu.edu", "WA", 4500, 0.78, "Test Optional"],
  ["University of San Francisco", "usfca.edu", "CA", 6800, 0.68, "Test Optional"],
  ["Pace University", "pace.edu", "NY", 8500, 0.80, "Test Optional"],

  // ═══════════════════════════════════════════════════════════════════════════
  // LARGE (15,000–29,999 undergrads)
  // ═══════════════════════════════════════════════════════════════════════════

  // Northeast — Large
  ["Harvard University", "harvard.edu", "MA", 21000, 0.03, "Test Required"],
  ["Columbia University", "columbia.edu", "NY", 23000, 0.04, "Test Optional"],
  ["Cornell University", "cornell.edu", "NY", 15000, 0.09, "Test Optional"],
  ["New York University", "nyu.edu", "NY", 28000, 0.13, "Test Optional"],
  ["Boston University", "bu.edu", "MA", 18000, 0.14, "Test Optional"],
  ["University of Connecticut", "uconn.edu", "CT", 19000, 0.56, "Test Optional"],
  ["University of New Hampshire", "unh.edu", "NH", 15000, 0.78, "Test Optional"],
  ["University of Vermont", "uvm.edu", "VT", 12000, 0.58, "Test Optional"],
  ["Stony Brook University", "stonybrook.edu", "NY", 18000, 0.49, "Test Optional"],
  ["University at Buffalo", "buffalo.edu", "NY", 22000, 0.60, "Test Optional"],
  ["Binghamton University", "binghamton.edu", "NY", 15000, 0.38, "Test Optional"],

  // Mid-Atlantic — Large
  ["University of Pennsylvania", "upenn.edu", "PA", 22000, 0.06, "Test Optional"],
  ["Johns Hopkins University", "jhu.edu", "MD", 17000, 0.08, "Test Optional"],
  ["University of Virginia", "virginia.edu", "VA", 17500, 0.19, "Test Required"],
  ["George Washington University", "gwu.edu", "DC", 15000, 0.44, "Test Optional"],
  ["University of Maryland College Park", "umd.edu", "MD", 30000, 0.45, "Test Required"],
  ["University of Pittsburgh", "pitt.edu", "PA", 20000, 0.42, "Test Required"],
  ["University of Delaware", "udel.edu", "DE", 19000, 0.60, "Test Optional"],
  ["Virginia Tech", "vt.edu", "VA", 28000, 0.57, "Test Required"],
  ["James Madison University", "jmu.edu", "VA", 22000, 0.76, "Test Optional"],
  ["Old Dominion University", "odu.edu", "VA", 20000, 0.83, "Test Optional"],
  ["George Mason University", "gmu.edu", "VA", 27000, 0.89, "Test Required"],
  ["West Virginia University", "wvu.edu", "WV", 22000, 0.85, "Test Optional"],
  ["Towson University", "towson.edu", "MD", 19000, 0.78, "Test Optional"],
  ["Syracuse University", "syracuse.edu", "NY", 16000, 0.53, "Test Optional"],
  ["Fordham University", "fordham.edu", "NY", 10000, 0.46, "Test Optional"],

  // South — Large
  ["Duke University", "duke.edu", "NC", 16000, 0.07, "Test Optional"],
  ["University of Miami", "miami.edu", "FL", 19000, 0.19, "Test Optional"],
  ["Clemson University", "clemson.edu", "SC", 22000, 0.38, "Test Required"],
  ["University of Alabama", "ua.edu", "AL", 29000, 0.74, "Test Optional"],
  ["University of Mississippi", "olemiss.edu", "MS", 18000, 0.88, "Test Optional"],
  ["University of Kentucky", "uky.edu", "KY", 22000, 0.90, "Test Required"],
  ["Appalachian State University", "appstate.edu", "NC", 19000, 0.72, "Test Optional"],
  ["University of South Carolina", "sc.edu", "SC", 27000, 0.80, "Test Required"],
  ["Baylor University", "baylor.edu", "TX", 15000, 0.52, "Test Optional"],
  ["University of Arkansas", "uark.edu", "AR", 23000, 0.80, "Test Optional"],

  // Midwest — Large
  ["Northwestern University", "northwestern.edu", "IL", 22000, 0.07, "Test Required"],
  ["University of Oregon", "uoregon.edu", "OR", 19000, 0.82, "Test Optional"],
  ["Miami University Ohio", "miamioh.edu", "OH", 17000, 0.65, "Test Optional"],

  // West — Large
  ["University of Southern California", "usc.edu", "CA", 21000, 0.10, "Test Optional"],
  ["University of Washington", "uw.edu", "WA", 28000, 0.48, "Test Optional"],
  ["University of California Santa Barbara", "ucsb.edu", "CA", 23000, 0.26, "Test Blind"],
  ["University of Colorado Boulder", "colorado.edu", "CO", 29000, 0.81, "Test Optional"],
  ["Washington State University", "wsu.edu", "WA", 25000, 0.83, "Test Optional"],
  ["University of Nevada Reno", "unr.edu", "NV", 18000, 0.85, "Test Optional"],
  ["University of Nevada Las Vegas", "unlv.edu", "NV", 22000, 0.82, "Test Optional"],
  ["University of New Mexico", "unm.edu", "NM", 18000, 0.85, "Test Optional"],
  ["Boise State University", "boisestate.edu", "ID", 20000, 0.82, "Test Optional"],
  ["University of Hawaii Manoa", "hawaii.edu", "HI", 15000, 0.80, "Test Optional"],
  ["Northern Arizona University", "nau.edu", "AZ", 22000, 0.85, "Test Optional"],
  ["University of Montana", "umt.edu", "MT", 8000, 0.92, "Test Optional"],
  ["San Diego State University", "sdsu.edu", "CA", 29000, 0.38, "Test Optional"],

  // ═══════════════════════════════════════════════════════════════════════════
  // MEGA (30,000+ undergrads)
  // ═══════════════════════════════════════════════════════════════════════════

  // Northeast — Mega
  ["University of Massachusetts Amherst", "umass.edu", "MA", 30000, 0.58, "Test Optional"],
  ["Rutgers University", "rutgers.edu", "NJ", 50000, 0.61, "Test Required"],

  // Mid-Atlantic — Mega
  ["Penn State University", "psu.edu", "PA", 46000, 0.55, "Test Required"],
  ["Temple University", "temple.edu", "PA", 30000, 0.80, "Test Optional"],
  ["Virginia Commonwealth University", "vcu.edu", "VA", 31000, 0.88, "Test Optional"],

  // South — Mega
  ["University of Texas at Austin", "utexas.edu", "TX", 51000, 0.31, "Test Required"],
  ["Texas A&M University", "tamu.edu", "TX", 65000, 0.63, "Test Required"],
  ["University of Florida", "ufl.edu", "FL", 52000, 0.25, "Test Required"],
  ["Florida State University", "fsu.edu", "FL", 42000, 0.25, "Test Required"],
  ["University of Georgia", "uga.edu", "GA", 40000, 0.43, "Test Required"],
  ["Georgia Institute of Technology", "gatech.edu", "GA", 40000, 0.17, "Test Required"],
  ["University of North Carolina at Chapel Hill", "unc.edu", "NC", 30000, 0.19, "Test Required"],
  ["NC State University", "ncsu.edu", "NC", 35000, 0.47, "Test Optional"],
  ["University of South Florida", "usf.edu", "FL", 50000, 0.45, "Test Optional"],
  ["University of Central Florida", "ucf.edu", "FL", 58000, 0.42, "Test Optional"],
  ["University of Tennessee", "utk.edu", "TN", 30000, 0.83, "Test Required"],
  ["Auburn University", "auburn.edu", "AL", 31000, 0.82, "Test Required"],
  ["Louisiana State University", "lsu.edu", "LA", 35000, 0.76, "Test Required"],
  ["University of North Texas", "unt.edu", "TX", 38000, 0.82, "Test Optional"],
  ["University of Texas San Antonio", "utsa.edu", "TX", 32000, 0.85, "Test Optional"],
  ["Texas State University", "txstate.edu", "TX", 35000, 0.84, "Test Optional"],
  ["Texas Tech University", "ttu.edu", "TX", 38000, 0.72, "Test Optional"],
  ["University of Houston", "uh.edu", "TX", 36000, 0.65, "Test Optional"],

  // Midwest — Mega
  ["Ohio State University", "osu.edu", "OH", 60000, 0.53, "Test Required"],
  ["University of Michigan", "umich.edu", "MI", 46000, 0.18, "Test Required"],
  ["University of Wisconsin Madison", "wisc.edu", "WI", 44000, 0.43, "Test Required"],
  ["University of Illinois Urbana-Champaign", "illinois.edu", "IL", 52000, 0.44, "Test Required"],
  ["Purdue University", "purdue.edu", "IN", 50000, 0.53, "Test Required"],
  ["Indiana University Bloomington", "iu.edu", "IN", 45000, 0.80, "Test Optional"],
  ["Michigan State University", "msu.edu", "MI", 49000, 0.83, "Test Optional"],
  ["University of Minnesota", "umn.edu", "MN", 51000, 0.75, "Test Optional"],
  ["University of Iowa", "uiowa.edu", "IA", 30000, 0.84, "Test Optional"],
  ["Iowa State University", "iastate.edu", "IA", 32000, 0.90, "Test Optional"],
  ["University of Kansas", "ku.edu", "KS", 27000, 0.88, "Test Optional"],
  ["Kansas State University", "kstate.edu", "KS", 21000, 0.92, "Test Optional"],
  ["University of Nebraska Lincoln", "unl.edu", "NE", 25000, 0.80, "Test Optional"],
  ["University of Missouri", "missouri.edu", "MO", 30000, 0.78, "Test Optional"],

  // West — Mega
  ["University of California Berkeley", "berkeley.edu", "CA", 42000, 0.12, "Test Blind"],
  ["University of California Los Angeles", "ucla.edu", "CA", 45000, 0.09, "Test Blind"],
  ["University of California San Diego", "ucsd.edu", "CA", 40000, 0.24, "Test Blind"],
  ["University of California Davis", "ucdavis.edu", "CA", 38000, 0.37, "Test Blind"],
  ["University of California Irvine", "uci.edu", "CA", 36000, 0.21, "Test Blind"],
  ["University of California Santa Cruz", "ucsc.edu", "CA", 18000, 0.47, "Test Blind"],
  ["Arizona State University", "asu.edu", "AZ", 65000, 0.88, "Test Optional"],
  ["University of Arizona", "arizona.edu", "AZ", 46000, 0.86, "Test Optional"],
  ["Oregon State University", "oregonstate.edu", "OR", 32000, 0.79, "Test Optional"],
  ["Colorado State University", "colostate.edu", "CO", 34000, 0.84, "Test Optional"],
  ["University of Utah", "utah.edu", "UT", 33000, 0.82, "Test Optional"],
  ["Utah State University", "usu.edu", "UT", 30000, 0.88, "Test Optional"],
  ["San Jose State University", "sjsu.edu", "CA", 34000, 0.62, "Test Optional"],
  ["Cal Poly San Luis Obispo", "calpoly.edu", "CA", 22000, 0.30, "Test Optional"],
];

export const SCHOOLS_DATABASE: SchoolRecord[] = RAW.map(([name, url, state, enrollment, admitRate, testPolicy]) => ({
  name,
  url: url.startsWith("https://") ? url : `https://www.${url}`,
  state,
  region: getRegion(state),
  campusSize: getCampusSize(enrollment),
  enrollment,
  admitRate,
  testPolicy,
}));
