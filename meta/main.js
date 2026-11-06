import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

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

    const xScale = d3
        .scaleTime()
        .domain(d3.extent(commits, (d) => d.datetime))
        .range([usableArea.left, usableArea.right]) // now uses the margins
        .nice();

    const yScale = d3
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
    const dots = svg.append('g').attr('class', 'dots');

    dots
        .selectAll('circle')
        .data(commits)
        .join('circle')
        .attr('cx', (d) => xScale(d.datetime))
        .attr('cy', (d) => yScale(d.hourFrac))
        .attr('r', 5)
        .attr('fill', 'steelblue');

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
}

let data = await loadData();
let commits = processCommits(data);

renderCommitInfo(data, commits);
renderScatterPlot(data, commits);

