import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const statements = [
  `PRAGMA foreign_keys = ON`,
  `CREATE TABLE IF NOT EXISTS Project (
    id TEXT NOT NULL PRIMARY KEY,
    title TEXT NOT NULL,
    genre TEXT NOT NULL,
    keywords TEXT NOT NULL,
    targetWordCount INTEGER NOT NULL,
    pov TEXT NOT NULL,
    endingPreference TEXT NOT NULL,
    emotionalTone TEXT NOT NULL,
    originalIdea TEXT NOT NULL,
    forbiddenItems TEXT NOT NULL DEFAULT '',
    currentStage TEXT NOT NULL DEFAULT 'idea',
    selectedDirectionId TEXT,
    previousSummary TEXT NOT NULL DEFAULT '',
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    archivedAt DATETIME
  )`,
  `CREATE TABLE IF NOT EXISTS LLMSettings (
    id TEXT NOT NULL PRIMARY KEY,
    providerName TEXT NOT NULL DEFAULT 'OpenAI Compatible',
    apiMode TEXT NOT NULL DEFAULT 'chat_completions',
    reasoningEffort TEXT NOT NULL DEFAULT 'high',
    baseUrl TEXT NOT NULL,
    apiKeyEncrypted TEXT NOT NULL,
    model TEXT NOT NULL,
    temperature REAL NOT NULL DEFAULT 0.7,
    maxTokens INTEGER NOT NULL DEFAULT 4000,
    timeout INTEGER NOT NULL DEFAULT 180000,
    streamEnabled BOOLEAN NOT NULL DEFAULT false,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS StoryDirection (
    id TEXT NOT NULL PRIMARY KEY,
    projectId TEXT NOT NULL,
    title TEXT NOT NULL,
    logline TEXT NOT NULL,
    openingHook TEXT NOT NULL,
    coreConflict TEXT NOT NULL,
    protagonistDilemma TEXT NOT NULL,
    mainTwist TEXT NOT NULL,
    emotionalValue TEXT NOT NULL,
    targetReaders TEXT NOT NULL,
    commercialScore INTEGER NOT NULL,
    risk TEXT NOT NULL,
    recommendationReason TEXT NOT NULL,
    readerFeedbackJson TEXT NOT NULL DEFAULT '{}',
    logicFeedbackJson TEXT NOT NULL DEFAULT '{}',
    chiefDecisionJson TEXT NOT NULL DEFAULT '{}',
    selected BOOLEAN NOT NULL DEFAULT false,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT StoryDirection_projectId_fkey FOREIGN KEY (projectId) REFERENCES Project (id) ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS HookPackage (
    id TEXT NOT NULL PRIMARY KEY,
    projectId TEXT NOT NULL,
    titlesJson TEXT NOT NULL,
    loglinesJson TEXT NOT NULL,
    openingHooksJson TEXT NOT NULL,
    openingSamplesJson TEXT NOT NULL,
    readerReviewJson TEXT NOT NULL DEFAULT '{}',
    emotionReviewJson TEXT NOT NULL DEFAULT '{}',
    chiefDecisionJson TEXT NOT NULL DEFAULT '{}',
    selectedTitle TEXT,
    selectedLogline TEXT,
    selectedHook TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT HookPackage_projectId_fkey FOREIGN KEY (projectId) REFERENCES Project (id) ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS Character (
    id TEXT NOT NULL PRIMARY KEY,
    projectId TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    identity TEXT NOT NULL,
    surfaceGoal TEXT NOT NULL,
    trueDesire TEXT NOT NULL,
    weakness TEXT NOT NULL,
    secret TEXT NOT NULL,
    relationshipToProtagonist TEXT NOT NULL,
    plotFunction TEXT NOT NULL,
    turningPoint TEXT NOT NULL,
    ending TEXT NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT Character_projectId_fkey FOREIGN KEY (projectId) REFERENCES Project (id) ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS Outline (
    id TEXT NOT NULL PRIMARY KEY,
    projectId TEXT NOT NULL,
    storyArc TEXT NOT NULL,
    outlineJson TEXT NOT NULL,
    conflictEscalation TEXT NOT NULL,
    emotionalCurveJson TEXT NOT NULL,
    rawJson TEXT NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT Outline_projectId_fkey FOREIGN KEY (projectId) REFERENCES Project (id) ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS SceneCard (
    id TEXT NOT NULL PRIMARY KEY,
    projectId TEXT NOT NULL,
    orderIndex INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'unwritten',
    title TEXT NOT NULL,
    goal TEXT NOT NULL,
    charactersJson TEXT NOT NULL,
    location TEXT NOT NULL,
    conflict TEXT NOT NULL,
    informationGain TEXT NOT NULL,
    emotionalShift TEXT NOT NULL,
    mustIncludeJson TEXT NOT NULL,
    foreshadowingJson TEXT NOT NULL,
    payoff TEXT NOT NULL,
    forbiddenJson TEXT NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT SceneCard_projectId_fkey FOREIGN KEY (projectId) REFERENCES Project (id) ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS DraftSegment (
    id TEXT NOT NULL PRIMARY KEY,
    projectId TEXT NOT NULL,
    sceneCardId TEXT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    wordCount INTEGER NOT NULL DEFAULT 0,
    reviewJson TEXT NOT NULL DEFAULT '{}',
    chiefDecisionJson TEXT NOT NULL DEFAULT '{}',
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT DraftSegment_projectId_fkey FOREIGN KEY (projectId) REFERENCES Project (id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT DraftSegment_sceneCardId_fkey FOREIGN KEY (sceneCardId) REFERENCES SceneCard (id) ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS DraftVersion (
    id TEXT NOT NULL PRIMARY KEY,
    segmentId TEXT NOT NULL,
    content TEXT NOT NULL,
    reason TEXT NOT NULL,
    createdByAgent TEXT NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT DraftVersion_segmentId_fkey FOREIGN KEY (segmentId) REFERENCES DraftSegment (id) ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS AgentRun (
    id TEXT NOT NULL PRIMARY KEY,
    projectId TEXT,
    workflowType TEXT NOT NULL,
    agentName TEXT NOT NULL,
    inputJson TEXT NOT NULL,
    outputJson TEXT,
    rawOutput TEXT,
    status TEXT NOT NULL,
    error TEXT,
    model TEXT,
    durationMs INTEGER,
    tokenUsage TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT AgentRun_projectId_fkey FOREIGN KEY (projectId) REFERENCES Project (id) ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS ReviewReport (
    id TEXT NOT NULL PRIMARY KEY,
    projectId TEXT NOT NULL,
    workflowType TEXT NOT NULL,
    targetType TEXT NOT NULL,
    targetId TEXT,
    scoresJson TEXT NOT NULL,
    summary TEXT NOT NULL,
    detailsJson TEXT NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ReviewReport_projectId_fkey FOREIGN KEY (projectId) REFERENCES Project (id) ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS StoryBible (
    id TEXT NOT NULL PRIMARY KEY,
    projectId TEXT NOT NULL,
    previousSummary TEXT NOT NULL DEFAULT '',
    happenedEvents TEXT NOT NULL DEFAULT '[]',
    revealedSecrets TEXT NOT NULL DEFAULT '[]',
    unrevealedSecrets TEXT NOT NULL DEFAULT '[]',
    openForeshadowing TEXT NOT NULL DEFAULT '[]',
    resolvedForeshadowing TEXT NOT NULL DEFAULT '[]',
    characterStates TEXT NOT NULL DEFAULT '{}',
    timeline TEXT NOT NULL DEFAULT '[]',
    rawJson TEXT NOT NULL DEFAULT '{}',
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT StoryBible_projectId_fkey FOREIGN KEY (projectId) REFERENCES Project (id) ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS StoryBible_projectId_key ON StoryBible(projectId)`,
  `CREATE TABLE IF NOT EXISTS Foreshadowing (
    id TEXT NOT NULL PRIMARY KEY,
    projectId TEXT NOT NULL,
    clue TEXT NOT NULL,
    setupScene TEXT NOT NULL,
    payoffScene TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    note TEXT NOT NULL DEFAULT '',
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT Foreshadowing_projectId_fkey FOREIGN KEY (projectId) REFERENCES Project (id) ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS Twist (
    id TEXT NOT NULL PRIMARY KEY,
    projectId TEXT NOT NULL,
    title TEXT NOT NULL,
    setup TEXT NOT NULL,
    reveal TEXT NOT NULL,
    impact TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'planned',
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT Twist_projectId_fkey FOREIGN KEY (projectId) REFERENCES Project (id) ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS ExportFile (
    id TEXT NOT NULL PRIMARY KEY,
    projectId TEXT NOT NULL,
    type TEXT NOT NULL,
    fileName TEXT NOT NULL,
    path TEXT NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ExportFile_projectId_fkey FOREIGN KEY (projectId) REFERENCES Project (id) ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS LocalJob (
    id TEXT NOT NULL PRIMARY KEY,
    projectId TEXT,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    payloadJson TEXT NOT NULL,
    resultJson TEXT,
    error TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    startedAt DATETIME,
    finishedAt DATETIME,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT LocalJob_projectId_fkey FOREIGN KEY (projectId) REFERENCES Project (id) ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS Project_archivedAt_idx ON Project(archivedAt)`,
  `CREATE INDEX IF NOT EXISTS StoryDirection_projectId_idx ON StoryDirection(projectId)`,
  `CREATE INDEX IF NOT EXISTS HookPackage_projectId_idx ON HookPackage(projectId)`,
  `CREATE INDEX IF NOT EXISTS Character_projectId_idx ON Character(projectId)`,
  `CREATE INDEX IF NOT EXISTS Outline_projectId_idx ON Outline(projectId)`,
  `CREATE INDEX IF NOT EXISTS SceneCard_projectId_orderIndex_idx ON SceneCard(projectId, orderIndex)`,
  `CREATE INDEX IF NOT EXISTS DraftSegment_projectId_idx ON DraftSegment(projectId)`,
  `CREATE INDEX IF NOT EXISTS DraftVersion_segmentId_idx ON DraftVersion(segmentId)`,
  `CREATE INDEX IF NOT EXISTS AgentRun_projectId_createdAt_idx ON AgentRun(projectId, createdAt)`,
  `CREATE INDEX IF NOT EXISTS ReviewReport_projectId_idx ON ReviewReport(projectId)`,
  `CREATE INDEX IF NOT EXISTS Foreshadowing_projectId_idx ON Foreshadowing(projectId)`,
  `CREATE INDEX IF NOT EXISTS Twist_projectId_idx ON Twist(projectId)`,
  `CREATE INDEX IF NOT EXISTS ExportFile_projectId_idx ON ExportFile(projectId)`,
  `CREATE INDEX IF NOT EXISTS LocalJob_projectId_status_idx ON LocalJob(projectId, status)`,
];

async function main() {
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
  await ensureColumn("LLMSettings", "apiMode", "TEXT NOT NULL DEFAULT 'chat_completions'");
  await ensureColumn("LLMSettings", "reasoningEffort", "TEXT NOT NULL DEFAULT 'high'");
  console.log("SQLite tables are ready.");
}

async function ensureColumn(table: string, column: string, definition: string) {
  const columns = (await prisma.$queryRawUnsafe(`PRAGMA table_info(${table})`)) as Array<{
    name: string;
  }>;
  if (!columns.some((item) => item.name === column)) {
    await prisma.$executeRawUnsafe(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
