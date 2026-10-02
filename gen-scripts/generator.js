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

function secondaryAgeBand(age) {
  if (age < 50) return "45-49";
  if (age < 60) return "50-59";
  if (age < 70) return "60-69";
  return "70-75";
}

function buildPool(characters, gravity, counts, representation = {}) {
  return characters.flatMap(type => {
    const weights = gravity[type];
    const count = counts[type] ?? 0;
    const copies = weights[count] ?? 0;
    const represented = representation[type] ?? 1;
    return Array(copies * represented).fill(type);
  });
}

function generateSecondaries(schema, representation = {}) {
  const target = pick(schema.population);
  const counts = Object.fromEntries(schema.characters.map(type => [type, 0]));

  for (let population = 0; population < target; population++) {
    const pool = buildPool(schema.characters, schema.gravity, counts);
    if (schema.age_representation) {
      const representedPool = buildPool(schema.characters, schema.gravity, counts, representation);
      if (!representedPool.length) break;
      counts[pick(representedPool)]++;
    } else {
      if (!pool.length) break;
      counts[pick(pool)]++;
    }
  }

  return counts;
}

function generateFriends(count, schema) {
  return Array.from({ length: count }, () => {
    const role = pick(schema.roles);
    const sex = pick(schema.sex);
    const orientation = pick(schema.orientation[sex]);
    return { role, sex, orientation };
  });
}

function locationLabels(trajectory) {
  return [...new Set(trajectory.split("-"))];
}

function buildLocationPool(schema, animalCounts, allowed = null) {
  return Object.entries(schema.primitives).flatMap(([primitive, base]) => {
    if (allowed && !allowed.includes(primitive)) return [];

    const adjustment = Object.entries(animalCounts).reduce((total, [animal, count]) => {
      return total + (schema.adjustments[animal]?.[primitive] ?? 0) * count;
    }, 0);

    return Array(base + adjustment).fill(primitive);
  });
}

function outstandingRequirements(schema, animalCounts, locations) {
  return Object.entries(animalCounts)
    .filter(([animal, count]) => count > 0 && schema.requirements[animal])
    .map(([animal]) => schema.requirements[animal])
    .filter(valid => !Object.values(locations).some(location => valid.includes(location)));
}

function generateLocations(schema, trajectory, animalCounts) {
  const labels = locationLabels(trajectory);
  const locations = {};

  labels.forEach((label, index) => {
    const remaining = labels.length - index;
    const outstanding = outstandingRequirements(schema, animalCounts, locations);

    let allowed = null;
    if (remaining === 1 && outstanding.length) {
      allowed = outstanding.reduce(
        (valid, requirement) => valid.filter(location => requirement.includes(location)),
        Object.keys(schema.primitives)
      );
    }

    locations[label] = pick(buildLocationPool(schema, animalCounts, allowed));
  });

  return locations;
}

function generateSettings(schema, locations) {
  return Object.fromEntries(
    Object.entries(locations).map(([label, primitive]) => {
      const pool = Object.entries(schema.settings)
        .filter(([, setting]) => setting.locations.includes(primitive))
        .map(([name]) => name);

      return [label, pick(pool)];
    })
  );
}

function describeSecondaries(counts) {
  return Object.entries(counts)
    .filter(([, count]) => count)
    .map(([type, count]) => `${count} ${type.replaceAll("_", " ")}${count > 1 ? "s" : ""}`)
    .join(", ");
}

function describeFriends(friends) {
  return friends
    .map(friend => `${friend.orientation} ${friend.sex} ${friend.role.replaceAll("_", " ")}`)
    .join(", ");
}

function describeLocations(trajectory, locations) {
  return trajectory
    .split("-")
    .map(label => `${label}: ${locations[label].replaceAll("_", " ")}`)
    .join(" → ");
}

function describeSettings(trajectory, settings) {
  return trajectory
    .split("-")
    .map(label => `${label}: ${settings[label].replaceAll("_", " ")}`)
    .join(" → ");
}

async function generateMovie() {
  const [primitives, secondary, location, setting] = await Promise.all([
    fetch("gen-jsons/plot-primitives.json").then(response => response.json()),
    fetch("gen-jsons/secondary-characters.json").then(response => response.json()),
    fetch("gen-jsons/location-primitives.json").then(response => response.json()),
    fetch("gen-jsons/settings.json").then(response => response.json())
  ]);

  const protagonistAge = resolve(pick(primitives.protagonist.age));
  const season = pick(primitives.season);
  const protagonistRelationship = pick(primitives.relationship);

  const relation = pick(primitives.male_counterpart.age_adjusters[ageBand(protagonistAge)]);
  const maleAge = protagonistAge + resolve(primitives.male_counterpart.age_offsets[relation]);
  const maleRelationship = pick(primitives.relationship);

  const protagonistAgeRepresentation =
    secondary.protagonist.age_representation[secondaryAgeBand(protagonistAge)];
  const protagonistSecondaries =
    generateSecondaries(secondary.protagonist, protagonistAgeRepresentation);
  const friends = generateFriends(protagonistSecondaries.friend, secondary.friend);
  const maleSecondaries = generateSecondaries(secondary.male_counterpart);

  const animalCounts = {
    horse: protagonistSecondaries.horse + maleSecondaries.horse,
    retriever: protagonistSecondaries.retriever + (maleSecondaries.retriever ?? 0)
  };

  const trajectory = pick(location.trajectory);
  const locations = generateLocations(location, trajectory, animalCounts);
  const settings = generateSettings(setting, locations);

  movie.innerHTML = `
    <p><strong>Protagonist:</strong> female, ${protagonistAge}, ${protagonistRelationship.replaceAll("_", " ")}</p>
    <p><strong>Her people:</strong> ${describeSecondaries(protagonistSecondaries)}</p>
    ${friends.length ? `<p><strong>Her friends:</strong> ${describeFriends(friends)}</p>` : ""}
    <p><strong>Male counterpart:</strong> ${maleAge}, ${relation.replaceAll("_", " ")}, ${maleRelationship.replaceAll("_", " ")}</p>
    <p><strong>His responsibility:</strong> ${describeSecondaries(maleSecondaries)}</p>
    <p><strong>Season:</strong> ${season.replaceAll("_", " ")}</p>
    <p><strong>Location trajectory:</strong> ${describeLocations(trajectory, locations)}</p>
    <p><strong>Settings:</strong> ${describeSettings(trajectory, settings)}</p>
  `;
}

generate.addEventListener("click", generateMovie);
