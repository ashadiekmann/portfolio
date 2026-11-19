import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

// declared out here so the brush and update functions can use them too
let xScale;
let yScale;
let rScale;

let commitProgress = 100;
let timeScale;
let commitMaxTime;
let filteredCommits;

const colors = d3.scaleOrdinal(d3.schemeTableau10);

async function loadData() {
    // d3.csv reads everything as strings, so convert numbers and dates here
    const data = await d3.csv('loc.csv', (row) => ({
        ...row, // keep all the original columns
        line: Number(row.line),
        depth: Number(row.depth),
        length: Number(row.length),
        date: new Date(row.date + 'T00:00' + row.timezone),
        datetime: new Date(row.datetime),
    }));

    return data;
}

function processCommits(data) {
    return d3
        .groups(data, (d) => d.commit) // groups lines by commit -> [commitId, [lines]]
        .map(([commit, lines]) => {
            // every line in a commit has the same author/date/etc, so just use the first one
            let first = lines[0];
            let { author, date, time, timezone, datetime } = first;

            let ret = {
                id: commit,
                url: 'https://github.com/ashadiekmann/portfolio/commit/' + commit,
                author,
                date,
                time,
                timezone,
                datetime,
                // time as a decimal, ex: 2:30pm = 14.5
                hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
                totalLines: lines.length,
            };

            // add lines as a hidden property so it doesnt clutter console.log
            Object.defineProperty(ret, 'lines', {
                value: lines,
                enumerable: false, // hidden when printing
                writable: false,
                configurable: false,
            });

            return ret;
        })
        // loc.csv is in file order not time order, so sort oldest -> newest for the story
        .sort((a, b) => a.datetime - b.datetime);
}

function renderCommitInfo(data, commits) {
    // make the <dl> inside #stats
    const dl = d3.select('#stats').append('dl').attr('class', 'stats');

    // total lines of code
    dl.append('dt').html('Total <abbr title="Lines of code">LOC</abbr>');
    dl.append('dd').text(data.length);

    // total commits
    dl.append('dt').text('Total commits');
    dl.append('dd').text(commits.length);

    // number of files (count the distinct file names)
    dl.append('dt').text('Files');
    dl.append('dd').text(d3.group(data, (d) => d.file).size);

    // avg file length: get the longest line number in each file, then average them
    const fileLengths = d3.rollups(
        data,
        (v) => d3.max(v, (d) => d.line),
        (d) => d.file,
    );
    const avgFileLength = d3.mean(fileLengths, (d) => d[1]);
    dl.append('dt').text('Avg file length');
    dl.append('dd').text(Math.round(avgFileLength) + ' lines');

    // max depth
    dl.append('dt').text('Max depth');
    dl.append('dd').text(d3.max(data, (d) => d.depth));

    // time of day with the most work (morning, afternoon, etc)
    const workByPeriod = d3.rollups(
        data,
        (v) => v.length,
        (d) => new Date(d.datetime).toLocaleString('en', { dayPeriod: 'short' }),
    );
    const maxPeriod = d3.greatest(workByPeriod, (d) => d[1])?.[0]; // ?.[0] grabs the period name
    dl.append('dt').text('Most work done');
    dl.append('dd').text(maxPeriod);
}

// moved these out of renderScatterPlot so updateScatterPlot can use them too

const width = 1000;
const height = 600;
const margin = { top: 10, right: 10, bottom: 30, left: 20 };
const usableArea = {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
};

// draws the dots, used by renderScatterPlot and updateScatterPlot
function drawDots(svg, commits) {
    // sort biggest first so small dots get drawn on top and are still hoverable
    const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

    svg
        .select('g.dots')
        .selectAll('circle')
        // key by id so each commit keeps its own circle (otherwise dots jump around)
        .data(sortedCommits, (d) => d.id)
        .join('circle')
        .attr('cx', (d) => xScale(d.datetime))
        .attr('cy', (d) => yScale(d.hourFrac))
        .attr('r', (d) => rScale(d.totalLines))
        // send radius to css so big dots grow slower (see circle transition)
        .style('--r', (d) => rScale(d.totalLines))
        .attr('fill', 'steelblue')
        .style('fill-opacity', 0.7) // see through so overlapping dots show
        .on('mouseenter', (event, commit) => {
            d3.select(event.currentTarget).style('fill-opacity', 1); // solid when hovered
            renderTooltipContent(commit);
            updateTooltipVisibility(true);
            updateTooltipPosition(event);
        })
        .on('mouseleave', (event) => {
            d3.select(event.currentTarget).style('fill-opacity', 0.7); // back to see through
            updateTooltipVisibility(false);
        });
}

function renderScatterPlot(data, commits) {

    const svg = d3
        .select('#chart')
        .append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .style('overflow', 'visible');

    xScale = d3
        .scaleTime()
        .domain(d3.extent(commits, (d) => d.datetime))
        .range([usableArea.left, usableArea.right]) // now uses the margins
        .nice();

    yScale = d3
        .scaleLinear()
        .domain([0, 24])
        .range([usableArea.bottom, usableArea.top]); // now uses the margins

    // gridlines go first so they're behind the dots
    const gridlines = svg
        .append('g')
        .attr('class', 'gridlines')
        .attr('transform', `translate(${usableArea.left}, 0)`);

    // gridlines = an axis with no labels and super long ticks
    gridlines.call(d3.axisLeft(yScale).tickFormat('').tickSize(-usableArea.width));

    // dots
    // radius scale: more lines edited = bigger dot
    const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
    rScale = d3
        .scaleSqrt() // sqrt so the AREA matches the number of lines (not the radius)
        .domain([minLines, maxLines])
        .range([2, 30]);

    svg.append('g').attr('class', 'dots');
    drawDots(svg, commits);

    // axes
    const xAxis = d3.axisBottom(xScale);
    const yAxis = d3
        .axisLeft(yScale)
        .tickFormat((d) => String(d % 24).padStart(2, '0') + ':00'); // 9 -> "09:00", 24 -> "00:00"

    // x axis at the bottom
    svg
        .append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0, ${usableArea.bottom})`)
        .call(xAxis);

    // y axis on the left
    svg
        .append('g')
        .attr('class', 'y-axis')
        .attr('transform', `translate(${usableArea.left}, 0)`)
        .call(yAxis);
    // brushing
    createBrushSelector(svg);
}

// step 1.2: update the chart thats already there instead of making a new svg
function updateScatterPlot(data, commits) {
    const svg = d3.select('#chart').select('svg');

    xScale.domain(d3.extent(commits, (d) => d.datetime)).nice();

    const xAxis = d3.axisBottom(xScale);
    const xAxisGroup = svg.select('g.x-axis');
    xAxisGroup.selectAll('*').remove();
    xAxisGroup.call(xAxis);

    drawDots(svg, commits);
}

function renderTooltipContent(commit) {
    const link = document.getElementById('commit-link');
    const date = document.getElementById('commit-date');
    const time = document.getElementById('commit-time-tooltip');
    const author = document.getElementById('commit-author');
    const lines = document.getElementById('commit-lines');

    if (Object.keys(commit).length === 0) return; // nothing to show

    link.href = commit.url;
    link.textContent = commit.id;
    date.textContent = commit.datetime?.toLocaleString('en', { dateStyle: 'full' });
    time.textContent = commit.datetime?.toLocaleString('en', { timeStyle: 'short' });
    author.textContent = commit.author;
    lines.textContent = commit.totalLines;
}

function updateTooltipVisibility(isVisible) {
    const tooltip = document.getElementById('commit-tooltip');
    tooltip.hidden = !isVisible;
}

function updateTooltipPosition(event) {
    const tooltip = document.getElementById('commit-tooltip');
    // clientX/Y = where the mouse is on the screen
    tooltip.style.left = `${event.clientX}px`;
    tooltip.style.top = `${event.clientY}px`;
}

function createBrushSelector(svg) {
    // brushed() runs whenever the brush starts, moves, or ends
    svg.call(d3.brush().on('start brush end', brushed));

    // move the dots back on top of the brush overlay so hovering still works
    svg.selectAll('.dots, .overlay ~ *').raise();
}

function isCommitSelected(selection, commit) {
    if (!selection) {
        return false;
    }
    // corners of the brush rectangle
    const [[x0, y0], [x1, y1]] = selection;
    // where this commit's dot is on the screen
    const x = xScale(commit.datetime);
    const y = yScale(commit.hourFrac);
    // inside the box?
    return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

function renderSelectionCount(selection) {
    // the commits inside the brush (empty if no brush)
    const selectedCommits = selection
        ? filteredCommits.filter((d) => isCommitSelected(selection, d))
        : [];

    const countElement = document.querySelector('#selection-count');
    // 0 is falsy, so 0 commits shows "No commits selected"
    countElement.textContent = `${selectedCommits.length || 'No'} commits selected`;

    return selectedCommits;
}

function renderLanguageBreakdown(selection) {
    const selectedCommits = selection
        ? filteredCommits.filter((d) => isCommitSelected(selection, d))
        : [];
    const container = document.getElementById('language-breakdown');

    // nothing selected = clear it and stop
    if (selectedCommits.length === 0) {
        container.innerHTML = '';
        return;
    }

    // all the lines from the selected commits (uses the hidden lines property!)
    const lines = selectedCommits.flatMap((d) => d.lines);

    // count lines per language (type = html, css, js)
    const breakdown = d3.rollup(
        lines,
        (v) => v.length,
        (d) => d.type,
    );

    container.innerHTML = '';

    for (const [language, count] of breakdown) {
        const proportion = count / lines.length;
        const formatted = d3.format('.1~%')(proportion); // ex: 0.452 -> "45.2%"

        container.innerHTML += `
      <dt>${language}</dt>
      <dd>${count} lines (${formatted})</dd>
    `;
    }
}

function brushed(event) {
    const selection = event.selection;
    d3.selectAll('circle').classed('selected', (d) =>
        isCommitSelected(selection, d),
    );
    renderSelectionCount(selection);
    renderLanguageBreakdown(selection);
}

// step 2: one dot per line of code, grouped by file
function updateFileDisplay(filteredCommits) {
    const lines = filteredCommits.flatMap((d) => d.lines);

    // biggest file first
    const files = d3
        .groups(lines, (d) => d.file)
        .map(([name, lines]) => ({ name, lines, type: lines[0].type }))
        .sort((a, b) => b.lines.length - a.lines.length);

    // ":scope >" = only direct children, otherwise it also grabs the .loc dots inside
    const filesContainer = d3
        .select('#files')
        .selectAll(':scope > div')
        .data(files, (d) => d.name)
        .join((enter) =>
            enter.append('div').call((div) => {
                const dt = div.append('dt');
                dt.append('code');
                dt.append('small');
                div.append('dd');
            }),
        )
        .attr('style', (d) => `--color: ${colors(d.type)}`);

    filesContainer.select('dt > code').text((d) => d.name);
    filesContainer.select('dt > small').text((d) => `${d.lines.length} lines`);

    filesContainer
        .select('dd')
        .selectAll('div')
        .data((d) => d.lines)
        .join('div')
        .attr('class', 'loc');
}

const slider = document.getElementById('commit-progress');
const timeElement = document.getElementById('commit-time');

// slider and scrolling both call this
function updateForTime() {
    timeElement.textContent = commitMaxTime.toLocaleString('en', {
        dateStyle: 'long',
        timeStyle: 'short',
    });
    filteredCommits = commits.filter((d) => d.datetime <= commitMaxTime);
    updateScatterPlot(data, filteredCommits);
    updateFileDisplay(filteredCommits);
}

function onTimeSliderChange() {
    commitProgress = Number(slider.value);
    commitMaxTime = timeScale.invert(commitProgress); // 0-100 -> date
    updateForTime();
}

// for scrolling: go to a date and move the slider to match
function setMaxTime(date) {
    commitMaxTime = date;
    commitProgress = timeScale(date);
    slider.value = commitProgress;
    updateForTime();
}

// step 3.2: one chunk of text per commit
function renderScatterStory(commits) {
    d3.select('#scatter-story')
        .selectAll('.step')
        .data(commits)
        .join('div')
        .attr('class', 'step')
        .html(
            (d, i) => `
		On ${d.datetime.toLocaleString('en', {
            dateStyle: 'full',
            timeStyle: 'short',
        })},
		I made <a href="${d.url}" target="_blank">${
            i > 0 ? 'another glorious commit' : 'my first commit, and it was glorious'
        }</a>.
		I edited ${d.totalLines} lines across ${
            d3.rollups(d.lines, (D) => D.length, (d) => d.file).length
        } files.
		Then I looked over all I had made, and I saw that it was very good.
	`,
        );
}

// step 4: same thing but for the file dots
function renderFilesStory(commits) {
    d3.select('#files-story')
        .selectAll('.step')
        .data(commits)
        .join('div')
        .attr('class', 'step')
        .html((d) => {
            const touched = d3
                .rollups(d.lines, (v) => v.length, (l) => l.file)
                .sort((a, b) => b[1] - a[1])
                .map(([file, n]) => `<code>${file}</code> (${n})`)
                .join(', ');
            const linesSoFar = d3.sum(
                commits.filter((c) => c.datetime <= d.datetime),
                (c) => c.totalLines,
            );
            return `
		By ${d.datetime.toLocaleString('en', { dateStyle: 'long' })}, the site had
		<strong>${linesSoFar}</strong> lines of code.
		This <a href="${d.url}" target="_blank">commit</a> added ${d.totalLines} lines to ${touched}.
	`;
        });
}

let data = await loadData();
let commits = processCommits(data);
filteredCommits = commits;

timeScale = d3
    .scaleTime()
    .domain([d3.min(commits, (d) => d.datetime), d3.max(commits, (d) => d.datetime)])
    .range([0, 100]);
commitMaxTime = timeScale.invert(commitProgress);

renderCommitInfo(data, commits);
renderScatterPlot(data, commits);
renderScatterStory(commits);
renderFilesStory(commits);

slider.addEventListener('input', onTimeSliderChange);
onTimeSliderChange(); // run once on page load

// step 3.3: scrolling to a step updates the chart
function onStepEnter(response) {
    // __data__ is the commit d3 attached to that step
    setMaxTime(response.element.__data__.datetime);
}

const scroller = scrollama();
scroller
    .setup({
        container: '#scrolly-1',
        step: '#scrolly-1 .step',
    })
    .onStepEnter(onStepEnter);

// step 4
const filesScroller = scrollama();
filesScroller
    .setup({
        container: '#scrolly-2',
        step: '#scrolly-2 .step',
    })
    .onStepEnter(onStepEnter);