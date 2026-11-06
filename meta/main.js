import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
// declared out here so the brush functions can use them too
let xScale;
let yScale;

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
        });
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

function renderScatterPlot(data, commits) {
    const width = 1000;
    const height = 600;

    // space around the chart for the axes
    const margin = { top: 10, right: 10, bottom: 30, left: 20 };

    // the part of the svg inside the margins
    const usableArea = {
        top: margin.top,
        right: width - margin.right,
        bottom: height - margin.bottom,
        left: margin.left,
        width: width - margin.left - margin.right,
        height: height - margin.top - margin.bottom,
    };

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
    const rScale = d3
        .scaleSqrt() // sqrt so the AREA matches the number of lines (not the radius)
        .domain([minLines, maxLines])
        .range([2, 30]);

    // sort biggest first so small dots get drawn on top and are still hoverable
    const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

    const dots = svg.append('g').attr('class', 'dots');

    dots
        .selectAll('circle')
        .data(sortedCommits) // use the sorted list now
        .join('circle')
        .attr('cx', (d) => xScale(d.datetime))
        .attr('cy', (d) => yScale(d.hourFrac))
        .attr('r', (d) => rScale(d.totalLines)) // size from the scale instead of 5
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

    // axes
    const xAxis = d3.axisBottom(xScale);
    const yAxis = d3
        .axisLeft(yScale)
        .tickFormat((d) => String(d % 24).padStart(2, '0') + ':00'); // 9 -> "09:00", 24 -> "00:00"

    // x axis at the bottom
    svg
        .append('g')
        .attr('transform', `translate(0, ${usableArea.bottom})`)
        .call(xAxis);

    // y axis on the left
    svg
        .append('g')
        .attr('transform', `translate(${usableArea.left}, 0)`)
        .call(yAxis);
    // brushing
    createBrushSelector(svg);
}

function renderTooltipContent(commit) {
    const link = document.getElementById('commit-link');
    const date = document.getElementById('commit-date');
    const time = document.getElementById('commit-time');
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
        ? commits.filter((d) => isCommitSelected(selection, d))
        : [];

    const countElement = document.querySelector('#selection-count');
    // 0 is falsy, so 0 commits shows "No commits selected"
    countElement.textContent = `${selectedCommits.length || 'No'} commits selected`;

    return selectedCommits;
}

function renderLanguageBreakdown(selection) {
    const selectedCommits = selection
        ? commits.filter((d) => isCommitSelected(selection, d))
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

let data = await loadData();
let commits = processCommits(data);

renderCommitInfo(data, commits);
renderScatterPlot(data, commits);

