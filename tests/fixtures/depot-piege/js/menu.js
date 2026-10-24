// Menu ouvert en JavaScript : un motif qui remplace du CSS (lot 2)
const bouton = document.querySelector(".burger");
bouton.addEventListener("click", () => document.querySelector(".menu").classList.toggle("ouvert"));
