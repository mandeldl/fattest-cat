#!/usr/bin/env node

const request         = require("request-promise");
const opener          = require("opener");
const Promise         = require("bluebird");
const cheerio         = require("cheerio");
const {uniq, compact} = require("lodash");
const colors          = require("colors");

const SFSPCA_BASE = "https://www.sfspca.org"
const ADOPTION_PAGE = `${SFSPCA_BASE}/adoptions/cats`;

const fetchCatsHelper = Promise.method((pageNumber, catsSoFar) => {
  const url = pageNumber === 0 ? ADOPTION_PAGE : `${ADOPTION_PAGE}?page=${pageNumber}`
  return request.get(url)
    .then((adoptionsPage) => {
      const cats = cheerio(adoptionsPage)
        .find("a")
        .filter((i, tag) => tag.attribs.href && tag.attribs.href.match(/adoptions\/pet-details\/\d+/))
        .map((i, tag) => `${SFSPCA_BASE}${tag.attribs.href}`)
        .toArray();
      if (!cats || cats.length === 0) {
        return catsSoFar;
      } else {
        return fetchCatsHelper(pageNumber + 1, catsSoFar.concat(cats));
      }
    })
    .catch((err) => {
      console.log("Error fetching cats:", err);
      return catsSoFar;
    });
});
const fetchCats = () => fetchCatsHelper(0, []);

console.log("Accessing San Francisco SPCA (Cat Department)...");

colors.setTheme({
  output: ["yellow", "bold"],
});

fetchCats()
  .then(uniq) // NO DOUBLE CATS
  .tap((cats) => console.log(`Cat information system accessed. ${cats.length} cats found. Beginning age-guessing process...`))
  .map((url) => {
    return request.get(url)
      // SPCA sometimes returns 403s for some cats, ignore this.
      .catch((err) => err)
      .then((catPage) => {
        const $ = cheerio.load(catPage);
        const name = $(".field-name-title h1").text();
        const age = $(".field-name-field-animal-age .field-item").text().trim();
        // const weight = $(".field-name-field-animal-weight .field-item").text();
        const years = Number(/(\d+)\D*(\d+)/.exec(age)[1]);
        const months = Number(/(\d+)\D*(\d+)/.exec(age)[2]);
        // const oz = /(\d+)oz\./.test(weight) ? Number(/(\d+)oz\./.exec(weight)[1]) : 0;
        const isFemale = $(".field-name-field-gender .field-item").text().trim() === "Female";

        console.log(`Guessing %s's age: ${years} years ${months} months`, colors.green(name));
        return {name, years, months, isFemale, url}
      })
      // Null for cats that cannot be parsed.
      .catch(() => {});
  })
  // Filter out unparsable cats.
  .then(compact)
  .then((cats) => {
    let oldestCat = {years: 0, months: 0};
    cats.forEach((cat) => {
      if (cat.years > oldestCat.years || (cat.years === oldestCat.years && cat.months > oldestCat.months)) {
        oldestCat = cat;
      }
    });
    console.log(`The oldest cat is ${colors.green.underline(oldestCat.name)}. ${(oldestCat.isFemale ? "She" : "He")} is ${oldestCat.years} years and ${oldestCat.months} months old.`.output);
    setTimeout(() => console.log("Opening cat profile..."), 2000);
    setTimeout(() => opener(oldestCat.url), 4000);
  });
