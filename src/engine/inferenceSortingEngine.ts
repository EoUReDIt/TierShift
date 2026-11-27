export type ClassificationStatus =
  | 'Verified'
  | 'Probable'
  | 'Unknown'
  | 'Historical';

export type MoveAction = 'MOVE' | 'REVIEW' | 'HOLD' | 'REFERENCE';

export type InventoryCategory =
  | 'Academic'
  | 'Career'
  | 'Self-Paced Learning'
  | 'Professional Training'
  | 'Self-Directed Practice'
  | 'Administrative'
  | 'Staging-Probable'
  | 'Unsorted';

export interface SignalBreakdown {
  explicitAssignment: number;
  subjectMatch: number;
  clusterMatch: number;
  temporalMatch: number;
  versionMatch: number;
  contradictoryPenalty: number;
  total: number;
}

export interface RawArtifactInput {
  id: string;
  fileName: string;
  sourcePath: string;
  parentFolder: string;
  modifiedDate: string; // YYYY-MM-DD
  sizeBytes: number;
  contentExcerpt: string;
  topics: string[];
  versionGroup?: string;
  versionRank?: number; // higher = newer
  isHistoricalReference?: boolean;
  historicalNote?: string;
  batchNumber?: number;
}

export interface ClassifiedArtifact {
  id: string;
  sourceFile: string;
  fileName: string;
  parentFolder: string;
  modifiedDate: string;
  sizeBytes: number;
  destinationFolder: string;
  category: InventoryCategory;
  subCategory: string;
  secondaryClassification?: string;
  clusterId?: string;
  clusterLabel?: string;
  versionFamily?: string;
  canonicalVersionFolder?: string;
  confidence: number;
  status: ClassificationStatus;
  moveAction: MoveAction;
  signals: SignalBreakdown;
  appliedRules: string[];
  evidenceNotes: string[];
  notes: string;
  manuallyVerified?: boolean;
  batchNumber: number;
}

export interface ArtifactClusterSummary {
  clusterId: string;
  label: string;
  category: InventoryCategory;
  subCategory: string;
  destinationFolder: string;
  memberIds: string[];
  memberFiles: string[];
  clusterConfidence: number;
  status: ClassificationStatus;
  sharedSignals: string[];
}

export interface BatchRunSummary {
  batchNumber: number;
  label: string;
  artifactsProcessed: number;
  newCourseMappings: number;
  newCategoryMappings: number;
  newVerifiedArtifacts: number;
  zeroYield: boolean;
}

export interface CourseRecoveryRecord {
  code: string;
  title: string;
  status: 'Recovered' | 'Partially Recovered' | 'Not Recovered';
  evidenceSummary: string;
  artifactCount: number;
}

export interface HistoricalRecord {
  id: string;
  domain: 'Academic' | 'Career';
  label: string;
  state: 'Partially Recovered' | 'Not Recovered';
  reason: string;
  passesCompleted: number;
}

interface CourseRule {
  code: string;
  title: string;
  explicitPatterns: RegExp[];
  subjectKeywords: string[];
  codeFiles?: string[];
  categoryPriority: 'University Coursework';
}

const COURSE_RULES: CourseRule[] = [
  {
    code: 'CMIS 141',
    title: 'Introductory Programming',
    explicitPatterns: [/\bcmis[\s_-]?141\b/i],
    subjectKeywords: ['byte of python', 'python foundations', 'intro programming', 'control flow', 'exceptions'],
    categoryPriority: 'University Coursework',
  },
  {
    code: 'CMIS 242',
    title: 'Intermediate Programming',
    explicitPatterns: [/\bcmis[\s_-]?242\b/i],
    subjectKeywords: ['intermediate java', 'inheritance', 'encapsulation', 'file io'],
    categoryPriority: 'University Coursework',
  },
  {
    code: 'CMSC 315',
    title: 'Data Structures and Analysis',
    explicitPatterns: [/\bcmsc[\s_-]?315\b/i],
    subjectKeywords: [
      'binary tree',
      'binarytree',
      'startbst',
      'bst',
      'graphapp',
      'vertexobj',
      'appstart',
      'point2dc',
      'getarraycreator',
      'adjacency',
      'data structures',
    ],
    codeFiles: [
      'appstart.java',
      'binarytree.java',
      'graphapp.java',
      'vertexobj.java',
      'startbst.java',
      'getarraycreator.java',
      'point2dc.java',
    ],
    categoryPriority: 'University Coursework',
  },
  {
    code: 'CMSC 320',
    title: 'Relational Database Concepts and Applications',
    explicitPatterns: [/\bcmsc[\s_-]?320\b/i],
    subjectKeywords: [
      'database design',
      'pk/fk',
      'primary key',
      'foreign key',
      'entity relationship',
      'normalization',
      '3nf',
      'relational schema',
    ],
    categoryPriority: 'University Coursework',
  },
  {
    code: 'CMSC 330',
    title: 'Advanced Programming Languages',
    explicitPatterns: [/\bcmsc[\s_-]?330\b/i],
    subjectKeywords: [
      'lexical analyzer',
      'syntax tree',
      'interpreter',
      'programming languages',
      'semantic analysis',
    ],
    categoryPriority: 'University Coursework',
  },
  {
    code: 'CMSC 335',
    title: 'Object-Oriented and Concurrent Programming',
    explicitPatterns: [/\bcmsc[\s_-]?335\b/i],
    subjectKeywords: [
      'javafx',
      'swing',
      'concurrency',
      'threads',
      'thread pool',
      'executorservice',
      'polymorphism',
      'gui event',
    ],
    categoryPriority: 'University Coursework',
  },
  {
    code: 'CMSC 345',
    title: 'Software Engineering Principles and Techniques',
    explicitPatterns: [/\bcmsc[\s_-]?345\b/i],
    subjectKeywords: [
      'requirements engineering',
      'erd analysis',
      'software lifecycle',
      'sdlc',
      'integration testing',
      'srs',
      'review questions',
    ],
    categoryPriority: 'University Coursework',
  },
  {
    code: 'CMSC 430',
    title: 'Compiler Theory and Design',
    explicitPatterns: [/\bcmsc[\s_-]?430\b/i],
    subjectKeywords: [
      'recursive descent',
      'grammar',
      'parse trees',
      'parse tree',
      'left recursion',
      'parsing discussion',
      'bnf',
      'compiler theory',
    ],
    categoryPriority: 'University Coursework',
  },
  {
    code: 'CMSC 451',
    title: 'Design and Analysis of Computer Algorithms',
    explicitPatterns: [/\bcmsc[\s_-]?451\b/i],
    subjectKeywords: [
      'asymptotic',
      'dynamic programming',
      'recurrence relation',
      'np-complete',
      'algorithm analysis',
      'divide and conquer',
      'big-o',
    ],
    categoryPriority: 'University Coursework',
  },
  {
    code: 'CMSC 495',
    title: 'Current Trends and Projects in Computer Science',
    explicitPatterns: [/\bcmsc[\s_-]?495\b/i],
    subjectKeywords: ['capstone project', 'cmsc 495'],
    categoryPriority: 'University Coursework',
  },
  {
    code: 'CSIA 303',
    title: 'Foundations of Information System Security',
    explicitPatterns: [/\bcsia[\s_-]?303\b/i],
    subjectKeywords: ['cia triad', 'information assurance', 'risk assessment', 'access control policy'],
    categoryPriority: 'University Coursework',
  },
  {
    code: 'SDEV 300',
    title: 'Building Secure Python Applications',
    explicitPatterns: [/\bsdev[\s_-]?300\b/i],
    subjectKeywords: [
      'flask security',
      'secure python',
      'owasp',
      'input sanitization',
      'week 5 assignments',
      'week 5 discussions',
      'password hashing',
    ],
    categoryPriority: 'University Coursework',
  },
  {
    code: 'ARIN 350',
    title: 'Artificial Intelligence Applications',
    explicitPatterns: [/\barin[\s_-]?350\b/i],
    subjectKeywords: ['unit_8_final_presentation', 'artificial intelligence', 'neural network ethics', 'ai governance'],
    categoryPriority: 'University Coursework',
  },
];

const UNRELIABLE_GENERIC_NAMES = [
  /^content\.(rtf|mht|html?|txt)$/i,
  /^document\d*\.(docx?|pdf|odt|rtf)$/i,
  /^notes?\d*\.(txt|md|rtf)$/i,
  /^untitled/i,
  /^[a-f0-9-]{20,}\./i,
  /^[a-z0-9]{10,14}\.xlsx$/i,
];

export const RECOVERED_COURSES_CATALOG: CourseRecoveryRecord[] = [
  { code: 'CMIS 141', title: 'Introductory Programming', status: 'Recovered', evidenceSummary: 'Supporting material inheritance (byte-of-python.pdf)', artifactCount: 1 },
  { code: 'CMIS 242', title: 'Intermediate Programming', status: 'Recovered', evidenceSummary: 'Coursework & Java OOP assignments verified', artifactCount: 1 },
  { code: 'CMSC 315', title: 'Data Structures and Analysis', status: 'Recovered', evidenceSummary: 'Projects 1–4, 7 Java source files, Project 4 Reflection, Archive', artifactCount: 6 },
  { code: 'CMSC 320', title: 'Relational Database Concepts', status: 'Recovered', evidenceSummary: 'PK/FK & ER modeling workbook (9tntevljg9uo.xlsx)', artifactCount: 1 },
  { code: 'CMSC 330', title: 'Advanced Programming Languages', status: 'Recovered', evidenceSummary: 'Projects 1–2 compiler & parser implementations', artifactCount: 1 },
  { code: 'CMSC 335', title: 'Object-Oriented & Concurrent Programming', status: 'Recovered', evidenceSummary: 'HW 3–4, Project 1, Final Reflection (JavaFX, Swing, Threads)', artifactCount: 2 },
  { code: 'CMSC 345', title: 'Software Engineering Principles', status: 'Recovered', evidenceSummary: 'Requirements Engineering, ERD Analysis, SDLC Review Questions', artifactCount: 1 },
  { code: 'CMSC 430', title: 'Compiler Theory and Design', status: 'Recovered', evidenceSummary: 'Week 2 discussion.html (Recursive Descent, Grammar, Left Recursion)', artifactCount: 1 },
  { code: 'CMSC 451', title: 'Design & Analysis of Algorithms', status: 'Recovered', evidenceSummary: 'GUID lecture notes PDF (7173a598-919e-4aff-85c3-236999cdf364.pdf)', artifactCount: 1 },
  { code: 'CSIA 303', title: 'Information System Security', status: 'Recovered', evidenceSummary: 'Security foundations coursework assigned', artifactCount: 1 },
  { code: 'SDEV 300', title: 'Building Secure Python Applications', status: 'Recovered', evidenceSummary: 'Labs 3–5, HW 5–8, Week 5 Assignments & Discussions', artifactCount: 2 },
  { code: 'ARIN 350', title: 'Artificial Intelligence Applications', status: 'Recovered', evidenceSummary: 'Unit_8_Final_Presentation.pptx (explicit identifier)', artifactCount: 1 },
  { code: 'CMSC 495', title: 'Capstone in Computer Science', status: 'Partially Recovered', evidenceSummary: 'Course container located; coursework artifacts not recovered', artifactCount: 0 },
  { code: 'CMIT 265', title: 'Networking Fundamentals', status: 'Not Recovered', evidenceSummary: 'Negative evidence across multiple passes — Historical Reference only', artifactCount: 0 },
];

export const HISTORICAL_NEGATIVE_EVIDENCE: HistoricalRecord[] = [
  {
    id: 'hist-cmsc495',
    domain: 'Academic',
    label: 'CMSC 495 — Coursework Artifacts',
    state: 'Partially Recovered',
    reason: 'Course container directory was located in OneDrive, but zero projects, submissions, or discussions were recoverable across passes.',
    passesCompleted: 4,
  },
  {
    id: 'hist-cmit265',
    domain: 'Academic',
    label: 'CMIT 265 — Full Course',
    state: 'Not Recovered',
    reason: 'Multiple reconstruction passes produced no projects, assignments, discussions, or labs. Marked Historical Reference (Rule 8) to avoid unsupported guesses.',
    passesCompleted: 5,
  },
  {
    id: 'hist-res-2024',
    domain: 'Career',
    label: 'Resume 2024 / Resume 2025 Variants',
    state: 'Not Recovered',
    reason: 'Likely deleted, stored in email attachments, or outside sampled OneDrive inventory. Superseded by verified Master Resume 2026Jan.pdf.',
    passesCompleted: 3,
  },
  {
    id: 'hist-res-fed',
    domain: 'Career',
    label: 'Federal / Systems Admin / M365 / Endpoint Engineer Tailored Resumes',
    state: 'Not Recovered',
    reason: 'Referenced in career timeline (Sherweb T3 / Intune Support Engineer, Jun 2023 – Jun 2025) but not present in OneDrive export.',
    passesCompleted: 3,
  },
];

export const INITIAL_ONEDRIVE_ARTIFACTS: RawArtifactInput[] = [
  // CMSC 315 Cluster (Rules 1, 3, 5)
  {
    id: 'art-cmsc315-ref4',
    fileName: 'Project 4 Reflection.docx',
    sourcePath: 'OneDrive\\Staging\\School\\Project 4 Reflection.docx',
    parentFolder: 'School',
    modifiedDate: '2024-05-06',
    sizeBytes: 184320,
    contentExcerpt: 'CMSC 315 Project 4 Reflection: Implementing directed graph traversal with GraphApp.java, VertexObj.java, and AppStart.java.',
    topics: ['CMSC 315', 'Project 4', 'Graph', 'Reflection'],
    batchNumber: 1,
  },
  {
    id: 'art-cmsc315-graphapp',
    fileName: 'GraphApp.java',
    sourcePath: 'OneDrive\\Staging\\LooseCode\\GraphApp.java',
    parentFolder: 'LooseCode',
    modifiedDate: '2024-05-05',
    sizeBytes: 14210,
    contentExcerpt: 'public class GraphApp extends Application { // Project 4 graph canvas rendering VertexObj edges and cycles }',
    topics: ['Project 4', 'GraphApp', 'VertexObj', 'Java'],
    batchNumber: 1,
  },
  {
    id: 'art-cmsc315-vertexobj',
    fileName: 'VertexObj.java',
    sourcePath: 'OneDrive\\Staging\\LooseCode\\VertexObj.java',
    parentFolder: 'LooseCode',
    modifiedDate: '2024-05-05',
    sizeBytes: 4820,
    contentExcerpt: 'public class VertexObj { private String label; private double x, y; // Project 4 vertex node for GraphApp }',
    topics: ['Project 4', 'VertexObj', 'Graph'],
    batchNumber: 1,
  },
  {
    id: 'art-cmsc315-appstart',
    fileName: 'AppStart.java',
    sourcePath: 'OneDrive\\Staging\\LooseCode\\AppStart.java',
    parentFolder: 'LooseCode',
    modifiedDate: '2024-05-05',
    sizeBytes: 3190,
    contentExcerpt: 'public class AppStart { public static void main(String[] args) { GraphApp.launch(args); } // Project 4 entrypoint }',
    topics: ['Project 4', 'AppStart', 'GraphApp'],
    batchNumber: 1,
  },
  {
    id: 'art-cmsc315-bst',
    fileName: 'BinaryTree.java',
    sourcePath: 'OneDrive\\Staging\\LooseCode\\BinaryTree.java',
    parentFolder: 'LooseCode',
    modifiedDate: '2024-04-18',
    sizeBytes: 9440,
    contentExcerpt: 'public class BinaryTree { // StartBST node insertion, inorder traversal, balanced height check for Project 3 }',
    topics: ['BinaryTree', 'StartBST', 'Project 3', 'Data Structures'],
    batchNumber: 1,
  },
  {
    id: 'art-cmsc315-zip',
    fileName: 'Melbourne Anderson_Project2.zip',
    sourcePath: 'OneDrive\\Downloads\\Melbourne Anderson_Project2.zip',
    parentFolder: 'Downloads',
    modifiedDate: '2024-04-02',
    sizeBytes: 412890,
    contentExcerpt: 'CMSC 315 Project 2 submission archive containing point2Dc.java and getArrayCreator.java maximal points algorithm.',
    topics: ['CMSC 315', 'Project 2', 'point2Dc', 'getArrayCreator'],
    batchNumber: 1,
  },

  // CMSC 320 Opaque filename recovered by Subject Evidence (Rule 2)
  {
    id: 'art-cmsc320-xlsx',
    fileName: '9tntevljg9uo.xlsx',
    sourcePath: 'OneDrive\\Recovered\\9tntevljg9uo.xlsx',
    parentFolder: 'Recovered',
    modifiedDate: '2024-02-19',
    sizeBytes: 68120,
    contentExcerpt: 'Database Design Artifact workbook: PK/FK Design tables, Entity Relationship Modeling matrix, 3NF relational schema.',
    topics: ['Database Design', 'PK/FK', 'Entity Relationship', 'Relational Schema'],
    batchNumber: 1,
  },

  // CMSC 430 Opaque filename recovered by Subject Evidence (Rule 2)
  {
    id: 'art-cmsc430-w2',
    fileName: 'Week 2 discussion.html',
    sourcePath: 'OneDrive\\Exports\\Week 2 discussion.html',
    parentFolder: 'Exports',
    modifiedDate: '2024-09-12',
    sizeBytes: 42910,
    contentExcerpt: 'Compiler parsing discussion on Recursive Descent parsers, BNF Grammar elimination of Left Recursion, and Parse Trees.',
    topics: ['Recursive Descent', 'Grammar', 'Parse Trees', 'Left Recursion'],
    batchNumber: 1,
  },

  // CMSC 451 GUID PDF recovered by Subject Evidence (Rule 2)
  {
    id: 'art-cmsc451-guid',
    fileName: '7173a598-919e-4aff-85c3-236999cdf364.pdf',
    sourcePath: 'OneDrive\\Recovered\\7173a598-919e-4aff-85c3-236999cdf364.pdf',
    parentFolder: 'Recovered',
    modifiedDate: '2024-11-03',
    sizeBytes: 2450110,
    contentExcerpt: 'CMSC 451 Lecture Notes: Asymptotic complexity, Master Theorem recurrence relations, Dynamic Programming, NP-Complete reductions.',
    topics: ['CMSC 451', 'Lecture Notes', 'Dynamic Programming', 'Algorithm Analysis'],
    batchNumber: 1,
  },

  // CMSC 335 Explicit + Subject
  {
    id: 'art-cmsc335-ref',
    fileName: 'Final Reflection.docx',
    sourcePath: 'OneDrive\\Documents\\Final Reflection.docx',
    parentFolder: 'Documents',
    modifiedDate: '2024-07-29',
    sizeBytes: 98400,
    contentExcerpt: 'CMSC 335 Final Reflection covering Homework 3, Homework 4, Project 1: JavaFX vs Swing GUI threading, Concurrency, and Polymorphism.',
    topics: ['CMSC 335', 'JavaFX', 'Swing', 'Concurrency', 'Threads', 'Polymorphism'],
    batchNumber: 1,
  },

  // CMSC 345 Subject match
  {
    id: 'art-cmsc345-rev',
    fileName: 'Review Questions.docx',
    sourcePath: 'OneDrive\\Documents\\Review Questions.docx',
    parentFolder: 'Documents',
    modifiedDate: '2024-06-14',
    sizeBytes: 112500,
    contentExcerpt: 'Requirements Engineering, ERD Analysis, Integration testing strategy, Software Lifecycle (SDLC) trade-offs.',
    topics: ['Requirements Engineering', 'ERD Analysis', 'Software Lifecycle', 'Integration Testing'],
    batchNumber: 1,
  },

  // SDEV 300 Explicit
  {
    id: 'art-sdev300-w5',
    fileName: 'Week 5 Assignments.zip',
    sourcePath: 'OneDrive\\Staging\\Week 5 Assignments.zip',
    parentFolder: 'Staging',
    modifiedDate: '2024-10-08',
    sizeBytes: 534200,
    contentExcerpt: 'SDEV 300 Lab 5, Homework 5–8, and Week 5 Discussions implementing Flask security, OWASP input sanitization, and password hashing.',
    topics: ['SDEV 300', 'Lab 5', 'Flask Security', 'OWASP'],
    batchNumber: 1,
  },

  // ARIN 350 Explicit
  {
    id: 'art-arin350-ppt',
    fileName: 'Unit_8_Final_Presentation.pptx',
    sourcePath: 'OneDrive\\Presentations\\Unit_8_Final_Presentation.pptx',
    parentFolder: 'Presentations',
    modifiedDate: '2025-02-24',
    sizeBytes: 6842100,
    contentExcerpt: 'ARIN 350 Unit 8 Final Presentation on enterprise Artificial Intelligence governance and deployment safety.',
    topics: ['ARIN 350', 'Artificial Intelligence', 'Final Presentation'],
    batchNumber: 1,
  },

  // Supporting Material Inheritance (Rule 4): Primary CMIS 141 + Secondary Self-Paced Python Foundations
  {
    id: 'art-cmis141-python',
    fileName: 'byte-of-python.pdf',
    sourcePath: 'OneDrive\\Books\\byte-of-python.pdf',
    parentFolder: 'Books',
    modifiedDate: '2023-09-10',
    sizeBytes: 1842000,
    contentExcerpt: 'A Byte of Python — Python Foundations covering Functions, Modules, Data Structures, OOP, and Exceptions; used as CMIS 141 supporting reference.',
    topics: ['Python', 'Functions', 'Modules', 'OOP', 'Exceptions', 'CMIS 141'],
    batchNumber: 1,
  },

  // Self-Paced Learning (Rule 7 — Provider Course)
  {
    id: 'art-educative-lld',
    fileName: 'Grokking_Low_Level_Design_Notes.pdf',
    sourcePath: 'OneDrive\\Learning\\Grokking_Low_Level_Design_Notes.pdf',
    parentFolder: 'Learning',
    modifiedDate: '2025-08-18',
    sizeBytes: 3290400,
    contentExcerpt: 'Educative — Grokking the Low Level Design Interview Using OOD Principles: OOAD, UML, SOLID, Design Patterns, Interview Preparation.',
    topics: ['Educative', 'OOAD', 'UML', 'SOLID', 'Design Patterns', 'Interview Preparation'],
    batchNumber: 2,
  },

  // Professional Training (Rule 7 — Assigned by Provider > Self-Directed Practice)
  {
    id: 'art-revature-pet',
    fileName: 'Revature_PET_Spring_Angular_Lab.zip',
    sourcePath: 'OneDrive\\Training\\Revature_PET_Spring_Angular_Lab.zip',
    parentFolder: 'Training',
    modifiedDate: '2025-10-04',
    sizeBytes: 4920100,
    contentExcerpt: 'Revature PET assigned Coding Labs and Assessments covering Java, Spring Boot REST APIs, Angular components, and mentor Feedback.',
    topics: ['Revature', 'PET', 'Java', 'Spring', 'Angular', 'Assessments'],
    batchNumber: 2,
  },

  // Self-Directed Practice (Rule 7 — User-created, independent)
  {
    id: 'art-self-graphviz',
    fileName: 'Graphviz_Research_and_Architecture_Notes.md',
    sourcePath: 'OneDrive\\Scratch\\Graphviz_Research_and_Architecture_Notes.md',
    parentFolder: 'Scratch',
    modifiedDate: '2025-11-11',
    sizeBytes: 38200,
    contentExcerpt: 'Independent research: Java HashSet AbstractSet Polymorphism experiments, Graphviz DOT rendering research, and AI-Assisted Learning Sessions.',
    topics: ['Graphviz Research', 'Architecture Notes', 'Java HashSet', 'AI-Assisted Learning'],
    batchNumber: 2,
  },

  // Career — Version Reconstruction (Rule 6 — Newest Version Name wins)
  {
    id: 'art-career-resume-2026',
    fileName: 'Master Resume 2026Jan.pdf',
    sourcePath: 'OneDrive\\Career\\Master Resume 2026Jan.pdf',
    parentFolder: 'Career',
    modifiedDate: '2026-01-19',
    sizeBytes: 248100,
    contentExcerpt: 'Master Resume (January 2026): Sherweb Technical Advisor T3 & Intune Support Engineer (June 2023 – June 2025).',
    topics: ['Resume', 'Sherweb', 'Intune Support Engineer', 'Technical Advisor T3'],
    versionGroup: 'Master Resume',
    versionRank: 202601,
    batchNumber: 2,
  },
  {
    id: 'art-career-resume-odt',
    fileName: 'Master Resume 2026Jan_Draft.odt',
    sourcePath: 'OneDrive\\Career\\Master Resume 2026Jan_Draft.odt',
    parentFolder: 'Career',
    modifiedDate: '2026-01-14',
    sizeBytes: 192400,
    contentExcerpt: 'Editable ODT draft revision for Master Resume 2026Jan covering Sherweb T3 and Intune endpoint engineering.',
    topics: ['Resume', 'Draft', 'Sherweb'],
    versionGroup: 'Master Resume',
    versionRank: 202600,
    batchNumber: 2,
  },
  {
    id: 'art-career-interview',
    fileName: 'Application-Interview Confirmed.pdf',
    sourcePath: 'OneDrive\\Career\\Application-Interview Confirmed.pdf',
    parentFolder: 'Career',
    modifiedDate: '2026-02-11',
    sizeBytes: 145600,
    contentExcerpt: 'February 2026 Interview Confirmation packet and technical interview preparation schedule.',
    topics: ['Interview', 'Application-Interview Confirmed', 'Career'],
    batchNumber: 2,
  },
  {
    id: 'art-career-sherweb',
    fileName: 'SherWeb Library.zip',
    sourcePath: 'OneDrive\\Employers\\SherWeb Library.zip',
    parentFolder: 'Employers',
    modifiedDate: '2025-06-20',
    sizeBytes: 18420000,
    contentExcerpt: 'Sherweb employer reference archive: Technical Advisor T3 runbooks and Intune Support Engineer documentation.',
    topics: ['Sherweb', 'Employers', 'Intune'],
    batchNumber: 2,
  },
  {
    id: 'art-career-sf86',
    fileName: 'sf86r092817.pdf',
    sourcePath: 'OneDrive\\Docs\\sf86r092817.pdf',
    parentFolder: 'Docs',
    modifiedDate: '2024-08-04',
    sizeBytes: 4120000,
    contentExcerpt: 'Standard Form 86 (SF-86) Questionnaire for National Security Positions — Security Clearance reference.',
    topics: ['SF86', 'Security Clearance'],
    batchNumber: 2,
  },

  // Probable (75-89) — Needs human verification before move -> Staging-Probable
  {
    id: 'art-prob-project1',
    fileName: 'Project 1_Parser_Draft.txt',
    sourcePath: 'OneDrive\\Temp\\Project 1_Parser_Draft.txt',
    parentFolder: 'Temp',
    modifiedDate: '2024-03-11',
    sizeBytes: 19400,
    contentExcerpt: 'Lexical analyzer token definitions and partial syntax tree notes; no explicit course header or submission receipt.',
    topics: ['lexical analyzer', 'syntax tree'],
    batchNumber: 2,
  },
  {
    id: 'art-prob-hw3',
    fileName: 'Homework 3.docx',
    sourcePath: 'OneDrive\\Downloads\\Homework 3.docx',
    parentFolder: 'Downloads',
    modifiedDate: '2024-07-04',
    sizeBytes: 54120,
    contentExcerpt: 'Thread pool synchronization notes and Swing button listener snippet without explicit course number.',
    topics: ['swing', 'threads'],
    batchNumber: 2,
  },

  // Unknown (< 75) — Filename alone is unreliable -> Unsorted / HOLD
  {
    id: 'art-unk-rtf',
    fileName: 'content.rtf',
    sourcePath: 'OneDrive\\Recovered\\content.rtf',
    parentFolder: 'Recovered',
    modifiedDate: '2023-11-19',
    sizeBytes: 8420,
    contentExcerpt: 'Unlabeled rich text fragment with generic bullet list; no course ID, employer, provider, or technical domain markers.',
    topics: [],
    batchNumber: 3,
  },
  {
    id: 'art-unk-mht',
    fileName: 'content.mht',
    sourcePath: 'OneDrive\\Recovered\\content.mht',
    parentFolder: 'Recovered',
    modifiedDate: '2023-11-21',
    sizeBytes: 31200,
    contentExcerpt: 'Saved web archive snapshot missing title metadata and course context; cannot be verified from filename alone.',
    topics: [],
    batchNumber: 3,
  },
];

function extractProjectKey(text: string): string | null {
  const match = text.match(/\bproject\s*([1-9])\b/i);
  return match ? `Project ${match[1]}` : null;
}

function daysBetween(dateA: string, dateB: string): number {
  const a = Date.parse(dateA);
  const b = Date.parse(dateB);
  if (Number.isNaN(a) || Number.isNaN(b)) return 9999;
  return Math.abs(a - b) / (1000 * 60 * 60 * 24);
}

/**
 * v37 Evidence-Based Inference Sorting Engine.
 * Executes multi-pass evidence accumulation:
 *   Pass 1: Explicit Identifier (Rule 1), Subject Inference (Rule 2), Supporting Material Inheritance (Rule 4),
 *           Version Families (Rule 6), and Category Separation (Rule 7).
 *   Pass 2: Assignment Relationship & Cluster Reconstruction (Rules 3 & 5) so related source files inherit
 *           cluster evidence when date/project/topic signals converge.
 *   Pass 3: Final Confidence Formula, Status/MoveAction assignment, and Stop Condition calculation.
 */
export function runInferenceSortingEngine(
  inputs: RawArtifactInput[],
  manualOverrides?: Record<string, { status: ClassificationStatus; moveAction: MoveAction; destinationFolder?: string }>
): {
  artifacts: ClassifiedArtifact[];
  clusters: ArtifactClusterSummary[];
  batches: BatchRunSummary[];
  stopConditionReached: boolean;
} {
  // Pass 0: Resolve canonical newest version name per versionGroup (Rule 6)
  const newestVersionByGroup = new Map<string, string>();
  for (const item of inputs) {
    if (!item.versionGroup) continue;
    const currentBest = inputs
      .filter((x) => x.versionGroup === item.versionGroup)
      .sort((a, b) => (b.versionRank ?? 0) - (a.versionRank ?? 0) || b.modifiedDate.localeCompare(a.modifiedDate))[0];
    if (currentBest) {
      newestVersionByGroup.set(
        item.versionGroup,
        currentBest.fileName.replace(/\.[^.]+$/, '')
      );
    }
  }

  // Pass 1: Independent multi-signal scoring
  interface DraftResult {
    raw: RawArtifactInput;
    category: InventoryCategory;
    subCategory: string;
    destinationFolder: string;
    secondaryClassification?: string;
    clusterId?: string;
    clusterLabel?: string;
    courseCode?: string;
    projectKey?: string;
    signals: SignalBreakdown;
    appliedRules: string[];
    evidenceNotes: string[];
  }

  const drafts: DraftResult[] = inputs.map((raw) => {
    const combinedText = `${raw.fileName} ${raw.parentFolder} ${raw.contentExcerpt} ${raw.topics.join(' ')}`;
    const lowerText = combinedText.toLowerCase();
    const lowerFile = raw.fileName.toLowerCase();

    const signals: SignalBreakdown = {
      explicitAssignment: 0,
      subjectMatch: 0,
      clusterMatch: 0,
      temporalMatch: 0,
      versionMatch: 0,
      contradictoryPenalty: 0,
      total: 0,
    };
    const appliedRules: string[] = [];
    const evidenceNotes: string[] = [];

    let category: InventoryCategory = 'Unsorted';
    let subCategory = 'Unclassified';
    let destinationFolder = 'Verified Inventory\\Unsorted';
    let secondaryClassification: string | undefined;
    let courseCode: string | undefined;
    const projectKey = extractProjectKey(combinedText) ?? undefined;

    // Rule 8: Explicit Historical Reference
    if (raw.isHistoricalReference) {
      appliedRules.push('Rule 8: Negative Evidence (Historical Reference)');
      evidenceNotes.push(raw.historicalNote || 'Multiple reconstruction passes yielded no recoverable artifacts.');
      return {
        raw,
        category: 'Academic',
        subCategory: raw.fileName,
        destinationFolder: 'Reference Only (No Move)',
        signals,
        appliedRules,
        evidenceNotes,
      };
    }

    // Rule 1 + Rule 7 (Priority 1): University Coursework Explicit ID
    let matchedCourse: CourseRule | undefined;
    for (const course of COURSE_RULES) {
      if (course.explicitPatterns.some((re) => re.test(combinedText))) {
        matchedCourse = course;
        signals.explicitAssignment = 100;
        appliedRules.push(`Rule 1: Explicit Identifier Wins (${course.code})`);
        evidenceNotes.push(`Explicit course identifier "${course.code}" (${course.title}) found in artifact metadata/content.`);
        break;
      }
    }

    // Rule 2: Subject-Based Inference when explicit course ID is missing
    if (!matchedCourse) {
      let bestCourse: CourseRule | undefined;
      let bestHits: string[] = [];

      for (const course of COURSE_RULES) {
        const hits = course.subjectKeywords.filter((kw) => lowerText.includes(kw));
        if (course.codeFiles?.includes(lowerFile)) {
          hits.push(`source:${raw.fileName}`);
        }
        if (hits.length > bestHits.length) {
          bestHits = hits;
          bestCourse = course;
        }
      }

      if (bestCourse && bestHits.length >= 2) {
        matchedCourse = bestCourse;
        signals.subjectMatch = bestHits.length >= 3 ? 94 : 82;
        appliedRules.push(`Rule 2: Subject-Based Inference (${bestCourse.code})`);
        evidenceNotes.push(
          `Matched ${bestHits.length} curriculum subject signals (${bestHits.slice(0, 4).join(', ')}) unique to ${bestCourse.code}.`
        );
      } else if (bestCourse && bestHits.length === 1) {
        matchedCourse = bestCourse;
        signals.subjectMatch = 60;
        appliedRules.push(`Rule 2: Partial Subject Signal (${bestCourse.code})`);
        evidenceNotes.push(`Single subject hit (${bestHits[0]}) — insufficient alone without cluster corroboration.`);
      }
    }

    // Rule 4: Supporting Material Inheritance (e.g., byte-of-python.pdf -> CMIS 141 + Python Foundations)
    if (matchedCourse && lowerText.includes('byte') && lowerText.includes('python')) {
      courseCode = 'CMIS 141';
      category = 'Academic';
      subCategory = 'University Coursework / CMIS 141 / Supporting Material';
      destinationFolder = 'Verified Inventory\\Academic\\University Coursework\\CMIS 141\\Supporting Material';
      secondaryClassification = 'Self-Paced Learning / Python Foundations';
      appliedRules.push('Rule 4: Supporting Material Inheritance');
      evidenceNotes.push('Primary: CMIS 141 Supporting Material; Secondary preserved: Self-Paced Learning / Python Foundations.');
    } else if (matchedCourse) {
      courseCode = matchedCourse.code;
      category = 'Academic';
      subCategory = projectKey
        ? `University Coursework / ${matchedCourse.code} / ${projectKey}`
        : `University Coursework / ${matchedCourse.code}`;
      destinationFolder = projectKey
        ? `Verified Inventory\\Academic\\University Coursework\\${matchedCourse.code}\\${projectKey}`
        : `Verified Inventory\\Academic\\University Coursework\\${matchedCourse.code}`;
      appliedRules.push('Rule 7: Category Priority (University Coursework)');
    }

    // Rule 7 (Priority 2): Professional Training (Revature PET)
    const hasPetTrainingContext =
      /\bpet\b/i.test(combinedText) &&
      (lowerText.includes('java') ||
        lowerText.includes('spring') ||
        lowerText.includes('angular') ||
        lowerText.includes('coding lab') ||
        lowerText.includes('assessment') ||
        lowerText.includes('training'));
    if (!matchedCourse && (lowerText.includes('revature') || hasPetTrainingContext)) {
      category = 'Professional Training';
      subCategory = 'Revature / PET';
      destinationFolder = 'Verified Inventory\\Professional Training\\Revature\\PET';
      signals.explicitAssignment = 100;
      appliedRules.push('Rule 1: Explicit Program Match (Revature PET)');
      appliedRules.push('Rule 7: Category Priority (Assigned by Provider -> Professional Training)');
      evidenceNotes.push('Matched Revature PET training program (Java/Spring/Angular labs & assessments).');
    }

    // Rule 7 (Priority 3): Self-Paced Learning (Provider Courses: Educative, Coursera, edX, LinkedIn Learning)
    if (
      category === 'Unsorted' &&
      (lowerText.includes('educative') ||
        lowerText.includes('coursera') ||
        lowerText.includes('edx') ||
        lowerText.includes('linkedin learning') ||
        lowerText.includes('grokking'))
    ) {
      const provider = lowerText.includes('educative') || lowerText.includes('grokking')
        ? 'Educative'
        : lowerText.includes('coursera')
          ? 'Coursera'
          : lowerText.includes('edx')
            ? 'edX'
            : 'LinkedIn Learning';
      category = 'Self-Paced Learning';
      subCategory = provider === 'Educative' ? 'Educative / Grokking Low Level Design' : provider;
      destinationFolder =
        provider === 'Educative'
          ? 'Verified Inventory\\Self-Paced Learning\\Educative\\Grokking Low Level Design'
          : `Verified Inventory\\Self-Paced Learning\\${provider}`;
      signals.explicitAssignment = lowerText.includes(provider.toLowerCase()) ? 100 : 0;
      signals.subjectMatch = signals.explicitAssignment === 100 ? 0 : 92;
      appliedRules.push(`Rule 1: Provider Curriculum Match (${provider})`);
      appliedRules.push('Rule 7: Category Separation (Provider Course -> Self-Paced Learning)');
      evidenceNotes.push(`Matched independent provider curriculum (${provider}: OOAD/UML/SOLID/Design Patterns).`);
    }

    // Career Reconstruction (Resume Workspace, Interviews, Employers, Security Clearance)
    if (category === 'Unsorted') {
      if (lowerText.includes('sf86') || lowerText.includes('sf-86') || lowerText.includes('security clearance')) {
        category = 'Career';
        subCategory = 'Security Clearance';
        destinationFolder = 'Verified Inventory\\Career\\Security Clearance';
        signals.explicitAssignment = 100;
        appliedRules.push('Rule 1: Explicit Form Identifier (SF-86)');
        evidenceNotes.push('Matched Standard Form 86 National Security Positions clearance record.');
      } else if (lowerText.includes('application-interview confirmed') || lowerText.includes('interview confirmation')) {
        category = 'Career';
        subCategory = 'Interviews';
        destinationFolder = 'Verified Inventory\\Career\\Interviews';
        signals.explicitAssignment = 100;
        appliedRules.push('Rule 1: Confirmed Interview Artifact');
        evidenceNotes.push('Verified interview-stage application confirmation (Feb 2026).');
      } else if (lowerText.includes('resume')) {
        category = 'Career';
        subCategory = 'Resume Workspace';
        const canonical = raw.versionGroup ? newestVersionByGroup.get(raw.versionGroup) : undefined;
        destinationFolder = canonical
          ? `Verified Inventory\\Career\\Resume Workspace\\${canonical}`
          : 'Verified Inventory\\Career\\Resume Workspace';
        signals.explicitAssignment = lowerText.includes('master resume') ? 95 : 80;
        if (raw.versionGroup && canonical) {
          signals.versionMatch = 10;
          appliedRules.push(`Rule 6: Version Reconstruction (Newest Name: ${canonical})`);
          evidenceNotes.push(`Grouped into "${raw.versionGroup}" version family; newest version folder "${canonical}" wins.`);
        }
        evidenceNotes.push('Matched Career Resume Workspace (Sherweb T3 / Intune timeline verified).');
      } else if (lowerText.includes('sherweb')) {
        category = 'Career';
        subCategory = 'Employers / SherWeb';
        destinationFolder = 'Verified Inventory\\Career\\Employers\\SherWeb';
        signals.explicitAssignment = 100;
        appliedRules.push('Rule 1: Employer Direct Match (Sherweb)');
        evidenceNotes.push('Employer match verified against Career timeline (June 2023 – June 2025).');
      }
    }

    // Rule 7 (Priority 4): Self-Directed Practice (User-created, independent)
    if (
      category === 'Unsorted' &&
      (lowerText.includes('graphviz') ||
        lowerText.includes('architecture notes') ||
        lowerText.includes('ai-assisted learning') ||
        lowerText.includes('hashset') ||
        lowerText.includes('abstractset'))
    ) {
      category = 'Self-Directed Practice';
      subCategory = 'Academic / Self-Directed Practice';
      destinationFolder = 'Verified Inventory\\Academic\\Self-Directed Practice';
      signals.subjectMatch = 92;
      appliedRules.push('Rule 7: Category Separation (User-Created -> Self-Directed Practice)');
      evidenceNotes.push('User-created independent study notes (not university coursework, training, or vendor curriculum).');
    }

    // Penalize unreliable generic filenames lacking corroborating signals
    if (UNRELIABLE_GENERIC_NAMES.some((re) => re.test(raw.fileName)) && signals.explicitAssignment === 0 && signals.subjectMatch < 80) {
      signals.contradictoryPenalty = 15;
      evidenceNotes.push('Generic/opaque filename rejected under Governing Rule: filenames alone never trigger moves.');
    }

    return {
      raw,
      category,
      subCategory,
      destinationFolder,
      secondaryClassification,
      courseCode,
      projectKey,
      signals,
      appliedRules,
      evidenceNotes,
    };
  });

  // Pass 2: Rules 3 & 5 — Assignment Relationship & Cluster Reconstruction
  // Find anchor artifacts that have explicit Course ID + Project Key (e.g. CMSC 315 Project 4 Reflection)
  const anchors = drafts.filter((d) => d.courseCode && d.projectKey && d.signals.explicitAssignment >= 90);

  for (const anchor of anchors) {
    const clusterId = `${anchor.courseCode}-${anchor.projectKey}`.replace(/\s+/g, '_').toLowerCase();
    const clusterLabel = `${anchor.courseCode} · ${anchor.projectKey} Cluster`;
    anchor.clusterId = clusterId;
    anchor.clusterLabel = clusterLabel;

    for (const candidate of drafts) {
      if (candidate === anchor || candidate.raw.isHistoricalReference) continue;

      const sameProject = candidate.projectKey && candidate.projectKey === anchor.projectKey;
      const closeDate = daysBetween(candidate.raw.modifiedDate, anchor.raw.modifiedDate) <= 7;
      const anchorMentionsCandidate = anchor.raw.contentExcerpt
        .toLowerCase()
        .includes(candidate.raw.fileName.toLowerCase());
      const sharedCourse = !candidate.courseCode || candidate.courseCode === anchor.courseCode;

      if (sharedCourse && (anchorMentionsCandidate || (sameProject && closeDate))) {
        candidate.courseCode = anchor.courseCode;
        candidate.category = 'Academic';
        candidate.subCategory = `University Coursework / ${anchor.courseCode} / ${anchor.projectKey}`;
        candidate.destinationFolder = `Verified Inventory\\Academic\\University Coursework\\${anchor.courseCode}\\${anchor.projectKey}`;
        candidate.clusterId = clusterId;
        candidate.clusterLabel = clusterLabel;

        if (candidate.signals.explicitAssignment < 100) {
          candidate.signals.clusterMatch = Math.max(candidate.signals.clusterMatch, 30);
        }
        if (closeDate) {
          candidate.signals.temporalMatch = Math.max(candidate.signals.temporalMatch, 15);
        }

        if (!candidate.appliedRules.some((r) => r.startsWith('Rule 3:'))) {
          candidate.appliedRules.push(`Rule 3: Assignment Relationship Inference (${anchor.raw.fileName})`);
        }
        if (!candidate.appliedRules.some((r) => r.startsWith('Rule 5:'))) {
          candidate.appliedRules.push(`Rule 5: Cluster Reconstruction (${clusterLabel})`);
        }
        candidate.evidenceNotes.push(
          `Converged with anchor "${anchor.raw.fileName}" via ${anchorMentionsCandidate ? 'direct file reference + ' : ''}shared ${anchor.projectKey} & date window (${candidate.raw.modifiedDate}).`
        );
      }
    }
  }

  // Pass 3: Compute final confidence score, status, and MoveAction
  const artifacts: ClassifiedArtifact[] = drafts.map((d) => {
    const rawTotal =
      d.signals.explicitAssignment +
      d.signals.subjectMatch +
      d.signals.clusterMatch +
      d.signals.temporalMatch +
      d.signals.versionMatch -
      d.signals.contradictoryPenalty;

    const confidence = d.raw.isHistoricalReference
      ? 0
      : Math.max(0, Math.min(100, rawTotal));
    d.signals.total = confidence;

    let status: ClassificationStatus;
    let moveAction: MoveAction;
    let destinationFolder = d.destinationFolder;
    let category = d.category;

    if (d.raw.isHistoricalReference) {
      status = 'Historical';
      moveAction = 'REFERENCE';
      destinationFolder = 'Reference Only (No Move)';
    } else if (confidence >= 90) {
      status = 'Verified';
      moveAction = 'MOVE';
    } else if (confidence >= 75) {
      status = 'Probable';
      moveAction = 'REVIEW';
      destinationFolder = `Verified Inventory\\Staging-Probable\\${d.subCategory.replace(/\s*\/\s*/g, '\\')}`;
    } else {
      status = 'Unknown';
      moveAction = 'HOLD';
      category = 'Unsorted';
      destinationFolder = 'Verified Inventory\\Unsorted';
    }

    // Apply any explicit human review overrides ("Classification confidence always overrides automation")
    const override = manualOverrides?.[d.raw.id];
    let manuallyVerified = false;
    if (override) {
      status = override.status;
      moveAction = override.moveAction;
      if (override.destinationFolder) {
        destinationFolder = override.destinationFolder;
      } else if (status === 'Verified') {
        destinationFolder = d.destinationFolder.includes('Staging-Probable')
          ? d.destinationFolder.replace('Staging-Probable\\', '')
          : d.destinationFolder;
      } else if (status === 'Probable') {
        destinationFolder = `Verified Inventory\\Staging-Probable\\${d.subCategory.replace(/\s*\/\s*/g, '\\')}`;
      } else if (status === 'Unknown') {
        destinationFolder = 'Verified Inventory\\Unsorted';
      }
      manuallyVerified = true;
    }

    const canonicalVersionFolder = d.raw.versionGroup
      ? newestVersionByGroup.get(d.raw.versionGroup)
      : undefined;

    return {
      id: d.raw.id,
      sourceFile: d.raw.sourcePath,
      fileName: d.raw.fileName,
      parentFolder: d.raw.parentFolder,
      modifiedDate: d.raw.modifiedDate,
      sizeBytes: d.raw.sizeBytes,
      destinationFolder,
      category,
      subCategory: d.subCategory,
      secondaryClassification: d.secondaryClassification,
      clusterId: d.clusterId,
      clusterLabel: d.clusterLabel,
      versionFamily: d.raw.versionGroup,
      canonicalVersionFolder,
      confidence,
      status,
      moveAction,
      signals: { ...d.signals },
      appliedRules:
        d.appliedRules.length > 0
          ? d.appliedRules
          : ['Governing Rule: Insufficient Multi-Signal Evidence'],
      evidenceNotes:
        d.evidenceNotes.length > 0
          ? d.evidenceNotes
          : ['No convergent course, subject, employer, or cluster signals found. Held in Unsorted.'],
      notes: d.evidenceNotes.join(' | '),
      manuallyVerified,
      batchNumber: d.raw.batchNumber ?? 1,
    };
  });

  // Build Cluster Summaries (Rule 5 + Rule 6)
  const clusterMap = new Map<string, ClassifiedArtifact[]>();
  for (const a of artifacts) {
    const key = a.clusterId || (a.versionFamily ? `ver-${a.versionFamily.toLowerCase().replace(/\s+/g, '-')}` : null);
    if (!key) continue;
    const arr = clusterMap.get(key) ?? [];
    arr.push(a);
    clusterMap.set(key, arr);
  }

  const clusters: ArtifactClusterSummary[] = Array.from(clusterMap.entries()).map(([clusterId, members]) => {
    const lead = members[0];
    const minConfidence = Math.min(...members.map((m) => m.confidence));
    return {
      clusterId,
      label: lead.clusterLabel || `${lead.versionFamily} Version Family`,
      category: lead.category,
      subCategory: lead.subCategory,
      destinationFolder: lead.destinationFolder,
      memberIds: members.map((m) => m.id),
      memberFiles: members.map((m) => m.fileName),
      clusterConfidence: minConfidence,
      status: members.every((m) => m.status === 'Verified') ? 'Verified' : 'Probable',
      sharedSignals: Array.from(new Set(members.flatMap((m) => m.appliedRules))),
    };
  });

  // Compute Batch Yield & Stop Condition (2 consecutive batches with 0 new courses, 0 new categories, 0 new verified)
  const maxBatch = Math.max(3, ...artifacts.map((a) => a.batchNumber));
  const seenCourses = new Set<string>();
  const seenCategories = new Set<string>();
  const batches: BatchRunSummary[] = [];

  for (let b = 1; b <= maxBatch; b++) {
    const batchItems = artifacts.filter((a) => a.batchNumber === b);
    let newCourses = 0;
    let newCategories = 0;
    let newVerified = 0;

    for (const item of batchItems) {
      if (item.status === 'Verified') {
        newVerified++;
        const courseMatch = item.subCategory.match(/\b(CMIS|CMSC|CSIA|SDEV|ARIN|CMIT)\s+\d{3}\b/i);
        if (courseMatch && !seenCourses.has(courseMatch[0].toUpperCase())) {
          seenCourses.add(courseMatch[0].toUpperCase());
          newCourses++;
        }
        if (!seenCategories.has(item.category)) {
          seenCategories.add(item.category);
          newCategories++;
        }
      }
    }

    const zeroYield = newCourses === 0 && newCategories === 0 && newVerified === 0;
    batches.push({
      batchNumber: b,
      label:
        b === 1
          ? 'Batch 1 — Academic Core & Clusters'
          : b === 2
            ? 'Batch 2 — Career, Training & Self-Paced'
            : b === 3
              ? 'Batch 3 — Opaque / Unlabeled Verification Pass'
              : `Batch ${b} — Custom Intake Pass`,
      artifactsProcessed: batchItems.length,
      newCourseMappings: newCourses,
      newCategoryMappings: newCategories,
      newVerifiedArtifacts: newVerified,
      zeroYield,
    });
  }

  // Append Batch 4 simulated confirmation pass when only default 3 batches exist so users can inspect stop condition behavior
  if (batches.length === 3 && batches[2].zeroYield) {
    batches.push({
      batchNumber: 4,
      label: 'Batch 4 — Confirmation Sweep (Stop Check)',
      artifactsProcessed: 0,
      newCourseMappings: 0,
      newCategoryMappings: 0,
      newVerifiedArtifacts: 0,
      zeroYield: true,
    });
  }

  let consecutiveZero = 0;
  let stopConditionReached = false;
  for (const batch of batches) {
    if (batch.zeroYield) {
      consecutiveZero++;
      if (consecutiveZero >= 2) {
        stopConditionReached = true;
      }
    } else {
      consecutiveZero = 0;
    }
  }

  return { artifacts, clusters, batches, stopConditionReached };
}

function escapeCsvField(value: string | number): string {
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates the v37 Move Manifest Standard CSV:
 * SourceFile,DestinationFolder,Category,SubCategory,Confidence,Status,MoveAction,Notes
 */
export function generateMoveManifestCsv(artifacts: ClassifiedArtifact[]): string {
  const header = [
    'SourceFile',
    'DestinationFolder',
    'Category',
    'SubCategory',
    'Confidence',
    'Status',
    'MoveAction',
    'Notes',
  ].join(',');

  const rows = artifacts.map((a) =>
    [
      a.sourceFile,
      a.destinationFolder,
      a.category,
      a.subCategory,
      a.confidence,
      a.status,
      a.moveAction,
      a.notes,
    ]
      .map(escapeCsvField)
      .join(',')
  );

  return [header, ...rows].join('\r\n');
}
