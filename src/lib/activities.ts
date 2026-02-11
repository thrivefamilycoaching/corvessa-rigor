export interface Activity {
  name: string;
  role: string;
  years: number;
  yearsInRole: number;
}

export interface ActivityCategory {
  name: string;
  activities: string[];
}

export const ACTIVITY_CATEGORIES: ActivityCategory[] = [
  {
    name: "Athletics",
    activities: [
      "Varsity Football", "Varsity Basketball", "Varsity Soccer", "Varsity Baseball",
      "Varsity Softball", "Varsity Tennis", "Varsity Swimming", "Varsity Track & Field",
      "Varsity Cross Country", "Varsity Volleyball", "Varsity Lacrosse", "Varsity Field Hockey",
      "Varsity Wrestling", "Varsity Golf", "Varsity Hockey", "Varsity Rowing",
      "Varsity Water Polo", "Varsity Gymnastics", "Varsity Fencing", "Varsity Sailing",
      "Varsity Skiing", "Varsity Squash", "Varsity Diving", "Varsity Cheerleading",
      "JV Sports", "Club Sports", "Intramural Sports", "Martial Arts",
      "Dance Team", "Equestrian", "Rock Climbing", "Ultimate Frisbee",
      "Rugby",
    ],
  },
  {
    name: "Arts",
    activities: [
      "Concert Band", "Marching Band", "Jazz Band", "Orchestra",
      "Choir", "A Cappella", "Theater/Drama", "Musical Theater",
      "Visual Arts", "Photography", "Ceramics", "Film/Video Production",
      "Creative Writing", "Dance", "Digital Art", "Graphic Design",
      "Fashion Design",
    ],
  },
  {
    name: "Academic",
    activities: [
      "Math Club", "Science Olympiad", "Debate Team", "Model United Nations",
      "Mock Trial", "Quiz Bowl/Academic Decathlon", "Robotics Club", "Computer Science Club",
      "Engineering Club", "Chemistry Club", "Physics Club", "Biology Club",
      "Environmental Club", "Astronomy Club", "Economics Club", "Philosophy Club",
      "History Club", "Book Club", "Foreign Language Club", "STEM Research",
      "National Honor Society",
    ],
  },
  {
    name: "Community Service",
    activities: [
      "Habitat for Humanity", "Food Bank Volunteer", "Hospital Volunteer",
      "Tutoring/Mentoring", "Animal Shelter Volunteer", "Environmental Cleanup",
      "Red Cross", "Big Brothers Big Sisters", "Special Olympics Volunteer",
      "Homeless Shelter Volunteer", "Church/Religious Service", "Community Garden",
      "Disaster Relief", "Literacy Programs", "Senior Center Volunteer",
    ],
  },
  {
    name: "Student Government",
    activities: [
      "Student Body President", "Student Body Vice President", "Class President",
      "Class Vice President", "Class Secretary", "Class Treasurer",
      "Student Council Representative", "Student Senate", "Homecoming Committee",
      "Prom Committee",
    ],
  },
  {
    name: "Work Experience",
    activities: [
      "Part-Time Job", "Summer Internship", "Research Assistant",
      "Family Business", "Freelance Work", "Entrepreneurship/Startup",
      "Lifeguard", "Camp Counselor", "Retail/Food Service",
      "Office/Administrative", "Teaching Assistant",
    ],
  },
  {
    name: "Publications & Media",
    activities: [
      "School Newspaper", "Literary Magazine", "Yearbook",
      "School Blog/Website", "Podcast", "Radio Station",
      "Published Research",
    ],
  },
];

export const ALL_ACTIVITIES: { name: string; category: string }[] =
  ACTIVITY_CATEGORIES.flatMap((cat) =>
    cat.activities.map((name) => ({ name, category: cat.name }))
  );

export const ROLE_OPTIONS = [
  "Captain",
  "President",
  "Vice President",
  "Secretary",
  "Treasurer",
  "Editor-in-Chief",
  "Section Leader",
  "Team Lead",
  "Co-Founder",
  "Founder",
  "Director",
  "Head Coach",
  "Mentor",
  "Tutor",
  "Officer",
  "Chair",
  "Coordinator",
  "Manager",
  "Member",
  "Volunteer",
];

export const YEARS_OPTIONS = [1, 2, 3, 4, 5, 6];

export function searchActivities(
  query: string
): { name: string; category: string }[] {
  if (!query.trim()) return [];
  const lower = query.toLowerCase();
  const matches = ALL_ACTIVITIES.filter((a) =>
    a.name.toLowerCase().includes(lower)
  );
  return matches.slice(0, 15);
}
