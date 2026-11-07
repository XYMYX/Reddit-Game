// Source lists for the profile generator. Everything is combined randomly,
// so the resulting people are fictional. Team names are invented.
// Keep tokens ASCII letters only (no spaces, no umlauts) -> typeable on phones.

export const FIRST_NAMES = [
  'Mia', 'Noah', 'Lena', 'Liam', 'Emma', 'Finn', 'Nora', 'Leon', 'Ella', 'Jonas',
  'Sara', 'Luca', 'Anna', 'Elias', 'Lara', 'Milo', 'Zoe', 'Theo', 'Ida', 'Owen',
  'Maya', 'Ben', 'Clara', 'Sam', 'Iris', 'Adam', 'Lily', 'Hugo', 'Ruby', 'Max',
] as const;

export const LAST_NAMES = [
  'Keller', 'Brandt', 'Moser', 'Fischer', 'Hart', 'Novak', 'Berg', 'Lund', 'Weber',
  'Costa', 'Marsh', 'Frey', 'Sutter', 'Blake', 'Varga', 'Holm', 'Rossi', 'Kraft',
  'Dunn', 'Meier', 'Stone', 'Baker', 'Vogel', 'Pratt', 'Lindqvist',
] as const;

export const CITIES = [
  { city: 'Zurich', country: 'Switzerland' },
  { city: 'Bern', country: 'Switzerland' },
  { city: 'Basel', country: 'Switzerland' },
  { city: 'Vienna', country: 'Austria' },
  { city: 'Berlin', country: 'Germany' },
  { city: 'Hamburg', country: 'Germany' },
  { city: 'Oslo', country: 'Norway' },
  { city: 'Lisbon', country: 'Portugal' },
  { city: 'Dublin', country: 'Ireland' },
  { city: 'Leeds', country: 'England' },
  { city: 'Denver', country: 'USA' },
  { city: 'Austin', country: 'USA' },
  { city: 'Toronto', country: 'Canada' },
  { city: 'Perth', country: 'Australia' },
  { city: 'Madrid', country: 'Spain' },
  { city: 'Milan', country: 'Italy' },
  { city: 'Prague', country: 'Czechia' },
  { city: 'Krakow', country: 'Poland' },
] as const;

export const JOBS = [
  'nurse', 'teacher', 'baker', 'mechanic', 'designer', 'accountant', 'chef',
  'electrician', 'librarian', 'pilot', 'developer', 'barista', 'plumber',
] as const;

export const PET_TYPES = ['dog', 'cat', 'rabbit', 'parrot', 'hamster', 'turtle'] as const;

export const PET_NAMES = [
  'Luna', 'Max', 'Bella', 'Rocky', 'Mochi', 'Pepper', 'Biscuit', 'Ziggy', 'Coco',
  'Nala', 'Oscar', 'Milo', 'Tiger', 'Lucky', 'Ginger', 'Bruno', 'Peanut', 'Kiko',
  'Shadow', 'Buddy', 'Pixel', 'Waffle',
] as const;

export const HOBBIES = [
  'chess', 'surf', 'yoga', 'golf', 'poker', 'tennis', 'guitar', 'piano', 'hiking',
  'skiing', 'gaming', 'boxing', 'fishing', 'cycling', 'climbing', 'karate',
] as const;

/** Invented clubs. Display = "<town> <mascot>", password token = mascot. */
export const TEAM_TOWNS = [
  'Northport', 'Eastvale', 'Redwood', 'Silverlake', 'Westbrook', 'Ashford', 'Lakeside',
] as const;

export const TEAM_MASCOTS = [
  'Wolves', 'Hawks', 'Bears', 'Sharks', 'Comets', 'Tigers', 'Lions', 'Foxes',
  'Rockets', 'Owls', 'Bulls', 'Eagles',
] as const;

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December',
] as const;

/** Symbols the generator may append. Small fixed set, shown on the keypad. */
export const SYMBOLS = ['!', '?', '#', '@', '.', '_'] as const;

/** All characters a guess may contain. */
export const ALLOWED_CHARS = /^[A-Za-z0-9!?#@._]+$/;
const UPPER_CHARS = /^[A-Z0-9!?#@._]+$/;

export const charsetFor = (mixedCase: boolean): RegExp => (mixedCase ? ALLOWED_CHARS : UPPER_CHARS);
