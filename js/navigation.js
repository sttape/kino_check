// navigation.js
// Внимание: данный файл является устаревшим остатком прототипа с вкладками (tabs).
// В многостраничной архитектуре проекта навигация осуществляется через стандартные ссылки <a href="..."> в header.

const tabs = document.querySelectorAll(".tab");
const buttons = document.querySelectorAll(".tab-btn");

if (tabs.length && buttons.length) {
    buttons.forEach(btn => {
        btn.addEventListener("click", () => {
            const tabId = btn.dataset.tab;
            tabs.forEach(t => t.classList.add("hidden"));
            const target = document.getElementById(tabId);
            if (target) target.classList.remove("hidden");
        });
    });
}
