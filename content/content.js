// noinspection JSDeprecatedSymbols

console.log("content.js was activated")

chrome.runtime.onMessage.addListener(async function (request, sender, sendResponse) {
        console.log("content: received", request)
        if (request.type === "update-content") {
            await updateAllLinksOnPage()

            // Some pages load content later. Need to add a trigger to process the links later.
            if (location.href.startsWith("https://learning.oreilly.com/")) {
                // button to show the toc
                document.querySelectorAll("a.sbo-toc-thumb").forEach(a => {
                    a.addEventListener('click', () => updateAllLinksOnPage());
                })
            }

            if (location.href.startsWith("https://wiki.corp")) {
                const mutationObserver = new MutationObserver(function (mutationList, observer) {
                    // Use traditional 'for loops' for IE 11
                    for (const mutation of mutationList) {
                        if (mutation.type === 'childList') {
                            console.log('Wiki: Sidebar was loaded.');
                            updateAllLinksOnPage()
                        }
                    }
                })
                mutationObserver.observe(document.querySelector("div.plugin_pagetree_children"),
                    {childList: true, subtree: false})
            }

        }
    }
);

chrome.storage.local.onChanged.addListener(async function (changes, areaName) {
        console.log("chrome.storage.local.onChanged triggered")
        updateAllLinksOnPage();
    }
);


function shouldMarkLink(link, url, documentUrl) {
    if (url === "") {
        return false;
    }
    // a plain '#' is often used for buttons and menubars. Can be ignored.
    if (link.getAttribute("href") === "#") {
        return false;
    }

    if (url === documentUrl) {
        return true;
    }

    // ignore header links in the sidebar
    if (documentUrl.startsWith("https://experienceleague.adobe.com/") &&
        link.matches('#container [data-id="toc"] a[href^="#"]')) {
        return false;
    }
    let isSamePage = prepareUrl(url) === prepareUrl(documentUrl)
    if (isSamePage) {
        return true;
    }

    return true;
}


async function updateAllLinksOnPage() {
    let links = document.getElementsByTagName('a');

    console.log("found ", links.length, "links")
    for (let i = 0; i < links.length; i++) {
        const link = links[i];
        if (shouldMarkLink(link, link.href, location.href)) {
            let status = await getStatus(link.href)

            link.classList.remove("marked-as-done")
            link.classList.remove("marked-as-todo")
            link.classList.remove("marked-as-started")

            if (status !== "none") {
                link.classList.add("marked-as-" + status);
            }
        }
    }
}
