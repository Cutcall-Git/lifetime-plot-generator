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
  "gen-jsons/secondary-characters.json": readJson("secondary-characters.json")
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
  maleSecondaries: new Map()
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

function countPlot(plot) {
  const lines = plot.split("\n");
  const protagonist = lines[0].match(/^Protagonist: female, (\d+), (.+)$/);
  const maleCounterpart = lines[2].match(/^Male counterpart: (\d+), ([^,]+), (.+)$/);

  if (!protagonist || !maleCounterpart) {
    throw new Error(`Unexpected plot output:\n${plot}`);
  }

  addCount(counts.protagonistAge, protagonist[1]);
  addCount(counts.protagonistRelationship, protagonist[2]);
  addCount(counts.maleAgeRelation, maleCounterpart[2]);
  addCount(counts.maleRelationship, maleCounterpart[3]);
  addCount(counts.season, lines[4].replace("Season: ", ""));

  for (const line of [lines[1], lines[3]]) {
    const outcomes = line.replace(/^[^:]+: /, "");

    if (!outcomes) continue;

    for (const outcome of outcomes.split(", ")) {
      const match = outcome.match(/^(\d+) (.+?)(s?)$/);

      if (!match) throw new Error(`Unexpected secondary output: ${outcome}`);

      const target = line.startsWith("Her people:")
        ? counts.protagonistSecondaries
        : counts.maleSecondaries;
      addCount(target, match[2], Number(match[1]));
    }
  }
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
