const sidebar_menu_items = document.querySelectorAll('.sidebar__menu-item')
// console.log(sidebar_menu_items)

sidebar_menu_items.forEach((sidebar_menu_item) => {
    sidebar_menu_item.addEventListener('click', (evt) => {
        const details = evt.target.querySelector('.sidebar__menu-details')
        details.open = !details.open;
    })
})