const tabs = document.querySelectorAll(".tab");
const buttons = document.querySelectorAll(".tab-btn");

buttons.forEach(btn => {
    btn.addEventListener("click", () => {
        const tabId = btn.dataset.tab;
        tabs.forEach(t => t.classList.add("hidden"));
        document.getElementById(tabId).classList.remove("hidden");

        if (tabId === "list") renderMoviesTable();
        if (tabId === "wheel") initWheel();
    });
});
