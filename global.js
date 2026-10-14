console.log("IT'S ALIVE!");

function $$(selector, context = document) {
    return Array.from(context.querySelectorAll(selector));
}

// let navLinks = $$("nav a");
// let currentLink = navLinks.find(
//     (a) => a.host === location.host && a.pathname === location.pathname
// );
// currentLink?.classList.add("current");

const BASE_PATH =
    location.hostname === "localhost" || location.hostname === "127.0.0.1"
        ? "/"            // running locally with Live Server
        : "/portfolio/"; // running on GitHub Pages

let pages = [
    { url: "", title: "Home" },
    { url: "projects/", title: "Projects" },
    { url: "contact/", title: "Contact" },
    { url: "resume/", title: "Resume" },
    { url: "https://github.com/ashadiekmann", title: "GitHub" },
];

let nav = document.createElement("nav");
document.body.prepend(nav);

for (let p of pages) {
    let url = p.url;
    let title = p.title;
    url = !url.startsWith("http") ? BASE_PATH + url : url;
    let a = document.createElement("a");
    a.href = url;
    a.textContent = title;
    a.classList.toggle(
        "current",
        a.host === location.host && a.pathname === location.pathname
    );
    if (a.host !== location.host) {
        a.target = "_blank";
    }
    nav.append(a);
}

document.body.insertAdjacentHTML(
    "afterbegin",
    `
     <label class="color-scheme">
       Theme:
       <select>
         <option value="light dark">Automatic</option>
         <option value="light">Light</option>
         <option value="dark">Dark</option>
       </select>
     </label>`
);

let select = document.querySelector(".color-scheme select");

function setColorScheme(colorScheme) {
    document.documentElement.style.setProperty("color-scheme", colorScheme);
    select.value = colorScheme;
}

// When the page loads, use the saved choice if there is one
if ("colorScheme" in localStorage) {
    setColorScheme(localStorage.colorScheme);
}

// When the user picks an option, apply it and save it
select.addEventListener("input", function (event) {
    setColorScheme(event.target.value);
    localStorage.colorScheme = event.target.value;
});

let form = document.querySelector("form");

form?.addEventListener("submit", function (event) {
    event.preventDefault();

    let data = new FormData(form);
    let url = form.action + "?";

    for (let [name, value] of data) {
        url += name + "=" + encodeURIComponent(value) + "&";
    }

    location.href = url;
});