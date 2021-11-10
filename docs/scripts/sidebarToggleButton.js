const sidebarToggleButton = document.querySelector('.sidebar-toggle__button')
const sidebarContainer = document.querySelector('.sidebar-container')
const contentContainer = document.querySelector('.content')

sidebarToggleButton.addEventListener('click', () => {
    sidebarContainer.classList.toggle('sidebar-container_hidden')
    if (sidebarContainer.classList.contains('sidebar-container_hidden')) {
        moveToContent()
    } else {
        moveToSidebar()
    }
})

const moveToSidebar = () => {
    sidebarContainer.append(sidebarToggleButton)
    sidebarToggleButton.classList.remove('sidebar-toggle__button_in-content')
    sidebarToggleButton.classList.add('sidebar-toggle__button_in-sidebar')
}
const moveToContent = () => {
    contentContainer.firstChild.before(sidebarToggleButton)
    sidebarToggleButton.classList.remove('sidebar-toggle__button_in-sidebar')
    sidebarToggleButton.classList.add('sidebar-toggle__button_in-content')
}