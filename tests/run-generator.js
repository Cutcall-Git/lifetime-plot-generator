const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RUNS = 1000;
const root = path.resolve(__dirname, "..");
const resultsDirectory = path.join(__dirname, "results-txt");
const resultsPath = path.join(resultsDirectory, "generator-results.txt");
const generatorPath = path.join(root, "gen-scripts", "generator.js");

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(root, "gen-jsons", fileName), "utf8"));
}

const jsonFiles = {
  "gen-jsons/plot-primitives.json": readJson("plot-primitives.json"),
  "gen-jsons/secondary-characters.json": readJson("secondary-characters.json"),
  "gen-jsons/location-primitives.json": readJson("location-primitives.json"),
  "gen-jsons/settings.json": readJson("settings.json")
};

let generateMovie;
const movie = { innerHTML: "" };
const generateButton = {
  addEventListener(eventName, handler) {
    if (eventName === "click") generateMovie = handler;
  }
};

const context = vm.createContext({
  document: {
    querySelector(selector) {
      return selector === "#movie" ? movie : generateButton;
    }
  },
  fetch(fileName) {
    return Promise.resolve({
      json: () => Promise.resolve(jsonFiles[fileName])
    });
  }
});

vm.runInContext(fs.readFileSync(generatorPath, "utf8"), context, {
  filename: generatorPath
});

if (!generateMovie) {
  throw new Error("Could not find the generator click handler.");
}

const counts = {
  protagonistAge: new Map(),
  protagonistRelationship: new Map(),
  maleAgeRelation: new Map(),
  maleRelationship: new Map(),
  season: new Map(),
  protagonistSecondaries: new Map(),
  maleSecondaries: new Map(),
  friendRole: new Map(),
  friendSex: new Map(),
  friendOrientation: new Map(),
  locationTrajectory: new Map(),
  locationPrimitive: new Map(),
  setting: new Map(),
  settingByPrimitive: new Map(),
  settingTrajectory: new Map(),
  horseCount: new Map(),
  retrieverCount: new Map(),
  horseLocations: new Map(),
  retrieverLocations: new Map()
};

function addCount(outcomes, outcome, amount = 1) {
  outcomes.set(outcome, (outcomes.get(outcome) || 0) + amount);
}

function formatCounts(title, outcomes) {
  return [
    title,
    ...Array.from(outcomes, ([outcome, count]) => `  ${outcome}: ${count}`)
  ].join("\n");
}

function htmlToText(html) {
  return html
    .replace(/<\/p>\s*/g, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function parseSecondaries(line) {
  const counts = {};
  const outcomes = line.replace(/^[^:]+: /, "");
  if (!outcomes) return counts;

  for (const outcome of outcomes.split(", ")) {
    const match = outcome.match(/^(\d+) (.+?)(s?)$/);
    if (!match) throw new Error(`Unexpected secondary output: ${outcome}`);
    counts[match[2]] = Number(match[1]);
  }

  return counts;
}

function countSecondaries(secondaries, target) {
  for (const [type, count] of Object.entries(secondaries)) {
    addCount(target, type, count);
  }
}

function parsePath(line, prefix, valueName) {
  return line.replace(prefix, "").split(" → ").map(part => {
    const match = part.match(/^([ABC]): (.+)$/);
    if (!match) throw new Error(`Unexpected ${valueName} output: ${part}`);
    return { label: match[1], [valueName]: match[2] };
  });
}

function countPlot(plot) {
  const lines = plot.split("\n");
  const protagonist = lines[0].match(/^Protagonist: female, (\d+), (.+)$/);
  const friendLine = lines.find(line => line.startsWith("Her friends:"));
  const maleLine = lines.find(line => line.startsWith("Male counterpart:"));
  const responsibilityLine = lines.find(line => line.startsWith("His responsibility:"));
  const seasonLine = lines.find(line => line.startsWith("Season:"));
  const locationLine = lines.find(line => line.startsWith("Location trajectory:"));
  const settingLine = lines.find(line => line.startsWith("Settings:"));
  const maleCounterpart = maleLine?.match(/^Male counterpart: (\d+), ([^,]+), (.+)$/);

  if (!protagonist || !maleCounterpart || !responsibilityLine || !seasonLine || !locationLine || !settingLine) {
    throw new Error(`Unexpected plot output:\n${plot}`);
  }

  addCount(counts.protagonistAge, protagonist[1]);
  addCount(counts.protagonistRelationship, protagonist[2]);
  addCount(counts.maleAgeRelation, maleCounterpart[2]);
  addCount(counts.maleRelationship, maleCounterpart[3]);
  addCount(counts.season, seasonLine.replace("Season: ", ""));

  const protagonistSecondaries = parseSecondaries(lines[1]);
  const maleSecondaries = parseSecondaries(responsibilityLine);
  countSecondaries(protagonistSecondaries, counts.protagonistSecondaries);
  countSecondaries(maleSecondaries, counts.maleSecondaries);

  if (friendLine) {
    for (const friend of friendLine.replace("Her friends: ", "").split(", ")) {
      const match = friend.match(/^(gay|straight) (male|female) (.+)$/);
      if (!match) throw new Error(`Unexpected friend output: ${friend}`);
      addCount(counts.friendOrientation, match[1]);
      addCount(counts.friendSex, match[2]);
      addCount(counts.friendRole, match[3]);
    }
  }

  const locations = parsePath(locationLine, "Location trajectory: ", "primitive");
  const settings = parsePath(settingLine, "Settings: ", "setting");
  const trajectory = locations.map(location => location.label).join("-");
  addCount(counts.locationTrajectory, trajectory);

  const uniqueLocations = new Map();
  const uniqueSettings = new Map();

  for (const item of locations) uniqueLocations.set(item.label, item.primitive);
  for (const item of settings) uniqueSettings.set(item.label, item.setting);

  for (const [label, primitive] of uniqueLocations) {
    const setting = uniqueSettings.get(label);
    addCount(counts.locationPrimitive, primitive);
    addCount(counts.setting, setting);
    addCount(counts.settingByPrimitive, `${primitive}: ${setting}`);
  }

  addCount(
    counts.settingTrajectory,
    settings.map(item => item.setting).join(" → ")
  );

  const horseCount = (protagonistSecondaries.horse || 0) + (maleSecondaries.horse || 0);
  const retrieverCount = (protagonistSecondaries.retriever || 0) + (maleSecondaries.retriever || 0);
  addCount(counts.horseCount, String(horseCount));
  addCount(counts.retrieverCount, String(retrieverCount));

  const primitivePath = locations.map(item => item.primitive).join(" → ");
  if (horseCount) addCount(counts.horseLocations, `${horseCount} horse: ${primitivePath}`);
  if (retrieverCount) addCount(counts.retrieverLocations, `${retrieverCount} retriever: ${primitivePath}`);
}

const plots = [];

async function run() {
  for (let runNumber = 1; runNumber <= RUNS; runNumber++) {
    await generateMovie();

    const plot = htmlToText(movie.innerHTML);
    countPlot(plot);
    plots.push(`Run ${runNumber}\n${plot}`);
  }

  const output = [
    "Generator test results",
    `Runs: ${RUNS}`,
    "",
    "Outcome counts",
    formatCounts("Protagonist ages", counts.protagonistAge),
    formatCounts("Protagonist relationships", counts.protagonistRelationship),
    formatCounts("Male age relationships", counts.maleAgeRelation),
    formatCounts("Male relationships", counts.maleRelationship),
    formatCounts("Seasons", counts.season),
    formatCounts("Protagonist secondary characters", counts.protagonistSecondaries),
    formatCounts("Male secondary characters", counts.maleSecondaries),
    formatCounts("Friend roles", counts.friendRole),
    formatCounts("Friend sex", counts.friendSex),
    formatCounts("Friend orientation", counts.friendOrientation),
    formatCounts("Location trajectories", counts.locationTrajectory),
    formatCounts("Unique location primitives", counts.locationPrimitive),
    formatCounts("Settings", counts.setting),
    formatCounts("Settings by location primitive", counts.settingByPrimitive),
    formatCounts("Setting trajectories", counts.settingTrajectory),
    formatCounts("Movie horse counts", counts.horseCount),
    formatCounts("Movie retriever counts", counts.retrieverCount),
    "",
    "Animal geography",
    formatCounts("Horse location paths", counts.horseLocations),
    formatCounts("Retriever location paths", counts.retrieverLocations),
    "",
    "Generated plots",
    plots.join("\n\n"),
    ""
  ].join("\n");

  fs.mkdirSync(resultsDirectory, { recursive: true });
  fs.writeFileSync(resultsPath, output);
  console.log(`Wrote ${resultsPath}`);
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
