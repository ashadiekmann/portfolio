import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import { fetchJSON, renderProjects } from '../global.js';

const projects = await fetchJSON('../lib/projects.json');

const projectsContainer = document.querySelector('.projects');

renderProjects(projects, projectsContainer, 'h2');

const projectsTitle = document.querySelector('.projects-title');
projectsTitle.textContent = `${projects.length} Projects`;

// arc generator: a function that turns start/end angles into a path "d" string
// innerRadius 0 = solid pie (a bigger number would make a donut)
let arcGenerator = d3.arc().innerRadius(0).outerRadius(50);

// a color scale: give it an index, it gives back a color from the Tableau 10 palette
let colors = d3.scaleOrdinal(d3.schemeTableau10);

let legend = d3.select('.legend');

// shared filter state, so the search and the pie clicks can see each other's filter
let query = '';
// which slice is selected; -1 means none
let selectedIndex = -1;
// the selected slice's YEAR (its index can change when the pie is redrawn, the year can't)
let selectedYear = null;

// EC fix: keep only projects that match the current search query
function filterByQuery(projectsGiven) {
    return projectsGiven.filter((project) => {
        let values = Object.values(project).join('\n').toLowerCase();
        return values.includes(query.toLowerCase());
    });
}

// EC fix: keep only projects from the selected year (or all of them if nothing is selected)
function filterByYear(projectsGiven) {
    if (selectedYear === null) return projectsGiven;
    return projectsGiven.filter((project) => project.year === selectedYear);
}

// Refactor all plotting into one function, so the pie can be redrawn for any list of projects
function renderPieChart(projectsGiven) {
    // re-calculate rolled data: count projects per year
    let newRolledData = d3.rollups(
        projectsGiven,
        (v) => v.length,
        (d) => d.year,
    );

    // re-calculate data: turn each [year, count] pair into { value, label }
    let newData = newRolledData.map(([year, count]) => {
        return { value: count, label: year };
    });

    // EC fix: find where the selected year sits in this new pie
    // (-1 if the search removed that year, so the selection is cleared)
    selectedIndex = newData.findIndex((d) => d.label === selectedYear);
    if (selectedIndex === -1) selectedYear = null;

    // re-calculate slice generator, arc data, and arcs
    let newSliceGenerator = d3.pie().value((d) => d.value);
    let newArcData = newSliceGenerator(newData);
    let newArcs = newArcData.map((d) => arcGenerator(d));

    // clear old slices and legend items so they don't stack up on every redraw
    let newSVG = d3.select('svg');
    newSVG.selectAll('path').remove();
    legend.selectAll('li').remove();

    // draw one <path> per slice, each one clickable
    newArcs.forEach((arc, i) => {
        newSVG
            .append('path')
            .attr('d', arc)
            .attr('fill', colors(i))
            // EC fix: keep the highlight after a redraw
            .attr('class', i === selectedIndex ? 'selected' : '')
            .on('click', () => {
                // clicking the selected slice again deselects it (-1), otherwise select this one
                selectedIndex = selectedIndex === i ? -1 : i;
                // EC fix: remember the year, not just the position
                selectedYear = selectedIndex === -1 ? null : newData[selectedIndex].label;

                // give only the selected slice the 'selected' class
                newSVG
                    .selectAll('path')
                    .attr('class', (_, idx) => (idx === selectedIndex ? 'selected' : ''));

                // same for the legend (keep 'legend-item' so the layout styles still apply)
                legend
                    .selectAll('li')
                    .attr('class', (_, idx) =>
                        idx === selectedIndex ? 'legend-item selected' : 'legend-item',
                    );

                // EC fix: apply BOTH filters (search first, then year) instead of starting from all projects
                renderProjects(filterByYear(filterByQuery(projects)), projectsContainer, 'h2');
            });
    });

    // build one <li> per slice
    newData.forEach((d, idx) => {
        legend
            .append('li')
            // pass this slice's color to CSS as a variable called --color
            .attr('style', `--color:${colors(idx)}`)
            // EC fix: keep the legend highlight after a redraw
            .attr('class', idx === selectedIndex ? 'legend-item selected' : 'legend-item')
            // a swatch span, then the label and the value in parentheses
            .html(`<span class="swatch"></span> ${d.label} <em>(${d.value})</em>`);
    });
}

// Call this function on page load
renderPieChart(projects);

// search bar
let searchInput = document.querySelector('.searchBar');

searchInput.addEventListener('change', (event) => {
    // update query value
    query = event.target.value;
    // projects that match the search
    let searchedProjects = filterByQuery(projects);
    // the pie shows every search match, so you can still pick any year in the results
    renderPieChart(searchedProjects);
    // EC fix: the project list applies the year filter on top of the search
    renderProjects(filterByYear(searchedProjects), projectsContainer, 'h2');
});