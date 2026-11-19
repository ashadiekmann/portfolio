import { fetchJSON, renderProjects, fetchGitHubData } from './global.js';

const projects = await fetchJSON('./lib/projects.json');
// the dashboard (project 0) is already in the spotlight, so show the next 3
const moreProjects = projects.slice(1, 4);

const projectsContainer = document.querySelector('.projects');

renderProjects(moreProjects, projectsContainer, 'h2');

const githubData = await fetchGitHubData('ashadiekmann');
const profileStats = document.querySelector('#profile-stats');

if (profileStats && githubData) {
  profileStats.innerHTML = `
    <h2>My GitHub Stats</h2>
    <dl>
      <dt>Public Repos:</dt><dd>${githubData.public_repos}</dd>
      <dt>Public Gists:</dt><dd>${githubData.public_gists}</dd>
      <dt>Followers:</dt><dd>${githubData.followers}</dd>
      <dt>Following:</dt><dd>${githubData.following}</dd>
    </dl>
  `;
}