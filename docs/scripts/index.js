
fetch('https://api.github.com/repos/staniska/cnc-subroutines/contents/sinumerik/dmg_ctx_510_ecoline/CORNER.SPF')
    .then(response => response.json())
    .then(result => console.log(atob(result.content))/* обрабатываем результат */)
