export {initializeSidebar};

const sidebarId = 'sidebar';
const sidebarToggleThresholdsId = 'sidebar-toggle-thresholds';
const sidebarToggleDatasetsId = 'sidebar-toggle-datasets';
const sidebarThresholdsId = 'sidebar-thresholds';
const sidebarDatasetsId = 'sidebar-datasets';
const sidebarMinWidth = '64px';
const sidebarExpandedWidth = '25%';
const sidebarContentTransitionDuration = 300;

// The id of the div containing the current sidebar content.
let currentContentId;

/**
 * Initializes the sidebar menu (i.e. the toggles to open various sidebars).
 */
function initializeSidebar() {
  document.getElementById(sidebarToggleThresholdsId).onclick = () =>
    toggleSidebar(sidebarToggleThresholdsId, sidebarThresholdsId);
  document.getElementById(sidebarToggleDatasetsId).onclick = () =>
    toggleSidebar(sidebarToggleDatasetsId, sidebarDatasetsId);
}

/**
 * Toggles the appropriate sidebar view filled with the appropriate content.
 *
 * @param {string} toggleId the id of the div containing the toggle
 * @param {string} contentId the id of the div containing the new content
 */
function toggleSidebar(toggleId, contentId) {
  const sidebar = document.getElementById(sidebarId);

  if (currentContentId !== contentId) {
    if (currentContentId) {
      $('#' + currentContentId).fadeOut(sidebarContentTransitionDuration,
          () => $('#' + contentId).fadeIn(sidebarContentTransitionDuration));
    } else {
      sidebar.style.width = sidebarExpandedWidth;
      $('#' + contentId).fadeIn(sidebarContentTransitionDuration);
    }
    currentContentId = contentId;
  } else {
    // Collapse the sidebar because the current content is being toggled off.
    sidebar.style.width = sidebarMinWidth;
    $('#' + currentContentId).fadeOut(0);
    currentContentId = null;
  }
}
