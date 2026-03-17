import { ctx } from '../context.js';

// ============ 13. NATURAL LANGUAGE PARSING ============
// Parses natural language task input to extract metadata.
// Supports Hebrew + English, extracts priority, date/time, and subject.

// Dynamic getter for subjects (changes over time)
const getSubjects = () => ctx.subjects || [];

// ============ 13. NATURAL LANGUAGE PARSING ============
/**
 * Parses natural language task input to extract metadata.
 * Supports Hebrew + English, extracts priority, date/time, and subject.
 * @param {string} input - Raw user input text
 * @returns {Object} - {title, dueDate, priority, subjectId, reminderMinutes, recurrence}
 */


// Helper: Normalize text by removing ALL spaces and converting to lowercase
const normalize = (str) => str.replaceAll(/\s+/g, '').toLowerCase();

function extractPriority(text) {
  let priority = 'medium';
  let cleanText = text;

  const priorityPatterns = [
    { level: 'urgent', patterns: [/(דחוף|מיידי|!!!|!!)/gi] },
    { level: 'high', patterns: [/(גבוה|חשוב|!)/gi] },
    { level: 'medium', patterns: [/(בינוני|רגיל)/gi] },
    { level: 'low', patterns: [/(נמוך|לא\s*דחוף)/gi] }
  ];

  for (const { level, patterns } of priorityPatterns) {
    let matched = false;
    for (const pattern of patterns) {
      const matches = cleanText.match(pattern);
      if (matches) {
        priority = level;
        // Remove all matches
        matches.forEach(match => {
          cleanText = cleanText.replace(match, ' ');
        });
        matched = true;
        break;
      }
    }
    if (matched) break;
  }
  return { priority, text: cleanText.trim() };
}

function parseNaturalLanguage(input) {
  // ============ STEP 1: EXTRACT & REMOVE PRIORITY (Hebrew only) ============
  const pResult = extractPriority(input);
  let title = pResult.text;
  let priority = pResult.priority;

  let dueDate = null;
  let subjectId = '';
  let reminderMinutes = 0;
  let recurrence = null;

  // ============ STEP 2: EXTRACT & REMOVE TIME (Hebrew only) ============
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let hours = 23, minutes = 59;
  let timeExtracted = false;

  // Time-of-day keywords (Hebrew)
  const timeOfDayPatterns = [
    { patterns: [/הבוקר/gi, /בבוקר/gi], hours: 9, minutes: 0 },
    { patterns: [/בצהריים/gi, /צהריים/gi], hours: 12, minutes: 0 },
    { patterns: [/אחה"צ/gi, /אחהצ/gi, /אחרי\s*הצהריים/gi], hours: 14, minutes: 0 },
    { patterns: [/בערב/gi, /ערב/gi], hours: 19, minutes: 0 },
    { patterns: [/בלילה/gi, /לילה/gi], hours: 21, minutes: 0 }
  ];

  for (const { patterns, hours: h, minutes: m } of timeOfDayPatterns) {
    for (const pattern of patterns) {
      const matches = title.match(pattern);
      if (matches) {
        hours = h;
        minutes = m;
        timeExtracted = true;
        matches.forEach(match => {
          title = title.replace(match, ' ');
        });
        break;
      }
    }
    if (timeExtracted) break;
  }

  // Specific time patterns (Hebrew formats)
  if (!timeExtracted) {
    const timePatterns = [
      /בשעה\s*(\d{1,2}):(\d{2})/gi,           // בשעה 14:30
      /ב-?(\d{1,2}):(\d{2})/gi,                // ב-14:30 or ב14:30
      /(\d{1,2}):(\d{2})/g,                    // 14:30
      /(\d{1,2})\.(\d{2})/g                    // 14.30
    ];

    for (const pattern of timePatterns) {
      const match = title.match(pattern);
      if (match) {
        const firstMatch = match[0];
        const timeMatch = firstMatch.match(/(\d{1,2})[:](\d{2})/);
        if (timeMatch) {
          hours = Number.parseInt(timeMatch[1]);
          minutes = Number.parseInt(timeMatch[2]);

          // Validate time
          if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
            title = title.replace(firstMatch, ' ').trim();
            timeExtracted = true;
            break;
          }
        }
      }
    }
  }

  // ============ STEP 3: EXTRACT & REMOVE DATE (Hebrew only) ============
  // Hebrew month names for parsing
  const hebrewMonthNames = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
    'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

  // Relative date keywords (Hebrew only)
  const dateKeywords = [
    { patterns: [/מחרתיים/gi], days: 2 },
    { patterns: [/בעוד\s*יומיים/gi], days: 2 },
    { patterns: [/בעוד\s*3\s*ימים/gi], days: 3 },
    { patterns: [/בעוד\s*4\s*ימים/gi], days: 4 },
    { patterns: [/בעוד\s*5\s*ימים/gi], days: 5 },
    { patterns: [/בעוד\s*6\s*ימים/gi], days: 6 },
    { patterns: [/להיום/gi, /היום/gi], days: 0 },
    { patterns: [/למחר/gi, /מחר/gi], days: 1 },
    { patterns: [/בעוד\s*שבועיים/gi], days: 14 },
    { patterns: [/בעוד\s*שבוע/gi], days: 7 },
    { patterns: [/השבוע/gi], days: 3 },  // Approximate to mid-week
    { patterns: [/בשבוע\s*הבא/gi, /שבוע\s*הבא/gi], days: 7 },
    { patterns: [/בעוד\s*חודש/gi], days: 30 },
  ];

  for (const { patterns, days } of dateKeywords) {
    let matched = false;
    for (const pattern of patterns) {
      const matches = title.match(pattern);
      if (matches) {
        dueDate = new Date(today);
        dueDate.setDate(dueDate.getDate() + days);
        dueDate.setHours(hours, minutes, 0, 0);
        // Remove all matches
        matches.forEach(match => {
          title = title.replace(match, ' ');
        });
        matched = true;
        break;
      }
    }
    if (matched) break;
  }

  // Hebrew day names only
  if (!dueDate) {
    const hebrewDays = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

    for (let i = 0; i < 7; i++) {
      // Match patterns like: "ביום ראשון", "יום ראשון", "ראשון", "ביום ראשון הבא"
      const hebrewPattern = new RegExp(`(ביום\\s+|יום\\s+)?${hebrewDays[i]}(\\s+הבא)?`, 'gi');

      const heMatches = title.match(hebrewPattern);

      if (heMatches) {
        const currentDay = today.getDay();
        let daysToAdd = i - currentDay;
        // Check if "הבא" (next) is in the match - if so, add a week
        const isNextWeek = heMatches[0].includes('הבא');
        if (daysToAdd <= 0 || isNextWeek) daysToAdd += 7;

        dueDate = new Date(today);
        dueDate.setDate(dueDate.getDate() + daysToAdd);
        dueDate.setHours(hours, minutes, 0, 0);

        heMatches.forEach(m => title = title.replace(m, ' '));
        break;
      }
    }
  }

  // Hebrew month name dates: "ב-15 בינואר", "15 בינואר", "ב15 ינואר"
  if (!dueDate) {
    for (let monthIdx = 0; monthIdx < hebrewMonthNames.length; monthIdx++) {
      const monthName = hebrewMonthNames[monthIdx];
      // Match patterns like: ב-15 בינואר, 15 בינואר, ב15 ינואר
      const monthPattern = new RegExp(`ב?-?(\\d{1,2})\\s*(ב?${monthName})`, 'gi');
      const match = title.match(monthPattern);

      if (match) {
        const firstMatch = match[0];
        const dayMatch = firstMatch.match(/(\d{1,2})/);
        if (dayMatch) {
          const day = Number.parseInt(dayMatch[1]);
          if (day >= 1 && day <= 31) {
            dueDate = new Date(today.getFullYear(), monthIdx, day, hours, minutes, 0, 0);

            // If date is in the past, assume next year
            if (dueDate < now) {
              dueDate.setFullYear(dueDate.getFullYear() + 1);
            }

            title = title.replace(firstMatch, ' ').trim();
            break;
          }
        }
      }
    }
  }

  // Specific date formats: DD/MM or DD.MM
  if (!dueDate) {
    const datePattern = /(\d{1,2})[\/\.](\d{1,2})/g;
    const match = title.match(datePattern);
    if (match) {
      const firstMatch = match[0];
      const parts = firstMatch.split(/[\/\.]/);
      const day = Number.parseInt(parts[0]);
      const month = Number.parseInt(parts[1]) - 1; // JS months are 0-indexed

      if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
        dueDate = new Date(today.getFullYear(), month, day, hours, minutes, 0, 0);

        // If date is in the past, assume next year
        if (dueDate < now) {
          dueDate.setFullYear(dueDate.getFullYear() + 1);
        }

        title = title.replace(firstMatch, ' ').trim();
      }
    }
  }

  // ============ STEP 3.5: EXTRACT & REMOVE REMINDER (Hebrew only) ============
  const reminderWordPattern = '(?:תזכורת|התראה|הזכרה|תזכיר(?:\\s+לי)?|להזכיר(?:\\s+לי)?|הזכר(?:\\s+לי)?)';
  const reminderDoublePattern = new RegExp(`${reminderWordPattern}\\s*[:：-]?\\s*(?:בעוד\\s*)?(שעתיים|יומיים)\\s*(?:לפני|מראש)?`, 'i');
  const reminderMatchDouble = title.match(reminderDoublePattern);
  if (reminderMatchDouble) {
    const unit = reminderMatchDouble[1];
    reminderMinutes = unit.includes('שעת') ? 120 : 2880;
    title = title.replace(reminderMatchDouble[0], ' ').trim();
  }

  if (!reminderMinutes) {
    const reminderPattern = new RegExp(`${reminderWordPattern}\\s*[:：-]?\\s*(?:בעוד\\s*)?(\\d+)?\\s*(דק(?:ות)?['׳]?|דקה|דקות|שעה|שעות|יום|ימים)\\s*(?:לפני|מראש)?`, 'i');
    const reminderMatch = title.match(reminderPattern);
    if (reminderMatch) {
      const value = Number.parseInt(reminderMatch[1], 10) || 1;
      const unitRaw = (reminderMatch[2] || '').replaceAll(/[׳']/g, '');
      if (unitRaw.startsWith('דק')) {
        reminderMinutes = value;
      } else if (unitRaw.startsWith('שעה') || unitRaw.startsWith('שעות')) {
        reminderMinutes = value * 60;
      } else if (unitRaw.startsWith('יום') || unitRaw.startsWith('ימים')) {
        reminderMinutes = value * 1440;
      }
      title = title.replace(reminderMatch[0], ' ').trim();
    }
  }

  // ============ STEP 3.6: EXTRACT & REMOVE RECURRENCE (Hebrew only) ============
  const customRecurrencePattern = /כל\s*(\d+)\s*(ימים|יום|שבועות|שבוע|חודשים|חודש|שנים|שנה)/i;
  const customMatch = title.match(customRecurrencePattern);
  if (customMatch) {
    const interval = Number.parseInt(customMatch[1], 10);
    const unitRaw = customMatch[2];
    let unit = null;
    if (unitRaw.startsWith('יום')) unit = 'days';
    else if (unitRaw.startsWith('שבוע')) unit = 'weeks';
    else if (unitRaw.startsWith('חודש')) unit = 'months';
    else if (unitRaw.startsWith('שנה')) unit = 'years';
    if (interval && unit) {
      recurrence = { type: 'custom', interval, unit };
      title = title.replace(customMatch[0], ' ').trim();
    }
  }

  if (!recurrence) {
    const doubleRecurrencePattern = /כל\s*(יומיים|שבועיים|חודשיים|שנתיים)/i;
    const doubleMatch = title.match(doubleRecurrencePattern);
    if (doubleMatch) {
      const word = doubleMatch[1];
      if (word.startsWith('יומ')) {
        recurrence = { type: 'custom', interval: 2, unit: 'days' };
      } else if (word.startsWith('שבוע')) {
        recurrence = 'biweekly';
      } else if (word.startsWith('חודש')) {
        recurrence = { type: 'custom', interval: 2, unit: 'months' };
      } else if (word.startsWith('שנת') || word.startsWith('שנה')) {
        recurrence = { type: 'custom', interval: 2, unit: 'years' };
      }
      title = title.replace(doubleMatch[0], ' ').trim();
    }
  }

  if (!recurrence) {
    const recurrencePatterns = [
      { type: 'weekdays', patterns: [/בימי\s*חול/gi, /ימי\s*חול/gi, /א['׳]?-ה['׳]?/g] },
      { type: 'daily', patterns: [/כל\s*יום(?!יים)/gi, /יומי(?!ים)/gi, /בכל\s*יום(?!יים)/gi] },
      { type: 'biweekly', patterns: [/כל\s*שבועיים/gi, /דו[-\s]*שבועי/gi, /דו[-\s]*שבועית/gi] },
      { type: 'weekly', patterns: [/כל\s*שבוע(?!יים)/gi, /שבועי(?!ים)/gi, /מדי\s*שבוע(?!יים)/gi] },
      { type: 'monthly', patterns: [/כל\s*חודש(?!יים)/gi, /חודשי(?!ים)/gi, /מדי\s*חודש(?!יים)/gi] },
      { type: 'yearly', patterns: [/כל\s*שנה(?!יים)/gi, /שנתי(?!ים)/gi, /מדי\s*שנה(?!יים)/gi] }
    ];

    for (const { type, patterns } of recurrencePatterns) {
      let matched = false;
      for (const pattern of patterns) {
        const matches = title.match(pattern);
        if (matches) {
          recurrence = type;
          matches.forEach(match => {
            title = title.replace(match, ' ');
          });
          matched = true;
          break;
        }
      }
      if (matched) break;
    }
  }

  // ============ STEP 4: ENHANCED SUBJECT DETECTION ============
  // Sort subjects by name length (longest first) to prevent partial matches
  const sortedSubjects = [...subjects].sort((a, b) => b.name.length - a.name.length);
  let matchedSubject = null;
  let textToRemove = '';

  // METHOD 1: Hashtag with hierarchy #parent/child or #parent/child/grandchild
  const hierarchyMatch = title.match(/#([^#\s]+)\/([^#\s\/]+)(?:\/([^#\s\/]+))?/);
  if (hierarchyMatch) {
    const parentSearch = normalize(hierarchyMatch[1].replaceAll('_', ' '));
    const childSearch = normalize(hierarchyMatch[2].replaceAll('_', ' '));
    const grandchildSearch = hierarchyMatch[3] ? normalize(hierarchyMatch[3].replaceAll('_', ' ')) : null;

    // Find parent
    const parent = sortedSubjects.find(s =>
      !s.parentId && normalize(s.name).includes(parentSearch)
    );

    if (parent) {
      // Find child
      let child = getSubjects().find(s =>
        s.parentId === parent.id && normalize(s.name).includes(childSearch)
      );

      // If grandchild specified, find it
      if (child && grandchildSearch) {
        const grandchild = getSubjects().find(s =>
          s.parentId === child.id && normalize(s.name).includes(grandchildSearch)
        );
        if (grandchild) {
          matchedSubject = grandchild;
        } else {
          matchedSubject = child; // Fallback to child if grandchild not found
        }
      } else if (child) {
        matchedSubject = child;
      }

      if (matchedSubject) {
        textToRemove = hierarchyMatch[0];
      }
    }
  }

  // METHOD 2: Explicit Hashtag - Search ALL subjects (parent and children)
  if (!matchedSubject) {
    const hashIndex = title.indexOf('#');

    if (hashIndex !== -1) {
      const afterHash = title.substring(hashIndex + 1);

      // Check for quoted format first
      const quotedMatch = afterHash.match(/^"([^"]+)"/);
      if (quotedMatch) {
        const searchNorm = normalize(quotedMatch[1]);
        // Search in ALL subjects (including children)
        matchedSubject = sortedSubjects.find(s => normalize(s.name) === searchNorm);
        if (matchedSubject) {
          textToRemove = '#"' + quotedMatch[1] + '"';
        }
      }

      // Check for underscore format
      if (!matchedSubject) {
        const underscoreMatch = afterHash.match(/^([^\s]+)/);
        if (underscoreMatch) {
          const searchText = underscoreMatch[1].replaceAll('_', ' ');
          const searchNorm = normalize(searchText);
          // Search in ALL subjects (including children)
          matchedSubject = sortedSubjects.find(s => normalize(s.name) === searchNorm);
          if (matchedSubject) {
            textToRemove = '#' + underscoreMatch[1];
          }
        }
      }

      // Character-by-character matching (space-insensitive)
      if (!matchedSubject) {
        const afterHashNormalized = normalize(afterHash);

        // Search in ALL subjects (including children)
        for (const subject of sortedSubjects) {
          const subjectNormalized = normalize(subject.name);

          if (afterHashNormalized.startsWith(subjectNormalized)) {
            matchedSubject = subject;

            // Calculate exact length to remove
            let matchLength = 0;
            let subjectCharIdx = 0;
            const subjectNoSpaces = subject.name.replaceAll(/\s+/g, '').toLowerCase();

            for (let i = 0; i < afterHash.length; i++) {
              const char = afterHash[i].toLowerCase();
              if (/\s/.test(char)) {
                matchLength++;
                continue;
              }
              if (char === subjectNoSpaces[subjectCharIdx]) {
                matchLength++;
                subjectCharIdx++;
                if (subjectCharIdx >= subjectNoSpaces.length) break;
              } else {
                break;
              }
            }

            textToRemove = '#' + afterHash.substring(0, matchLength);
            break;
          }
        }
      }
    }
  }

  // METHOD 3: Auto-detect subject name anywhere in text (without #)
  // Search ALL subjects - children are prioritized because sortedSubjects is by length
  if (!matchedSubject) {
    for (const subject of sortedSubjects) {
      // Create flexible regex that allows optional spaces between letters
      const words = subject.name.split(/\s+/);
      const pattern = words.map(w =>
        w.split('').map(c => c.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*')
      ).join('\\s+');
      const boundary = "(?:^|\\s|[\\.,!\\?;:\\-\\(\\)\\[\\]{}\"'])";
      const regex = new RegExp(`${boundary}(${pattern})(?=$|\\s|[\\.,!\\?;:\\-\\(\\)\\[\\]{}\"'])`, 'i');

      const match = title.match(regex);
      if (match) {
        matchedSubject = subject;
        textToRemove = match[1] || match[0];
        break;
      }
    }
  }

  // Apply subject match
  if (matchedSubject) {
    subjectId = matchedSubject.id;
    if (textToRemove) {
      title = title.replace(textToRemove, ' ').trim();
    }
  }

  // ============ STEP 5: FINAL CLEANUP ============
  title = title.replaceAll(/#\s*/g, ' ');
  title = title.replaceAll(/\s+/g, ' ').trim();
  title = title.replace(/^[,.:;\-]+\s*/, '').replace(/\s*[,.:;\-]+$/, '').trim();

  return { title, dueDate, priority, subjectId, reminderMinutes, recurrence };
}

// Legacy helper - kept for compatibility
function normalizeForComparison(text) {
  return text.toLowerCase().replaceAll(/\s+/g, '').trim();
}

// Helper function to find best matching subject (used by some methods)
function findBestSubjectMatch(searchTerm, sortedSubjects) {
  const normalize = (str) => str.replaceAll(/\s+/g, '').toLowerCase();
  const searchNorm = normalize(searchTerm);
  const searchLower = searchTerm.toLowerCase().trim(); // Define searchLower for fuzzy matching

  // 1. Exact match (space-insensitive)
  let found = sortedSubjects.find(s => normalize(s.name) === searchNorm);
  if (found) return found;

  // 2. Starts with
  found = sortedSubjects.find(s => normalize(s.name).startsWith(searchNorm));
  if (found) return found;

  // 3. Search term starts with subject name
  found = sortedSubjects.find(s => searchNorm.startsWith(normalize(s.name)));
  if (found) return found;

  // 4. Contains
  found = sortedSubjects.find(s => normalize(s.name).includes(searchNorm));
  if (found) return found;

  // 5. Reverse contains
  found = sortedSubjects.find(s => searchLower.includes(s.name.toLowerCase()));
  if (found) return found;

  // 6. Fuzzy match - check if all words from search appear in subject name
  const searchWords = searchLower.split(/\s+/);
  found = sortedSubjects.find(s => {
    const subjectLower = s.name.toLowerCase();
    return searchWords.every(word => subjectLower.includes(word));
  });
  if (found) return found;

  return null;
}


export { parseNaturalLanguage, findBestSubjectMatch, normalizeForComparison };
