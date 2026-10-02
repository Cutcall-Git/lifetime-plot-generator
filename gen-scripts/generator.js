const movie = document.querySelector("#movie");
const generate = document.querySelector("#generate");

const pick = pool => pool[Math.floor(Math.random() * pool.length)];

function resolve(value) {
  if (typeof value === "number") return value;
  return Math.floor(Math.random() * (value.max - value.min + 1)) + value.min;
}

function ageBand(age) {
  if (age < 50) return "45-49";
  if (age < 60) return "50-59";
  return "60-75";
}

function buildPool(characters, gravity, counts) {
  return characters.flatMap(type => {
    const weights = gravity[type];
    const count = counts[type] ?? 0;
    const copies = weights[count] ?? 0;
    return Array(copies).fill(type);
  });
}

function generateSecondaries(schema) {
  const target = pick(schema.population);
  const counts = Object.fromEntries(schema.characters.map(type => [type, 0]));

  for (let population = 0; population < target; population++) {
    const pool = buildPool(schema.characters, schema.gravity, counts);
    if (!pool.length) break;
    counts[pick(pool)]++;
  }

  return counts;
}

function describeSecondaries(counts) {
  return Object.entries(counts)
    .filter(([, count]) => count)
    .map(([type, count]) => `${count} ${type.replaceAll("_", " ")}${count > 1 ? "s" : ""}`)
    .join(", ");
}

async function generateMovie() {
  const [primitives, secondary] = await Promise.all([
    fetch("gen-jsons/plot-primitives.json").then(response => response.json()),
    fetch("gen-jsons/secondary-characters.json").then(response => response.json())
  ]);

  const protagonistAge = resolve(pick(primitives.protagonist.age));
  const season = pick(primitives.season);
  const protagonistRelationship = pick(primitives.relationship);

  const relation = pick(primitives.male_counterpart.age_adjusters[ageBand(protagonistAge)]);
  const maleAge = protagonistAge + resolve(primitives.male_counterpart.age_offsets[relation]);
  const maleRelationship = pick(primitives.relationship);

  const protagonistSecondaries = generateSecondaries(secondary.protagonist);
  const maleSecondaries = generateSecondaries(secondary.male_counterpart);

  movie.innerHTML = `
    <p><strong>Protagonist:</strong> female, ${protagonistAge}, ${protagonistRelationship.replaceAll("_", " ")}</p>
    <p><strong>Her people:</strong> ${describeSecondaries(protagonistSecondaries)}</p>
    <p><strong>Male counterpart:</strong> ${maleAge}, ${relation.replaceAll("_", " ")}, ${maleRelationship.replaceAll("_", " ")}</p>
    <p><strong>His responsibility:</strong> ${describeSecondaries(maleSecondaries)}</p>
    <p><strong>Season:</strong> ${season.replaceAll("_", " ")}</p>
  `;
}

generate.addEventListener("click", generateMovie);
